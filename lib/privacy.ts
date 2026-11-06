import { z } from 'zod';
import { query, transaction } from './db.ts';
import { verifyPassword, sessionCookie, rateLimit } from './auth.ts';
import { HttpError, authenticated, requireOrigin, type User } from './policy.ts';
import { body, parse } from './validation.ts';
import { handleMediaRequest, detachMedia, unlinkMediaFile } from './media.ts';

const deletionSchema = z.object({password:z.string().min(1).max(256),confirmation:z.literal('EXCLUIR')}).strict();
export const validateAccountDeletion = (payload: unknown) => parse(deletionSchema,payload);
export function assertAccountDeletable(role: User['role'], adminCount: number, ownedEvents: number) {
 if (role==='ADMIN' && adminCount<=1) throw new HttpError(409,'Não é possível excluir o último administrador.');
 if (ownedEvents>0) throw new HttpError(409,'Transfira a organização dos seus eventos para outro responsável antes de excluir sua conta.');
}
export async function exportAccount(actor: User) {
 return transaction(async db => {
  await query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',[],db);
  const [profile] = await query('SELECT id,email,display_name,city,photo_url,wca_id,role,email_verified_at,notifications_enabled,created_at FROM users WHERE id=$1',[actor.id],db);
  if (!profile) throw new HttpError(401,'Entre novamente na sua conta.');
  // Explicit session columns never expose bearer-token hashes or password credentials.
  const sessions = await query('SELECT created_at,expires_at FROM sessions WHERE user_id=$1 ORDER BY created_at',[actor.id],db);
  const participants = await query('SELECT * FROM participants WHERE user_id=$1 ORDER BY event_id',[actor.id],db);
  const registrations = await query('SELECT * FROM registrations WHERE user_id=$1 ORDER BY round_id',[actor.id],db);
  const submissions = await query('SELECT * FROM submissions WHERE user_id=$1 ORDER BY created_at,id',[actor.id],db);
  const videoRequests = await query('SELECT * FROM video_requests WHERE user_id=$1 OR actor_id=$1 ORDER BY created_at',[actor.id],db);
  const events = await query('SELECT * FROM events WHERE owner_id=$1 ORDER BY created_at,id',[actor.id],db);
  const rounds = await query('SELECT r.* FROM rounds r JOIN events e ON e.id=r.event_id WHERE e.owner_id=$1 ORDER BY r.opens_at,r.id',[actor.id],db);
  const media = await query('SELECT id,kind,mime,bytes,url,created_at FROM media WHERE owner_id=$1 ORDER BY created_at,id',[actor.id],db);
  const audit = await query('SELECT action,target_id,details,created_at FROM audit WHERE actor_id=$1::uuid OR target_id=$1::text ORDER BY id',[actor.id],db);
  const notifications=await query('SELECT id,kind,target_id,event_id,status,attempts,next_attempt_at,last_error,created_at,updated_at,sent_at FROM notification_outbox WHERE user_id=$1 ORDER BY created_at,id',[actor.id],db);
  return {exportedAt:new Date().toISOString(),version:1,profile,sessions,participants,registrations,submissions,videoRequests,events,rounds,media,audit,notifications};
 });
}
export async function deleteAccount(actor: User, payload: unknown) {
 const data=validateAccountDeletion(payload);
 await rateLimit(`privacy:delete:${actor.id}`,10);
 return transaction(async db => {
  // Same lock as management.setRole: concurrent admin deletion/demotion cannot remove the last admin.
  await query('SELECT pg_advisory_xact_lock(1865264830)',[],db);
  const [row] = await query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[actor.id],db);
  if (!row || !await verifyPassword(data.password,row.password_hash)) throw new HttpError(401,'Senha atual incorreta.');
  const [{count:adminCount}] = await query("SELECT count(*)::integer AS count FROM users WHERE role='ADMIN'",[],db);
  const [{count:ownedEvents}] = await query('SELECT count(*)::integer AS count FROM events WHERE owner_id=$1',[actor.id],db);
  assertAccountDeletable(row.role,adminCount,ownedEvents);
  const media = await query('SELECT id,url FROM media WHERE owner_id=$1 ORDER BY id FOR UPDATE',[actor.id],db);
  for (const file of media) {
   await detachMedia(file,db);
   // A failed unlink aborts deletion rather than falsely claiming erasure.
   await unlinkMediaFile(file.id);
  }
  await query('DELETE FROM video_requests WHERE actor_id=$1',[actor.id],db);
  await query('DELETE FROM audit WHERE actor_id=$1::uuid OR target_id=$1::text',[actor.id],db);
  // FK cascades remove memberships, registrations, submissions, media, sessions and auth tokens.
  await query('DELETE FROM users WHERE id=$1',[actor.id],db);
  return {deleted:true};
 });
}
export async function handleMediaPrivacy(request: Request, user: User | null): Promise<Response|null> {
 const media = await handleMediaRequest(request,user);
 if (media) return media;
 const path=new URL(request.url).pathname;
 if (path==='/api/privacy/export' && request.method==='GET') {
  const actor=authenticated(user);
  return Response.json({data:await exportAccount(actor)},{headers:{'Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="meus-dados-cubo-pe.json"','X-Content-Type-Options':'nosniff'}});
 }
 if (path==='/api/privacy/account' && request.method==='DELETE') {
  const actor=authenticated(user); requireOrigin(request);
  return Response.json({data:await deleteAccount(actor,await body(request))},{headers:{'Cache-Control':'private, no-store','Set-Cookie':sessionCookie('',true)}});
 }
 return null;
}
