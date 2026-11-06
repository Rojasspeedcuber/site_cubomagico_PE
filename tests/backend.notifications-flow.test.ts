import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool, query } from '../lib/db.ts';
import { handleApi } from '../lib/api.ts';

const origin=process.env.APP_URL || 'http://localhost:3000';
async function call(path:string,method='GET',data?:unknown,cookie?:string){
 const response=await handleApi(new Request(`${origin}/api/${path}`,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)}));
 return {status:response.status,data:(await response.json()).data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
test('event review and video requests atomically queue private opt-in notifications and export preferences', {skip:!process.env.DATABASE_URL},async()=>{
 assert.match((await query('SELECT current_schema() AS schema'))[0].schema,/^cubo_test_/);
 const ids:string[]=[];let eventId:string|undefined;
 try {
  const actors=[];
  for(const index of [0,1]){
   const account=await call('auth/register','POST',{displayName:`Notifications fixture ${index}`,email:`notification-flow-${randomUUID()}@example.test`,password:'Private-notification-fixture-password'});
   assert.equal(account.status,201);ids.push(account.data.id);actors.push(account);
  }
  const [owner,member]=actors;
  await query("UPDATE users SET role='ORGANIZER' WHERE id=$1",[owner.data.id]);
  const preferences=await call('notifications/preferences','GET',undefined,member.cookie);
  assert.equal(preferences.status,200);assert.equal(preferences.data.enabled,false);
  assert.equal((await call('notifications/preferences','PATCH',{enabled:true},member.cookie)).status,200);
  const iso=(offset:number)=>new Date(Date.now()+offset).toISOString();
  const event=await call('admin/events','POST',{name:'Notifications flow fixture',registrationOpen:iso(-60000),registrationClose:iso(3600000)},owner.cookie);
  assert.equal(event.status,201);eventId=event.data.id;
  const round=await call(`admin/events/${eventId}/rounds`,'POST',{name:'Round fixture',puzzle:'222',format:'MO3',opensAt:iso(-60000),closesAt:iso(3600000)},owner.cookie);
  assert.equal(round.status,201);
  await call(`admin/events/${eventId}`,'PATCH',{status:'OPEN'},owner.cookie);
  assert.equal((await call(`events/${eventId}/register`,'POST',{roundIds:[round.data.id]},member.cookie)).status,200);
  assert.equal((await call(`events/${eventId}/rounds/${round.data.id}/submissions`,'POST',{attempts:[1000,1100,1200].map(timeCs=>({timeCs,penalty:'NONE'}))},member.cookie)).status,200);
  const submissions=await call(`admin/events/${eventId}/submissions`,'GET',undefined,owner.cookie);
  const submission=submissions.data[0];
  assert.equal((await call(`admin/submissions/${submission.id}`,'PATCH',{status:'APPROVED',expectedRevision:submission.revision,reviewNote:'PRIVATE_REVIEW_NOTE'},owner.cookie)).status,200);
  assert.equal((await call(`admin/events/${eventId}/participants/${member.data.id}/video-request`,'POST',{roundId:round.data.id,message:'PRIVATE_VIDEO_REQUEST'},owner.cookie)).status,200);
  const queued=await query('SELECT kind,target_id,status FROM notification_outbox WHERE user_id=$1 ORDER BY created_at',[member.data.id]);
  assert.equal(queued.length,2);
  assert.deepEqual(queued.map(row=>row.kind).sort(),['SUBMISSION_REVIEW','VIDEO_REQUEST']);
  assert.ok(!JSON.stringify(queued).includes('PRIVATE_'));
  const exported=await call('privacy/export','GET',undefined,member.cookie);
  assert.equal(exported.status,200);assert.equal(exported.data.profile.notifications_enabled,true);assert.equal(exported.data.notifications.length,2);
  await call('notifications/preferences','PATCH',{enabled:false},member.cookie);
  assert.ok((await query('SELECT status FROM notification_outbox WHERE user_id=$1',[member.data.id])).every(row=>row.status==='CANCELLED'));
  assert.equal((await call(`admin/events/${eventId}/participants/${member.data.id}/video-request`,'POST',{roundId:round.data.id,message:'Another request'},owner.cookie)).status,200);
  assert.equal((await query('SELECT id FROM notification_outbox WHERE user_id=$1',[member.data.id])).length,2);
 } finally {if(eventId)await query('DELETE FROM events WHERE id=$1',[eventId]);if(ids.length)await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await pool.end();}
});
