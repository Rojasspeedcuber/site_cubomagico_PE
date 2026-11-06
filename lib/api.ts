import * as events from './events.ts';
import * as management from './management.ts';
import { handleWcaAuth } from './wca-auth.ts';
import { handleAccountAuth } from './account-auth.ts';
import { handleEventLifecycle } from './event-lifecycle.ts';
import { handleMediaPrivacy } from './privacy.ts';
import { handleNotifications } from './notifications.ts';
import { z } from 'zod';
import { query, transaction, audit } from './db.ts';
import { sessionUser, publicUser, hashPassword, verifyPassword, createSession, readToken, tokenHash, sessionCookie, rateLimit } from './auth.ts';
import { HttpError, authenticated, admin, requireOrigin } from './policy.ts';
import { body, parse, registerSchema, loginSchema, profileSchema } from './validation.ts';
export const json = (data:unknown,status=200,headers:Record<string,string>={}) => Response.json({data},{status,headers:{'Cache-Control':'no-store',...headers}});
export async function handleApi(request:Request): Promise<Response> {
 try {
  const path = new URL(request.url).pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);
  const method=request.method;
  if (!['GET','HEAD','OPTIONS'].includes(method)) requireOrigin(request);
  const user = await sessionUser(request);
  if(user && !['GET','HEAD','OPTIONS'].includes(method) && path.join('/')!=='auth/logout') await rateLimit(`writes:${user.id}`,300);
  const wcaResponse=await handleWcaAuth(request,user);
  if(wcaResponse) return wcaResponse;
  const accountResponse=await handleAccountAuth(request,user);
  if(accountResponse) return accountResponse;
  const notificationResponse=await handleNotifications(request,user);
  if(notificationResponse) return notificationResponse;
  const mediaPrivacyResponse=await handleMediaPrivacy(request,user);
  if(mediaPrivacyResponse) return mediaPrivacyResponse;
  const lifecycleResponse=await handleEventLifecycle(request,user);
  if(lifecycleResponse) return lifecycleResponse;
  if(method==='GET' && path.join('/')==='session') return json(user);
  if(method==='GET' && path.join('/')==='content') return json(await management.getContent());
  if(method==='GET' && path.join('/')==='algorithms') return json(await management.listAlgorithms(user?.role==='ADMIN'));
  if(method==='POST' && path[0]==='auth' && path.length===2) {
   if(path[1]==='logout') {
    const token=readToken(request);
    if(token) await query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(token)]);
    return json(null,200,{'Set-Cookie':sessionCookie('',true)});
   }
   if(path[1]==='register' || path[1]==='login') {
    await rateLimit('auth:global',1000);
    await rateLimit(`auth:ip:${request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'local'}`,100);
    const payload=await body(request);
    if(path[1]==='register') {
     const data=parse(registerSchema,payload);
     await rateLimit(`auth:email:${data.email}`,20);
     const hashed=await hashPassword(data.password);
     const result=await transaction(async db=>{
      const [row]=await query('INSERT INTO users(email,password_hash,display_name,city,photo_url,wca_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[data.email,hashed,data.displayName,data.city,data.photoUrl,data.wcaId],db);
      const cookie=await createSession(row.id,db);
      await audit(db,row.id,'USER_REGISTERED',row.id);
      return {user:publicUser(row),cookie};
     });
     return json(result.user,201,{'Set-Cookie':result.cookie});
    }
    const data=parse(loginSchema,payload);
    await rateLimit(`auth:email:${data.email}`,20);
    // Verify and issue the session under the account lock: a concurrent password reset waits for this commit and then revokes the session.
    const result = await transaction(async db=>{
      const [row]=await query('SELECT * FROM users WHERE email=$1 FOR UPDATE',[data.email],db);
      // Equal-cost hash on unknown accounts to limit email enumeration timing.
      const stored=row?.password_hash || `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
      const valid = await verifyPassword(data.password,stored);
      if(!valid || !row) return null;
      return {row, cookie: await createSession(row.id,db)};
    });
    if(!result) throw new HttpError(401,'Email ou senha inválidos.');
    return json(publicUser(result.row),200,{'Set-Cookie':result.cookie});
   }
  }
  if(method==='PATCH' && path.join('/')==='profile') {
   const actor=authenticated(user); const data=parse(profileSchema,await body(request));
   // Profile photos may reference only photo media; a video URL here would pin the file past retention.
   const photoMatch=/^\/api\/media\/([0-9a-f-]{36})$/i.exec(data.photoUrl);
   if(photoMatch && !(await query("SELECT 1 FROM media WHERE id=$1 AND kind='photo'",[photoMatch[1]]))[0]) throw new HttpError(400,'A foto do perfil deve ser uma imagem enviada ao site.');
   return json(await transaction(async db=>{
    const [row]=await query('UPDATE users SET display_name=$1,city=$2,photo_url=$3,wca_id=$4 WHERE id=$5 RETURNING *',[data.displayName,data.city,data.photoUrl,data.wcaId,actor.id],db);
    await audit(db,actor.id,'PROFILE_UPDATED',actor.id);
    return publicUser(row);
   }));
  }
  if(path[0]==='events') {
   if(method==='GET' && path.length===1) return json(await events.listEvents(user));
   if(method==='GET' && path.length===2) return json(await events.getEvent(path[1],user));
   if(method==='GET' && path.length===4 && path[2]==='rounds') return json(await events.getRound(path[1],path[3],user));
   if(method==='POST' && path.length===3 && path[2]==='register') return json(await events.register(path[1],authenticated(user),await body(request)));
   if(method==='POST' && path.length===5 && path[2]==='rounds' && path[4]==='submissions') return json(await events.submit(path[1],path[3],authenticated(user),await body(request)));
  }
  if(path[0]==='admin') {
   const actor=authenticated(user);
   if(['users','audit','algorithms','content'].includes(path[1])) admin(actor);
   else if(actor.role==='COMPETITOR') throw new HttpError(403,'Acesso restrito a organizadores.');
   if(method==='GET' && path.join('/')==='admin/audit') return json(await management.listAudit());
   if(method==='GET' && path.join('/')==='admin/users') return json(await management.listUsers());
   if(method==='PATCH' && path[1]==='users' && path.length===3) {
    const data=parse(z.object({role:z.enum(['ADMIN','ORGANIZER','COMPETITOR'])}),await body(request));
    return json(await management.setRole(path[2],data.role,actor.id));
   }
   if(method==='PATCH' && path.join('/')==='admin/content') return json(await management.updateContent(actor,await body(request)));
   if(method==='POST' && path.join('/')==='admin/algorithms') return json(await management.createAlgorithm(actor,await body(request)),201);
   if(method==='PATCH' && path[1]==='algorithms' && path.length===3) return json(await management.updateAlgorithm(path[2],actor,await body(request)));
   if(method==='DELETE' && path[1]==='algorithms' && path.length===3) return json(await management.archiveAlgorithm(path[2],actor));
   if(path[1]==='events') {
    if(method==='GET' && path.length===2) return json(await events.listEvents(actor,true));
    if(method==='POST' && path.length===2) return json(await events.createEvent(actor,await body(request)),201);
    if(method==='PATCH' && path.length===3) return json(await events.updateEvent(path[2],actor,await body(request)));
    if(method==='POST' && path.length===4 && path[3]==='rounds') return json(await events.createRound(path[2],actor,await body(request)),201);
    if(method==='GET' && path.length===4 && path[3]==='submissions') return json(await events.adminSubmissions(path[2],actor));
    if(method==='POST' && path.length===6 && path[3]==='rounds' && path[5]==='publish') return json(await events.publish(path[2],path[4],actor));
    if(method==='POST' && path.length===6 && path[3]==='participants' && path[5]==='video-request') return json(await events.videoRequest(path[2],path[4],actor,await body(request)));
    if(method==='GET' && path.length===4 && path[3]==='participants') return json(await events.participants(path[2],actor));
    if(method==='DELETE' && path.length===5 && path[3]==='participants') return json(await events.removeParticipant(path[2],path[4],actor));
   }
   if(path[1]==='submissions' && path.length===3 && method==='PATCH') return json(await events.review(path[2],actor,await body(request)));
  }
  throw new HttpError(404,'Recurso não encontrado.');
 } catch(error:any) {
  if(error instanceof URIError) return Response.json({error:'Caminho inválido.'},{status:400});
  if(error instanceof HttpError) return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
  if(error?.code==='23505') return Response.json({error:'Registro já existente.'},{status:409});
  if(['22P02','22007','23514','23503'].includes(error?.code)) return Response.json({error:'Dados inválidos ou referência inexistente.'},{status:400});
  console.error('Falha na API:',error instanceof Error ? error.name : 'erro');
  return Response.json({error:'Não foi possível concluir a operação.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
