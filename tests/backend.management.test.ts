import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleApi } from '../lib/api.ts';
import { pool, query } from '../lib/db.ts';
import { rateLimit } from '../lib/auth.ts';
const origin=process.env.APP_URL || 'http://localhost:3000';
async function call(path:string,method='GET',body?:unknown,cookie?:string){const res=await handleApi(new Request(`${origin}/api/${path}`,{method,headers:{origin,...(cookie?{cookie}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
test('admin content, algorithm archive, roles and audit use persistent authorized operations', {skip:!process.env.DATABASE_URL},async()=>{
 const ids:string[]=[];const algId=`test-${randomUUID()}`;
 let previousWelcome:string|undefined;
 try {
  async function actor(role:string){const res=await call('auth/register','POST',{displayName:'Admin fixture',email:`management-${randomUUID()}@example.test`,password:'long-test-passphrase'});ids.push(res.data.data.id);await query('UPDATE users SET role=$1 WHERE id=$2',[role,res.data.data.id]);return {id:res.data.data.id,cookie:res.cookie!};}
  const owner=await actor('ADMIN'),member=await actor('COMPETITOR');
  const content=await call('content'); assert.equal(content.status,200);previousWelcome=content.data.data.welcome;
  assert.equal(typeof content.data.data.meetings,'string');
  assert.equal((await call('admin/content','PATCH',{welcome:'Fixture de teste'},member.cookie)).status,403);
  assert.equal((await call('admin/content','PATCH',{logoUrl:'javascript:alert(1)'},owner.cookie)).status,400);
  assert.equal((await call('admin/content','PATCH',{welcome:'Fixture de teste'},owner.cookie)).status,200);
  assert.equal((await call('content')).data.data.welcome,'Fixture de teste');
  const algorithm={id:algId,name:'Fixture',category:'PLL',algorithm:"R U R'",sourceUrl:'https://example.test/source'};
  assert.equal((await call('admin/algorithms','POST',algorithm,owner.cookie)).status,201);
  assert.ok((await call('algorithms')).data.data.some((a:any)=>a.id===algId));
  assert.equal((await call(`admin/algorithms/${algId}`,'PATCH',{notes:'Revisado'},owner.cookie)).status,200);
  assert.equal((await call('algorithms')).data.data.find((a:any)=>a.id===algId).notes,'Revisado');
  assert.equal((await call(`admin/algorithms/${algId}`,'DELETE',{},owner.cookie)).status,200);
  assert.ok(!(await call('algorithms')).data.data.some((a:any)=>a.id===algId));
  assert.equal((await call(`admin/users/${member.id}`,'PATCH',{role:'ORGANIZER'},member.cookie)).status,403);
  assert.equal((await call(`admin/users/${member.id}`,'PATCH',{role:'ORGANIZER'},owner.cookie)).status,200);
  assert.equal((await call('session','GET',undefined,member.cookie)).data.data.role,'ORGANIZER');
  const users=await call('admin/users','GET',undefined,owner.cookie); assert.equal(users.status,200);assert.ok(!JSON.stringify(users.data).includes('@example.test'));
  assert.equal((await call(`admin/users/${owner.id}`,'PATCH',{role:'COMPETITOR'},owner.cookie)).status,409);
  assert.ok((await call('admin/audit','GET',undefined,owner.cookie)).data.data.some((a:any)=>a.action==='ALGORITHM_ARCHIVED'));
  const key=`test-rate-${randomUUID()}`;await rateLimit(key,2,10);await rateLimit(key,2,10);await assert.rejects(()=>rateLimit(key,2,10),/Muitas tentativas/);
 } finally {
  await query('DELETE FROM algorithms WHERE id=$1',[algId]);
  if(previousWelcome!==undefined) await query('INSERT INTO content(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',['welcome',previousWelcome]);
  if(ids.length) await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await pool.end();
 }
});
