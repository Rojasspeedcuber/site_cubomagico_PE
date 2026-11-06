import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { query, transaction } from './db.ts';
import { hashPassword, rateLimit, tokenHash, sessionCookie } from './auth.ts';
import { authenticated, HttpError, requireOrigin, type User } from './policy.ts';
import { mailEnabled, sendMail } from './mail.ts';
import { body, parse } from './validation.ts';

const defaults = { query, transaction, mailEnabled, sendMail, rateLimit, appUrl: () => process.env.APP_URL || 'http://localhost:3000' };
const emailSchema = z.object({ email: z.email().max(254).transform(value => value.toLowerCase()) }).strict();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const verificationSchema = z.object({ token: tokenSchema }).strict();
const emptySchema = z.object({}).strict();
const resetSchema = z.object({ token: tokenSchema, password: z.string().min(12).max(256) }).strict();
const json = (data: unknown, headers: Record<string, string> = {}) => Response.json({ data }, { headers: { 'Cache-Control': 'no-store', ...headers } });

export function createAccountAuthHandler(overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides };
  function appOrigin(): string {
    try {
      const url = new URL(deps.appUrl());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid origin');
      return url.origin;
    } catch {
      throw new HttpError(503, 'Endereço do site não configurado corretamente. Contate o suporte.');
    }
  }
  return async function handle(request: Request, user: User | null): Promise<Response | null> {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/api/auth/capabilities') {
      return json({ mailEnabled: deps.mailEnabled(), emailVerificationRequired: false });
    }
    if (request.method === 'GET' && path === '/api/auth/email-status') {
      const actor = authenticated(user);
      const [row] = await deps.query('SELECT email,email_verified_at FROM users WHERE id=$1', [actor.id]);
      if (!row) throw new HttpError(401, 'Entre novamente na sua conta.');
      return json({ email: row.email, verified: Boolean(row.email_verified_at), verifiedAt: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : null });
    }
    if (request.method === 'POST' && ['/api/auth/forgot-password', '/api/auth/request-verification'].includes(path)) {
      requireOrigin(request, appOrigin());
      if (path.endsWith('/request-verification')) authenticated(user);
      if (!deps.mailEnabled()) throw new HttpError(503, 'Envio de e-mail não configurado. Contate o suporte.');
      await deps.rateLimit('account-auth:global', 1000);
      await deps.rateLimit(`account-auth:ip:${request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'local'}`, 40);
      const reset = path.endsWith('/forgot-password');
      const payload = await body(request);
      const lookup = reset ? parse(emailSchema, payload).email : (parse(emptySchema, payload), user!.id);
      await deps.rateLimit(`account-auth:${reset ? 'email' : 'user'}:${lookup}`, 5);
      const purpose = reset ? 'RESET_PASSWORD' : 'VERIFY_EMAIL';
      const token = randomBytes(32).toString('hex');
      const recipient = await deps.transaction(async db => {
        const [row] = await deps.query(`SELECT id,email,email_verified_at FROM users WHERE ${reset ? 'email' : 'id'}=$1 FOR UPDATE`, [lookup], db);
        if (!row || (!reset && row.email_verified_at)) return null;
        await deps.query('DELETE FROM account_tokens WHERE user_id=$1 AND purpose=$2', [row.id, purpose], db);
        await deps.query("INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,clock_timestamp()+$4*interval '1 second')", [tokenHash(token), row.id, purpose, reset ? 1800 : 86400], db);
        return row.email as string;
      });
      if (recipient) {
        const link = new URL('/conta', appOrigin());
        link.hash = new URLSearchParams({ action: reset ? 'reset-password' : 'verify-email', token }).toString();
        const discard = () => deps.query('DELETE FROM account_tokens WHERE token_hash=$1', [tokenHash(token)]).catch(() => undefined);
        const send = deps.sendMail({
          to: recipient,
          subject: reset ? 'Redefina sua senha — Cubo Mágico PE' : 'Confirme seu e-mail — Cubo Mágico PE',
          text: `${reset ? 'Para redefinir sua senha, abra este link em até 30 minutos:' : 'Para confirmar seu e-mail, abra este link em até 24 horas:'}\n${link.href}\n\nSe você não solicitou esta mensagem, pode ignorá-la.`,
        });
        if (reset) {
          // Same response time and body for known and unknown addresses; a provider failure only drops this token.
          send.catch(() => discard());
        } else {
          try {
            await send;
          } catch (error) {
            // A later request may already have replaced this token: delete only this hash.
            await discard();
            throw error;
          }
        }
      }
      return json({ message: reset ? 'Se houver uma conta com esse e-mail, você receberá as instruções para redefinir a senha.' : 'Se seu e-mail ainda não estiver confirmado, você receberá um link de confirmação.' });
    }
    if (request.method === 'POST' && ['/api/auth/reset-password', '/api/auth/verify-email'].includes(path)) {
      requireOrigin(request, appOrigin());
      await deps.rateLimit('account-auth:global', 1000);
      await deps.rateLimit(`account-auth:ip:${request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'local'}`, 40);
      const reset = path.endsWith('/reset-password');
      const payload = await body(request);
      const resetData = reset ? parse(resetSchema, payload) : null;
      const data = resetData ?? parse(verificationSchema, payload);
      const purpose = reset ? 'RESET_PASSWORD' : 'VERIFY_EMAIL';
      await deps.rateLimit(`account-auth:token:${tokenHash(data.token)}`, 10);
      const passwordHash = resetData ? await hashPassword(resetData.password) : null;
      await deps.transaction(async db => {
        const invalid = () => new HttpError(400, 'Link inválido, expirado ou já utilizado. Solicite um novo link.');
        const [candidate] = await deps.query('SELECT user_id FROM account_tokens WHERE token_hash=$1 AND purpose=$2', [tokenHash(data.token), purpose], db);
        if (!candidate) throw invalid();
        // Lock the account before the token, matching the issuance lock order.
        const [account] = await deps.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [candidate.user_id], db);
        if (!account) throw invalid();
        const [consumed] = await deps.query('UPDATE account_tokens SET consumed_at=clock_timestamp() WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING user_id', [tokenHash(data.token), purpose], db);
        if (!consumed) throw invalid();
        if (reset) {
          await deps.query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash, consumed.user_id], db);
          await deps.query('DELETE FROM sessions WHERE user_id=$1', [consumed.user_id], db);
          await deps.query('DELETE FROM account_tokens WHERE user_id=$1 AND purpose=$2', [consumed.user_id, purpose], db);
        } else {
          await deps.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,clock_timestamp()) WHERE id=$1', [consumed.user_id], db);
        }
      });
      return reset
        ? json({ message: 'Senha atualizada. Entre novamente com a nova senha.' }, { 'Set-Cookie': sessionCookie('', true) })
        : json({ message: 'E-mail confirmado.' });
    }
    return null;
  };
}

export const handleAccountAuth: (request: Request, user: User | null) => Promise<Response | null> = createAccountAuthHandler();
