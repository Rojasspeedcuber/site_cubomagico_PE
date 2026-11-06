import { z } from 'zod';
import { query, transaction, type Db } from './db.ts';
import { rateLimit } from './auth.ts';
import { authenticated, HttpError, requireOrigin, type User } from './policy.ts';
import { mailEnabled } from './mail.ts';
import { body, parse, uuid } from './validation.ts';

export type NotificationKind = 'VIDEO_REQUEST' | 'SUBMISSION_REVIEW';
const kindSchema = z.enum(['VIDEO_REQUEST', 'SUBMISSION_REVIEW']);
const targetSchema = z.string().max(80).refine(value => {
  const parts = value.split(':');
  return parts.length <= 2 && uuid.safeParse(parts[0]).success && (parts.length === 1 || /^[1-9][0-9]{0,19}$/.test(parts[1]));
}, 'Identificador de notificação inválido.');

// The caller owns the transaction. No recipient, private content or URL is copied.
export async function enqueueNotification(db: Db, userId: string, kind: NotificationKind, targetId: string, eventId: string): Promise<void> {
  const values = [parse(uuid, userId), parse(kindSchema, kind), parse(targetSchema, targetId), parse(uuid, eventId)];
  await query(`INSERT INTO notification_outbox(user_id,kind,target_id,event_id)
    SELECT id,$2,$3,$4 FROM users WHERE id=$1 AND notifications_enabled=true
    ON CONFLICT(user_id,kind,target_id) DO NOTHING`, values, db);
}

const preferencesSchema = z.object({ enabled: z.boolean() }).strict();
const defaults = { query, transaction, rateLimit, mailEnabled, appUrl: () => process.env.APP_URL || 'http://localhost:3000' };
const json = (row: any, configured: boolean) => Response.json({ data: {
  enabled: row.notifications_enabled === true, mailEnabled: configured, verified: Boolean(row.email_verified_at),
} }, { headers: { 'Cache-Control': 'no-store' } });

export function createNotificationsHandler(overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request, user: User | null): Promise<Response | null> => {
    if (new URL(request.url).pathname !== '/api/notifications/preferences' || !['GET', 'PATCH'].includes(request.method)) return null;
    const actor = authenticated(user);
    if (request.method === 'GET') {
      const [row] = await deps.query('SELECT notifications_enabled,email_verified_at FROM users WHERE id=$1', [actor.id]);
      if (!row) throw new HttpError(401, 'Entre novamente na sua conta.');
      return json(row, deps.mailEnabled());
    }
    requireOrigin(request, deps.appUrl());
    await deps.rateLimit(`notifications:preferences:${actor.id}`, 30);
    const data = parse(preferencesSchema, await body(request));
    const row = await deps.transaction(async db => {
      const [account] = await deps.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.id], db);
      if (!account) throw new HttpError(401, 'Entre novamente na sua conta.');
      const [updated] = await deps.query('UPDATE users SET notifications_enabled=$1 WHERE id=$2 RETURNING notifications_enabled,email_verified_at', [data.enabled, actor.id], db);
      if (!data.enabled) await deps.query("UPDATE notification_outbox SET status='CANCELLED',updated_at=clock_timestamp() WHERE user_id=$1 AND status IN ('PENDING','RETRY','SENDING')", [actor.id], db);
      return updated;
    });
    return json(row, deps.mailEnabled());
  };
}

export const handleNotifications: (request: Request, user: User | null) => Promise<Response | null> = createNotificationsHandler();
