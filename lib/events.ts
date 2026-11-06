import { z } from 'zod';
import { query, transaction, audit, camel, type Db } from './db.ts';
import { HttpError, canManage, assertWindow, authenticated, type User } from './policy.ts';
import { parse, parsePatch, uuid, eventSchema, eventPatchSchema, roundSchema, submissionSchema } from './validation.ts';
import { generateScrambles } from './scrambles.ts';
import { score, rankResults } from './scoring.ts';
import { enqueueNotification } from './notifications.ts';
const id = (value:string) => parse(uuid,value);
const roundFields = 'id,event_id,name,puzzle,format,opens_at,closes_at,video_required,published';
export async function eventRow(eventId:string,user:User|null,db?:Db,manage=false,lock=false) {
 const [event]=await query(`SELECT e.*,u.display_name AS organizer_name FROM events e JOIN users u ON e.owner_id=u.id WHERE e.id=$1${lock?' FOR UPDATE OF e':''}`,[id(eventId)],db);
 if(!event) throw new HttpError(404,'Evento não encontrado.');
 if(manage && !canManage(user,event.owner_id)) throw new HttpError(403,'Você não pode gerir este evento.');
 if(!manage && event.status==='DRAFT' && !canManage(user,event.owner_id)) throw new HttpError(404,'Evento não encontrado.');
 return event;
}
async function roundRow(eventId:string,roundId:string,db?:Db,lock=false) {
 const [round]=await query(`SELECT * FROM rounds WHERE event_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[eventId,id(roundId)],db);
 if(!round) throw new HttpError(404,'Rodada não encontrada.');
 return round;
}
async function dbNow(db:Db) { return (await query('SELECT clock_timestamp() AS now',[],db))[0].now as Date; }
async function publicResults(round:any,db?:Db) {
 if(!round.published) return [];
 const rows=await query("SELECT s.id,s.user_id,u.display_name,s.attempts,s.status,s.average_cs,s.best_cs FROM submissions s JOIN users u ON u.id=s.user_id WHERE s.round_id=$1 AND s.status='APPROVED' ORDER BY s.created_at,s.id",[round.id],db);
 return rankResults(rows.map(r=>camel(r)));
}
async function eventDto(event:any,user:User|null,detail=false) {
 const rounds=await query(`SELECT ${roundFields} FROM rounds WHERE event_id=$1 ORDER BY opens_at,id`,[event.id]);
 const [{count}]=await query('SELECT count(*)::integer AS count FROM participants WHERE event_id=$1',[event.id]);
 const dto:any={id:event.id,name:event.name,description:event.description,rules:event.rules,organizerName:event.organizer_name,registrationOpen:event.registration_open,registrationClose:event.registration_close,status:event.status,published:event.published,rounds:await Promise.all(rounds.map(async r=>({...camel(r),...(detail?{results:await publicResults(r)}:{})}))),participantCount:count};
 if(detail) dto.participants=(await query('SELECT u.id,u.display_name,u.city,u.wca_id FROM participants p JOIN users u ON u.id=p.user_id WHERE p.event_id=$1 ORDER BY u.display_name,u.id',[event.id])).map(camel);
 if(canManage(user,event.owner_id)) dto.ownerId=event.owner_id;
 return dto;
}
export async function listEvents(user:User|null,manage=false) {
 if(manage) authenticated(user);
 const rows=await query(`SELECT e.*,u.display_name AS organizer_name FROM events e JOIN users u ON u.id=e.owner_id
 WHERE ${manage ? (user!.role==='ADMIN' ? 'TRUE' : "e.owner_id=$1 AND $2='ORGANIZER'") : "e.status<>'DRAFT' OR e.owner_id=$1 AND $2 IN ('ADMIN','ORGANIZER') OR $2='ADMIN'"}
 ORDER BY e.registration_open DESC,e.created_at DESC`,manage && user!.role==='ADMIN'?[]:[user?.id || null,user?.role || null]);
 return Promise.all(rows.map(e=>eventDto(e,user)));
}
export async function getEvent(eventId:string,user:User|null) { return eventDto(await eventRow(eventId,user),user,true); }
export async function getRound(eventId:string,roundId:string,user:User|null) {
 await eventRow(eventId,user);
 const round=await roundRow(eventId,roundId);
 const dto:any=camel(Object.fromEntries(roundFields.split(',').map(k=>[k,round[k]])));
 dto.scrambles=[]; dto.mySubmission=null; dto.results=await publicResults(round); dto.videoRequest=null;
 if(user) {
  const registered=(await query('SELECT 1 FROM registrations WHERE round_id=$1 AND user_id=$2',[round.id,user.id])).length>0;
  if(registered && (await query('SELECT clock_timestamp() >= $1::timestamptz AS open',[round.opens_at]))[0].open) dto.scrambles=round.scrambles;
  const [submission]=await query('SELECT id,attempts,video_url,status,review_note FROM submissions WHERE round_id=$1 AND user_id=$2',[round.id,user.id]);
  const [request]=await query('SELECT message,created_at FROM video_requests WHERE round_id=$1 AND user_id=$2',[round.id,user.id]);
  dto.mySubmission=submission?camel(submission):null;
  dto.videoRequest=request?camel(request):null;
  if(dto.mySubmission && request) dto.mySubmission.videoRequest=dto.videoRequest;
 }
 return dto;
}
export async function createEvent(user:User,payload:unknown) {
 if(user.role==='COMPETITOR') throw new HttpError(403,'Acesso restrito a organizadores.');
 const data=parse(eventSchema,payload);
 if(new Date(data.registrationOpen)>=new Date(data.registrationClose)) throw new HttpError(400,'Período de inscrição inválido.');
 const event=await transaction(async db=>{
  const [row]=await query('INSERT INTO events(owner_id,name,description,rules,registration_open,registration_close) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[user.id,data.name,data.description,data.rules,data.registrationOpen,data.registrationClose],db);
  await audit(db,user.id,'EVENT_CREATED',row.id); return {...row,organizer_name:user.displayName};
 });
 return eventDto(event,user);
}
export async function updateEvent(eventId:string,user:User,payload:unknown) {
 const data=parsePatch(eventPatchSchema,payload);
 await transaction(async db=>{
  const event=await eventRow(eventId,user,db,true,true);
  const open=data.registrationOpen ?? event.registration_open, close=data.registrationClose ?? event.registration_close;
  if(new Date(open)>=new Date(close)) throw new HttpError(400,'Período de inscrição inválido.');
  if(event.published && data.status==='DRAFT') throw new HttpError(409,'Evento com resultados publicados não pode virar rascunho.');
  await query('UPDATE events SET name=$1,description=$2,rules=$3,registration_open=$4,registration_close=$5,status=$6 WHERE id=$7',[data.name??event.name,data.description??event.description,data.rules??event.rules,open,close,data.status??event.status,event.id],db);
  await audit(db,user.id,'EVENT_UPDATED',event.id,{fields:Object.keys(data)});
 });
 return getEvent(eventId,user);
}
export async function createRound(eventId:string,user:User,payload:unknown) {
 const data=parse(roundSchema,payload);
 if(new Date(data.opensAt)>=new Date(data.closesAt)) throw new HttpError(400,'Período de rodada inválido.');
 await eventRow(eventId,user,undefined,true);
 const scrambles=await generateScrambles(data.puzzle,data.format);
 return transaction(async db=>{
  const event=await eventRow(eventId,user,db,true,true);
  if(event.status==='CLOSED' || event.published) throw new HttpError(409,'Não é possível adicionar rodadas a este evento.');
  const [round]=await query(`INSERT INTO rounds(event_id,name,puzzle,format,opens_at,closes_at,video_required,scrambles) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING ${roundFields}`,[event.id,data.name,data.puzzle,data.format,data.opensAt,data.closesAt,data.videoRequired,JSON.stringify(scrambles)],db);
  await audit(db,user.id,'ROUND_CREATED',round.id,{eventId:event.id,puzzle:data.puzzle,format:data.format});
  return camel(round);
 });
}
export async function register(eventId:string,user:User,payload:unknown) {
 const data=parse(z.object({roundIds:z.array(uuid).min(1).max(100).refine(ids=>new Set(ids).size===ids.length,'Rodadas duplicadas.')}),payload);
 await transaction(async db=>{
  const event=await eventRow(eventId,user,db,false,true);
  if(event.status!=='OPEN') throw new HttpError(403,'Inscrições não estão abertas.');
  assertWindow(event.registration_open,event.registration_close,await dbNow(db));
  const rounds=await query('SELECT id FROM rounds WHERE event_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE',[event.id,data.roundIds],db);
  if(rounds.length!==data.roundIds.length) throw new HttpError(400,'Rodada não pertence a este evento.');
  await query('INSERT INTO participants(event_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[event.id,user.id],db);
  for(const roundId of data.roundIds) await query('INSERT INTO registrations(event_id,round_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[event.id,roundId,user.id],db);
  await audit(db,user.id,'EVENT_REGISTERED',event.id,{roundIds:data.roundIds});
 });
 return {registered:true,roundIds:data.roundIds};
}
export async function submit(eventId:string,roundId:string,user:User,payload:unknown) {
 const data=parse(submissionSchema,payload);
 return transaction(async db=>{
  const event=await eventRow(eventId,user,db,false,true);
  const round=await roundRow(event.id,roundId,db,true);
  if(event.status==='CLOSED' || round.published) throw new HttpError(403,'Envios encerrados.');
  assertWindow(round.opens_at,round.closes_at,await dbNow(db));
  if(!(await query('SELECT 1 FROM registrations WHERE round_id=$1 AND user_id=$2',[round.id,user.id],db)).length) throw new HttpError(403,'Inscreva-se nesta rodada para enviar resultados.');
  if(data.attempts.length!==(round.format==='AO5'?5:3)) throw new HttpError(400,'Quantidade de tentativas incorreta.');
  const [videoRequest]=await query('SELECT 1 FROM video_requests WHERE round_id=$1 AND user_id=$2',[round.id,user.id],db);
  if((round.video_required || videoRequest) && !data.videoUrl) throw new HttpError(400,'O vídeo é obrigatório para este envio.');
  const scoring=score(round.format,data.attempts);
  const [result]=await query(`INSERT INTO submissions(round_id,user_id,attempts,video_url,average_cs,best_cs) VALUES($1,$2,$3::jsonb,$4,$5,$6)
  ON CONFLICT(round_id,user_id) DO UPDATE SET attempts=EXCLUDED.attempts,video_url=EXCLUDED.video_url,average_cs=EXCLUDED.average_cs,best_cs=EXCLUDED.best_cs,status='PENDING',review_note='',revision=submissions.revision+1,updated_at=clock_timestamp()
  RETURNING id,attempts,video_url,status,review_note,revision`,[round.id,user.id,JSON.stringify(data.attempts),data.videoUrl,scoring.averageCs,scoring.bestCs],db);
  await audit(db,user.id,'SUBMISSION_SAVED',result.id,{roundId:round.id}); return camel(result);
 });
}
export async function adminSubmissions(eventId:string,user:User) {
 await eventRow(eventId,user,undefined,true);
 return (await query('SELECT s.id,s.revision,s.round_id,r.name AS round_name,u.display_name,s.attempts,s.video_url,s.status,s.review_note FROM submissions s JOIN rounds r ON r.id=s.round_id JOIN users u ON u.id=s.user_id WHERE r.event_id=$1 ORDER BY r.opens_at,u.display_name,s.id',[eventId])).map(camel);
}
export async function review(submissionId:string,user:User,payload:unknown) {
 const data=parse(z.object({status:z.enum(['APPROVED','REJECTED']),reviewNote:z.string().trim().max(10000).default(''),expectedRevision:z.number().int().positive().max(2147483647)}),payload);
 return transaction(async db=>{
  const [reference]=await query('SELECT r.event_id,s.round_id FROM submissions s JOIN rounds r ON r.id=s.round_id WHERE s.id=$1',[id(submissionId)],db);
  if(!reference) throw new HttpError(404,'Envio não encontrado.');
  await eventRow(reference.event_id,user,db,true,true);
  const round=await roundRow(reference.event_id,reference.round_id,db,true);
  if(round.published) throw new HttpError(409,'Resultados publicados são imutáveis.');
  const [evidence]=await query('SELECT s.user_id,s.revision,s.video_url,EXISTS(SELECT 1 FROM video_requests vr WHERE vr.round_id=s.round_id AND vr.user_id=s.user_id) AS requested FROM submissions s WHERE s.id=$1 FOR UPDATE OF s',[submissionId],db);
  if(!evidence) throw new HttpError(404,'Envio não encontrado.');
  if(evidence.revision!==data.expectedRevision) throw new HttpError(409,'Este envio foi alterado. Recarregue os envios e confira os tempos e o vídeo antes de revisar novamente.');
  if(data.status==='APPROVED' && (round.video_required || evidence.requested) && !evidence.video_url) throw new HttpError(400,'O vídeo obrigatório deve ser anexado antes da aprovação.');
  const [row]=await query('UPDATE submissions SET status=$1,review_note=$2,revision=revision+1,updated_at=clock_timestamp() WHERE id=$3 RETURNING id,round_id,status,review_note,revision',[data.status,data.reviewNote,submissionId],db);
  if(!row) throw new HttpError(404,'Envio não encontrado.');
  await audit(db,user.id,'SUBMISSION_REVIEWED',submissionId,{status:data.status});
  await enqueueNotification(db,evidence.user_id,'SUBMISSION_REVIEW',`${row.id}:${row.revision}`,reference.event_id);
  return camel(row);
 });
}
export async function publish(eventId:string,roundId:string,user:User) {
 await transaction(async db=>{
  const event=await eventRow(eventId,user,db,true,true), round=await roundRow(event.id,roundId,db,true);
  if((await dbNow(db)).getTime()<new Date(round.closes_at).getTime()) throw new HttpError(409,'A rodada ainda não encerrou.');
  if(round.published) return;
  if((await query("SELECT 1 FROM submissions WHERE round_id=$1 AND status='PENDING' LIMIT 1",[round.id],db)).length) throw new HttpError(409,'Revise todos os envios pendentes antes da publicação.');
  if(event.status==='DRAFT') throw new HttpError(409,'Abra o evento antes de publicar resultados.');
  await query('UPDATE rounds SET published=true WHERE id=$1',[round.id],db);
  await query('UPDATE events SET published=true WHERE id=$1',[event.id],db);
  await audit(db,user.id,'ROUND_PUBLISHED',round.id,{eventId:event.id});
 });
 return getRound(eventId,roundId,user);
}
export async function videoRequest(eventId:string,userId:string,user:User,payload:unknown) {
 const data=parse(z.object({roundId:uuid,message:z.string().trim().min(1).max(5000)}),payload);
 return transaction(async db=>{
  const event=await eventRow(eventId,user,db,true,true), round=await roundRow(event.id,data.roundId,db,true);
  if(round.published || (await dbNow(db)).getTime()>=new Date(round.closes_at).getTime()) throw new HttpError(409,'Solicite o vídeo antes do encerramento da rodada.');
  if(!(await query('SELECT 1 FROM registrations WHERE round_id=$1 AND user_id=$2',[round.id,id(userId)],db)).length) throw new HttpError(404,'Participante não inscrito nesta rodada.');
  const [request]=await query('INSERT INTO video_requests(round_id,user_id,actor_id,message) VALUES($1,$2,$3,$4) ON CONFLICT(round_id,user_id) DO UPDATE SET message=EXCLUDED.message,actor_id=EXCLUDED.actor_id,created_at=clock_timestamp() RETURNING (extract(epoch FROM created_at)*1000000)::bigint::text AS notification_revision',[round.id,userId,user.id,data.message],db);
  await query("UPDATE submissions SET status='PENDING',review_note='',revision=revision+1,updated_at=clock_timestamp() WHERE round_id=$1 AND user_id=$2",[round.id,userId],db);
  await audit(db,user.id,'VIDEO_REQUESTED',userId,{eventId:event.id,roundId:round.id});
  await enqueueNotification(db,userId,'VIDEO_REQUEST',`${round.id}:${request.notification_revision}`,event.id);
  return {roundId:round.id,userId,message:data.message};
 });
}
export async function participants(eventId:string,user:User) {
 await eventRow(eventId,user,undefined,true);
 return (await query(`SELECT u.id,u.display_name,u.city,u.wca_id,coalesce(array_agg(r.round_id) FILTER(WHERE r.round_id IS NOT NULL),'{}') AS round_ids
 FROM participants p JOIN users u ON u.id=p.user_id LEFT JOIN registrations r ON r.user_id=p.user_id AND r.event_id=p.event_id WHERE p.event_id=$1 GROUP BY u.id ORDER BY u.display_name,u.id`,[eventId])).map(camel);
}
export async function removeParticipant(eventId:string,userId:string,user:User) {
 await transaction(async db=>{
  const event=await eventRow(eventId,user,db,true,true);
  const [{published}]=await query('SELECT EXISTS(SELECT 1 FROM registrations r JOIN rounds rd ON rd.id=r.round_id WHERE r.event_id=$1 AND r.user_id=$2 AND rd.published) AS published',[event.id,id(userId)],db);
  if(published) throw new HttpError(409,'Participante com resultados publicados não pode ser removido.');
  const rows=await query('DELETE FROM participants WHERE event_id=$1 AND user_id=$2 RETURNING user_id',[event.id,userId],db);
  if(!rows.length) throw new HttpError(404,'Participante não encontrado.');
  await audit(db,user.id,'PARTICIPANT_REMOVED',userId,{eventId:event.id});
 });
 return {removed:true};
}
