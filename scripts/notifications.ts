import { pathToFileURL } from 'node:url';
import { pool, query } from '../lib/db.ts';
import { mailEnabled, sendMail } from '../lib/mail.ts';
import type { NotificationKind } from '../lib/notifications.ts';
import { parse, uuid } from '../lib/validation.ts';

export type NotificationOptions = { mode: 'dry-run' | 'send'; limit?: number };
const usage = 'Uso: npx tsx scripts/notifications.ts --dry-run | --send [--limit=1..100]';
export function parseNotificationArgs(args: string[]): Required<NotificationOptions> {
  if (args.length < 1 || args.length > 2 || !['--dry-run', '--send'].includes(args[0]) || (args[1] && !/^--limit=([1-9][0-9]?)$|^--limit=100$/.test(args[1]))) throw new Error(usage);
  return { mode: args[0] === '--send' ? 'send' : 'dry-run', limit: args[1] ? Number(args[1].slice(8)) : 20 };
}

const defaults = { query, connect: () => pool.connect(), mailEnabled, sendMail, appUrl: () => process.env.APP_URL };
function notificationOrigin(value: string | undefined): string {
  try {
    const url = new URL(value!);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error();
    return url.origin;
  } catch { throw new Error('Configure APP_URL com a origem HTTPS do site, sem credenciais, caminho ou parâmetros.'); }
}

export function notificationMessage(kind: NotificationKind, eventId: string, appUrl: string) {
  const link = new URL(`/campeonatos/${parse(uuid, eventId)}`, notificationOrigin(appUrl));
  if (!['VIDEO_REQUEST', 'SUBMISSION_REVIEW'].includes(kind)) throw new Error('Tipo de notificação inválido.');
  return {
    subject: kind === 'VIDEO_REQUEST' ? 'Solicitação de vídeo — Cubo Mágico PE' : 'Seu envio foi revisado — Cubo Mágico PE',
    text: `${kind === 'VIDEO_REQUEST' ? 'A organização solicitou um vídeo para sua participação.' : 'Há uma atualização na revisão do seu envio.'}\nEntre na sua conta para consultar os detalhes do campeonato:\n${link.href}\n\nVocê recebe este aviso porque ativou notificações por e-mail. Para desativar, acesse a área da conta no site.`,
  };
}

export async function runNotifications(options: NotificationOptions, overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides };
  const limit = options.limit ?? 20;
  if (!['dry-run', 'send'].includes(options.mode) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(usage);
  if (options.mode === 'send' && !deps.mailEnabled()) throw new Error('Envio de e-mail não configurado. Configure RESEND_API_KEY e MAIL_FROM.');
  const appOrigin = options.mode === 'send' ? notificationOrigin(deps.appUrl()) : null;
  const report = { dryRun: options.mode === 'dry-run', locked: false, selected: 0, eligible: 0, deferred: 0, cancelled: 0, sent: 0, retried: 0, failed: 0 };
  const db = await deps.connect();
  let locked = false;
  let destroy = false;
  // One durable claim per message; a crash must not silently replay an uncertain send.
  async function inTransaction<T>(run: () => Promise<T>): Promise<T> {
    await deps.query('BEGIN', [], db);
    try {
      const result = await run();
      await deps.query('COMMIT', [], db);
      return result;
    } catch (error) {
      try { await deps.query('ROLLBACK', [], db); } catch { destroy = true; }
      throw error;
    }
  }
  async function accountAndJob(candidate: any, recipient = false) {
    // Match preferences/account deletion: user first, then outbox. Keep this
    // account lock through the network call so a completed opt-out cannot race it.
    const [account] = await deps.query(`SELECT ${recipient ? 'email,' : ''}notifications_enabled,email_verified_at FROM users WHERE id=$1 FOR UPDATE`, [candidate.user_id], db);
    const [job] = await deps.query('SELECT id,kind,event_id,status,attempts,next_attempt_at<=clock_timestamp() AS due FROM notification_outbox WHERE id=$1 AND user_id=$2 FOR UPDATE', [candidate.id, candidate.user_id], db);
    return { account, job };
  }
  async function cancel(jobId: string) {
    await deps.query("UPDATE notification_outbox SET status='CANCELLED',updated_at=clock_timestamp() WHERE id=$1", [jobId], db);
  }
  async function defer(jobId: string, claimed = false) {
    await deps.query(`UPDATE notification_outbox SET status='PENDING',${claimed ? 'attempts=attempts-1,' : ''}next_attempt_at=clock_timestamp()+interval '1 hour',updated_at=clock_timestamp() WHERE id=$1`, [jobId], db);
  }
  try {
    const [lock] = await deps.query('SELECT pg_try_advisory_lock(1865264834) AS locked', [], db);
    locked = lock.locked === true;
    if (!locked) return { ...report, locked: true };
    const candidates = await deps.query(`SELECT n.id,n.user_id,u.notifications_enabled,u.email_verified_at
      FROM notification_outbox n JOIN users u ON u.id=n.user_id
      WHERE n.status IN ('PENDING','RETRY') AND n.attempts<3 AND n.next_attempt_at<=clock_timestamp()
      ORDER BY n.next_attempt_at,n.created_at,n.id LIMIT $1`, [limit], db);
    report.selected = candidates.length;
    for (const candidate of candidates) {
      if (options.mode === 'dry-run') {
        if (!candidate.notifications_enabled) report.cancelled++;
        else if (!candidate.email_verified_at) report.deferred++;
        else report.eligible++;
        continue;
      }
      const claimed = await inTransaction(async () => {
        const { account, job } = await accountAndJob(candidate);
        if (!account || !job || !['PENDING', 'RETRY'].includes(job.status) || job.attempts >= 3 || !job.due) return false;
        if (!account.notifications_enabled) { await cancel(job.id); report.cancelled++; return false; }
        if (!account.email_verified_at) { await defer(job.id); report.deferred++; return false; }
        await deps.query("UPDATE notification_outbox SET status='SENDING',attempts=attempts+1,updated_at=clock_timestamp() WHERE id=$1", [job.id], db);
        return true;
      });
      if (!claimed) continue;
      await inTransaction(async () => {
        const { account, job } = await accountAndJob(candidate, true);
        if (!account || !job || job.status !== 'SENDING') return;
        if (!account.notifications_enabled) { await cancel(job.id); report.cancelled++; return; }
        if (!account.email_verified_at) { await defer(job.id, true); report.deferred++; return; }
        report.eligible++;
        const message = notificationMessage(job.kind, job.event_id, appOrigin!);
        try {
          await deps.sendMail({ to: account.email, ...message });
        } catch {
          const terminal = job.attempts >= 3;
          await deps.query(`UPDATE notification_outbox SET status=$2,last_error='MAIL_DELIVERY_FAILED',next_attempt_at=clock_timestamp()+interval '15 minutes',updated_at=clock_timestamp() WHERE id=$1`, [job.id, terminal ? 'FAILED' : 'RETRY'], db);
          if (terminal) report.failed++; else report.retried++;
          return;
        }
        await deps.query("UPDATE notification_outbox SET status='SENT',sent_at=clock_timestamp(),last_error=NULL,updated_at=clock_timestamp() WHERE id=$1", [job.id], db);
        report.sent++;
      });
    }
    return report;
  } finally {
    if (locked) {
      try { await deps.query('SELECT pg_advisory_unlock(1865264834)', [], db); }
      catch { destroy = true; }
    }
    db.release(destroy);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseNotificationArgs(process.argv.slice(2));
    await import('../lib/env.ts');
    if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL antes de executar notificações.');
    pool.options.connectionString = process.env.DATABASE_URL;
    const report = await runNotifications(options);
    console.log(JSON.stringify(report));
    if (report.failed || report.retried || report.locked) process.exitCode = 1;
  } catch (error) {
    // No SQL, addresses, provider responses or credentials in CLI logs.
    console.error(error instanceof Error && (error.message === usage || error.message.startsWith('Configure ') || error.message.startsWith('Envio de e-mail não configurado.'))
      ? error.message : 'Falha ao processar notificações. Consulte a fila de forma segura.');
    process.exitCode = 1;
  } finally { await pool.end(); }
}
