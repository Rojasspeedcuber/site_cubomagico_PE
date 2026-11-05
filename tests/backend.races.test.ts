import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool, query } from '../lib/db.ts';
import { handleApi } from '../lib/api.ts';
const origin=process.env.APP_URL || 'http://localhost:3000';
async function call(path:string,method='GET',data?:unknown,cookie?:string){const res=await handleApi(new Request(`${origin}/api/${path}`,{method,headers:{origin,...(cookie?{cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)}));return {status:res.status,data:(await res.json()).data,cookie:res.headers.get('set-cookie')?.split(';')[0]};}
test('round lock rechecks deadline after waiting; publish/review locks preserve publication and requested evidence', {skip:!process.env.DATABASE_URL},async()=>{
 const ids:string[]=[];let eventId:string|undefined;
 try {
  async function account(role:string){const res=await call('auth/register','POST',{displayName:'Corrida fixture',email:`race-${randomUUID()}@example.test`,password:'race-long-passphrase'});assert.equal(res.status,201);ids.push(res.data.id);await query('UPDATE users SET role=$1 WHERE id=$2',[role,res.data.id]);return {id:res.data.id,cookie:res.cookie!};}
  const owner=await account('ORGANIZER'),member=await account('COMPETITOR'),late=await account('COMPETITOR');
  const now=Date.now(),iso=(delta:number)=>new Date(now+delta).toISOString();
  const created=await call('admin/events','POST',{name:'Concorrência fixture',registrationOpen:iso(-3600000),registrationClose:iso(3600000)},owner.cookie);eventId=created.data.id;
  const r=await call(`admin/events/${eventId}/rounds`,'POST',{name:'Rodada',puzzle:'222',format:'MO3',opensAt:iso(-60000),closesAt:iso(7200000)},owner.cookie),roundId=r.data.id;
  await call(`admin/events/${eventId}`,'PATCH',{status:'OPEN'},owner.cookie);
  await call(`events/${eventId}/register`,'POST',{roundIds:[roundId]},member.cookie);
  const attempts=[100,200,300].map(timeCs=>({timeCs,penalty:'NONE'}));
  const endpoint=`events/${eventId}/rounds/${roundId}/submissions`;
  assert.equal((await call(endpoint,'POST',{attempts},member.cookie)).status,200);
  const [submission]=await query('SELECT id FROM submissions WHERE round_id=$1',[roundId]);
  const current=async()=> (await call(`admin/events/${eventId}/submissions`,'GET',undefined,owner.cookie)).data[0];
  await call(`admin/events/${eventId}/participants/${member.id}/video-request`,'POST',{roundId,message:'Solicitação de evidência'},owner.cookie);
  assert.equal((await call(`admin/submissions/${submission.id}`,'PATCH',{status:'APPROVED',expectedRevision:(await current()).revision},owner.cookie)).status,400,'requested video must exist before approval');
  await call(endpoint,'POST',{attempts,videoUrl:'https://example.test/evidence'},member.cookie);
  const viewed=await current();
  const competingReviews=await Promise.all(['APPROVED','REJECTED'].map(status=>call(`admin/submissions/${submission.id}`,'PATCH',{status,expectedRevision:viewed.revision},owner.cookie)));
  assert.deepEqual(competingReviews.map(r=>r.status).sort(),[200,409],'only one concurrent reviewer can consume a revision');
  assert.equal((await current()).revision,viewed.revision+1);
  assert.equal((await call(endpoint,'POST',{attempts,videoUrl:'https://example.test/evidence'},member.cookie)).status,200);
  const locker=await pool.connect();
  try {
   await locker.query('BEGIN');
   await locker.query("UPDATE rounds SET closes_at=clock_timestamp()+interval '0.25 second' WHERE id=$1",[roundId]);
   const pending=call(endpoint,'POST',{attempts,videoUrl:'https://example.test/too-late'},member.cookie);
   await locker.query('SELECT pg_sleep(0.4)'); await locker.query('COMMIT');
   assert.equal((await pending).status,403,'request arriving before deadline cannot write after waiting beyond it');
  } finally {await locker.query('ROLLBACK');locker.release();}
  await query("UPDATE events SET registration_close=clock_timestamp()-interval '1 second' WHERE id=$1",[eventId]);
  assert.equal((await call(`events/${eventId}/register`,'POST',{roundIds:[roundId]},late.cookie)).status,403);
  const expectedRevision=(await current()).revision;
  const [review,publish]=await Promise.all([call(`admin/submissions/${submission.id}`,'PATCH',{status:'APPROVED',expectedRevision},owner.cookie),call(`admin/events/${eventId}/rounds/${roundId}/publish`,'POST',{},owner.cookie)]);
  assert.equal(review.status,200);assert.ok([200,409].includes(publish.status));
  if(publish.status===409) assert.equal((await call(`admin/events/${eventId}/rounds/${roundId}/publish`,'POST',{},owner.cookie)).status,200);
  assert.equal((await call(`admin/submissions/${submission.id}`,'PATCH',{status:'REJECTED',expectedRevision:review.data.revision},owner.cookie)).status,409);
  const [saved]=await query('SELECT status,video_url FROM submissions WHERE id=$1',[submission.id]);assert.equal(saved.status,'APPROVED');assert.equal(saved.video_url,'https://example.test/evidence');
  assert.equal((await call(`admin/events/${eventId}/participants/${member.id}`,'DELETE',{},owner.cookie)).status,409);
  assert.equal((await call(`events/${eventId}/register`,'POST',{roundIds:[roundId]},member.cookie)).status,403);
 } finally {if(eventId)await query('DELETE FROM events WHERE id=$1',[eventId]);if(ids.length)await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await pool.end();}
});
