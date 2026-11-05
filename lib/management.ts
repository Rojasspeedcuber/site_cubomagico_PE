import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, transaction, audit, camel } from './db.ts';
import { publicUser } from './auth.ts';
import { HttpError, type User } from './policy.ts';
import { parse, parsePatch, uuid, contentKeys, contentSchema, algorithmSchema } from './validation.ts';
export async function getContent() {
 const defaults:Record<string,string>=Object.fromEntries(contentKeys.map(key=>[key,'']));
 defaults.communityName=process.env.COMMUNITY_NAME || 'Comunidade de Cubo Mágico';
 defaults.communityShortName=process.env.COMMUNITY_NAME || 'Cubo Mágico';
 const rows=await query('SELECT key,value FROM content');
 for(const row of rows) if(contentKeys.includes(row.key)) defaults[row.key]=row.value;
 return defaults;
}
export async function updateContent(actor:User,payload:unknown) {
 const data=parse(contentSchema,payload);
 await transaction(async db=>{
  for(const [key,value] of Object.entries(data)) if(value!==undefined) await query('INSERT INTO content(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[key,value],db);
  await audit(db,actor.id,'CONTENT_UPDATED',undefined,{fields:Object.keys(data)});
 });
 return getContent();
}
export async function listAlgorithms(includeUnvalidated=false) {return (await query(`SELECT id,name,category,algorithm,variations,orientation,notes,source_url,source_name,validated,method,puzzle FROM algorithms WHERE NOT archived${includeUnvalidated ? '' : ' AND validated'} ORDER BY category,name,id`)).map(camel);}
export async function createAlgorithm(actor:User,payload:unknown) {
 const data=parse(algorithmSchema,payload); const id=data.id || randomUUID();
 return transaction(async db=>{
  const [row]=await query('INSERT INTO algorithms(id,name,category,algorithm,variations,orientation,notes,source_url,source_name,validated,method,puzzle) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[id,data.name,data.category,data.algorithm,JSON.stringify(data.variations),data.orientation,data.notes,data.sourceUrl,data.sourceName,data.validated,data.method,data.puzzle],db);
  await audit(db,actor.id,'ALGORITHM_CREATED',id); const {archived,...result}=camel(row); return result;
 });
}
export async function updateAlgorithm(id:string,actor:User,payload:unknown) {
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new HttpError(400,'Identificador inválido.');
 return transaction(async db=>{
  const [row]=await query('SELECT * FROM algorithms WHERE id=$1 AND NOT archived FOR UPDATE',[id],db);
  if(!row) throw new HttpError(404,'Algoritmo não encontrado.');
  const patch=parsePatch(algorithmSchema.partial().omit({id:true}),payload);
  const data=parse(algorithmSchema,{...camel(row),...patch,id});
  const [result]=await query('UPDATE algorithms SET name=$1,category=$2,algorithm=$3,variations=$4::jsonb,orientation=$5,notes=$6,source_url=$7,source_name=$8,validated=$9 WHERE id=$10 RETURNING id,name,category,algorithm,variations,orientation,notes,source_url,source_name,validated,method,puzzle',[data.name,data.category,data.algorithm,JSON.stringify(data.variations),data.orientation,data.notes,data.sourceUrl,data.sourceName,data.validated,id],db);
  await audit(db,actor.id,'ALGORITHM_UPDATED',id); return camel(result);
 });
}
export async function archiveAlgorithm(id:string,actor:User) {
 return transaction(async db=>{
  const rows=await query('UPDATE algorithms SET archived=true WHERE id=$1 AND NOT archived RETURNING id',[id],db);
  if(!rows.length) throw new HttpError(404,'Algoritmo não encontrado.');
  await audit(db,actor.id,'ALGORITHM_ARCHIVED',id); return {archived:true};
 });
}
export async function listUsers() {return (await query('SELECT id,display_name,city,photo_url,wca_id,role FROM users ORDER BY created_at DESC,id')).map(publicUser);}
export async function setRole(userId:string,role:User['role'],actorId:string|null) {
 parse(uuid,userId);parse(z.enum(['ADMIN','ORGANIZER','COMPETITOR']),role);
 return transaction(async db=>{
  await query('SELECT pg_advisory_xact_lock(1865264830)',[],db);
  if(actorId===userId && role!=='ADMIN') throw new HttpError(409,'Peça a outro administrador para alterar seu papel.');
  const [row]=await query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[userId],db);
  if(!row) throw new HttpError(404,'Usuário não encontrado.');
  if(row.role==='ADMIN' && role!=='ADMIN') {
   const [{count}]=await query("SELECT count(*)::integer AS count FROM users WHERE role='ADMIN'",[],db);
   if(count<=1) throw new HttpError(409,'Não é possível remover o último administrador.');
  }
  const [result]=await query('UPDATE users SET role=$1 WHERE id=$2 RETURNING *',[role,userId],db);
  await audit(db,actorId,'USER_ROLE_CHANGED',userId,{from:row.role,to:role}); return publicUser(result);
 });
}
export async function listAudit() {return (await query('SELECT id::text,action,created_at,actor_id,target_id,details FROM audit ORDER BY id DESC LIMIT 1000')).map(camel);}
