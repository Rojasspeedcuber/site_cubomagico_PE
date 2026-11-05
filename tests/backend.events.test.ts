import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleApi } from '../lib/api.ts';
import { pool, query } from '../lib/db.ts';
const origin=process.env.APP_URL || 'http://localhost:3000';
const call=async(path:string,method='GET',data?:unknown,cookie?:string)=>{
 const response=await handleApi(new Request(`${origin}/api/${path}`,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)}));
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
};
test('event lifecycle persists random scrambles, hides drafts, owner RBAC, selected rounds and public privacy', {skip:!process.env.DATABASE_URL},async()=>{
 const ids:string[]=[]; let eventId:string|undefined;
 try {
  async function account(role='COMPETITOR') {
   const res=await call('auth/register','POST',{displayName:'Fixture privada',email:`flow-${randomUUID()}@example.test`,password:'sufficient-test-password'});
   assert.equal(res.status,201,JSON.stringify(res.body)); ids.push(res.body.data.id);
   if(role!=='COMPETITOR') await query('UPDATE users SET role=$1 WHERE id=$2',[role,res.body.data.id]);
   return {id:res.body.data.id,cookie:res.cookie!};
  }
  const owner=await account('ORGANIZER'), rival=await account('ORGANIZER'), member=await account(), admin=await account('ADMIN');
  const now=Date.now(), iso=(offset:number)=>new Date(now+offset).toISOString();
  const created=await call('admin/events','POST',{name:'Evento privado de teste',description:'Fixture removida no fim',rules:'Não oficial',registrationOpen:iso(-60000),registrationClose:iso(3600000)},owner.cookie);
  assert.equal(created.status,201,JSON.stringify(created.body)); eventId=created.body.data.id;
  assert.equal((await call(`events/${eventId}`)).status,404);
  assert.equal((await call(`admin/events/${eventId}`,'PATCH',{name:'Ataque'},rival.cookie)).status,403);
  const rounds=[];
  for(const puzzle of ['333','222','pyram']) {
   const round=await call(`admin/events/${eventId}/rounds`,'POST',{name:puzzle,puzzle,format:puzzle==='333'?'AO5':'MO3',opensAt:iso(3700000),closesAt:iso(7200000),videoRequired:true},owner.cookie);
   assert.equal(round.status,201,JSON.stringify(round.body)); assert.equal(round.body.data.scrambles,undefined); rounds.push(round.body.data);
  }
  const round=rounds[0];
  const stored=await query('SELECT scrambles,format FROM rounds WHERE event_id=$1',[eventId]);
  assert.equal(stored.length,3); for(const row of stored) {assert.equal(row.scrambles.length,row.format==='AO5'?5:3); assert.ok(row.scrambles.every((s:string)=>s.length>5));}
  const openedEvent=await call(`admin/events/${eventId}`,'PATCH',{status:'OPEN'},owner.cookie);
  assert.equal(openedEvent.status,200);
  assert.equal(openedEvent.body.data.description,'Fixture removida no fim','status patch must not erase description');
  assert.equal(openedEvent.body.data.rules,'Não oficial','status patch must not erase rules');
  assert.deepEqual((await call(`events/${eventId}/rounds/${round.id}`)).body.data.scrambles,[]);
  assert.equal((await call(`events/${eventId}/register`,'POST',{roundIds:[round.id]},member.cookie)).status,200);
  assert.equal((await call(`admin/events/${eventId}/participants`,'GET',undefined,rival.cookie)).status,403);
  assert.equal((await call(`admin/events/${eventId}/participants`,'GET',undefined,owner.cookie)).body.data.length,1);
  await query("UPDATE rounds SET opens_at=clock_timestamp()-interval '1 minute' WHERE event_id=$1",[eventId]);
  const opened=await call(`events/${eventId}/rounds/${round.id}`,'GET',undefined,member.cookie);
  assert.deepEqual(opened.body.data.scrambles,stored.find(r=>r.format==='AO5').scrambles);
  assert.deepEqual((await call(`events/${eventId}/rounds/${rounds[1].id}`,'GET',undefined,member.cookie)).body.data.scrambles,[]);
  const attempts=[1000,1100,1200,1300,1400].map(timeCs=>({timeCs,penalty:'NONE'}));
  const endpoint=`events/${eventId}/rounds/${round.id}/submissions`;
  assert.equal((await call(endpoint,'POST',{attempts},member.cookie)).status,400);
  assert.equal((await call(endpoint,'POST',{attempts,videoUrl:'https://example.test/private-video'},rival.cookie)).status,403);
  assert.equal((await call(endpoint,'POST',{attempts,videoUrl:'javascript:alert(1)'},member.cookie)).status,400);
  assert.equal((await call(endpoint,'POST',{attempts,videoUrl:'https://example.test/private-video'},member.cookie)).status,200);
  const pending=await call(`admin/events/${eventId}/submissions`,'GET',undefined,owner.cookie); const submission=pending.body.data[0];
  assert.equal(submission.videoUrl,'https://example.test/private-video');
  const reviewPath=`admin/submissions/${submission.id}`;
  assert.equal((await call(reviewPath,'PATCH',{status:'APPROVED',reviewNote:'ok',expectedRevision:submission.revision},rival.cookie)).status,403);
  const approved=await call(reviewPath,'PATCH',{status:'APPROVED',reviewNote:'ok',expectedRevision:submission.revision},owner.cookie);
  assert.equal(approved.status,200);
  const correctedAttempts=attempts.map(a=>({...a,timeCs:a.timeCs+100}));
  const replaced=await call(endpoint,'POST',{attempts:correctedAttempts,videoUrl:'https://example.test/corrected'},member.cookie);
  assert.equal(replaced.status,200);
  assert.equal(replaced.body.data.id,submission.id,'resubmission keeps the same ID');
  for(const status of ['APPROVED','REJECTED']) {
   const stale=await call(reviewPath,'PATCH',{status,expectedRevision:submission.revision},owner.cookie);
   assert.equal(stale.status,409,'review must reject unseen replacement attempts/video');
   assert.match(stale.body.error,/alterado|atualiz|recarreg/i);
  }
  assert.equal(submission.revision,1);
  assert.ok(approved.body.data.revision>submission.revision);
  assert.ok(replaced.body.data.revision>approved.body.data.revision);
  const current=async()=> (await call(`admin/events/${eventId}/submissions`,'GET',undefined,owner.cookie)).body.data[0];
  const beforeRequest=await current();
  assert.equal(beforeRequest.revision,replaced.body.data.revision);
  assert.deepEqual(beforeRequest.attempts,correctedAttempts);
  assert.equal(beforeRequest.videoUrl,'https://example.test/corrected');
  assert.equal(beforeRequest.status,'PENDING');
  for(const expectedRevision of [undefined,0,-1,1.5,'1',null]) {
   assert.equal((await call(reviewPath,'PATCH',{status:'APPROVED',expectedRevision},owner.cookie)).status,400,'a positive integer revision is mandatory');
  }
  assert.equal((await call(`admin/events/${eventId}/participants/${member.id}/video-request`,'POST',{roundId:round.id,message:'Mostrar inspeção'},owner.cookie)).status,200);
  for(const status of ['APPROVED','REJECTED']) {
   assert.equal((await call(reviewPath,'PATCH',{status,expectedRevision:beforeRequest.revision},owner.cookie)).status,409,'video request invalidates previously viewed submission even when video exists');
  }
  let latest=await current();
  assert.ok(latest.revision>beforeRequest.revision);
  assert.equal(latest.status,'PENDING');
  assert.equal((await call(reviewPath,'PATCH',{status:'REJECTED',reviewNote:'Verificar vídeo',expectedRevision:latest.revision},owner.cookie)).status,200);
  latest=await current();
  assert.equal(latest.status,'REJECTED');
  assert.equal((await call(`admin/events/${eventId}/participants/${member.id}/video-request`,'POST',{roundId:round.id,message:'Mostrar nova inspeção'},owner.cookie)).status,200);
  assert.equal((await call(reviewPath,'PATCH',{status:'APPROVED',expectedRevision:latest.revision},owner.cookie)).status,409,'updating a video request also invalidates review');
  assert.equal((await current()).status,'PENDING');
  assert.equal((await call(`events/${eventId}/rounds/${round.id}`,'GET',undefined,member.cookie)).body.data.videoRequest.message,'Mostrar nova inspeção');
  assert.deepEqual((await call(`events/${eventId}/rounds/${round.id}`)).body.data.results,[]);
  assert.ok((await call(`admin/events/${eventId}/rounds/${round.id}/publish`,'POST',{},owner.cookie)).status>=400);
  await query("UPDATE rounds SET closes_at=clock_timestamp()-interval '1 second' WHERE id=$1",[round.id]);
  assert.equal((await call(endpoint,'POST',{attempts,videoUrl:'https://example.test/late'},member.cookie)).status,403);
  assert.equal((await call(`admin/events/${eventId}/rounds/${round.id}/publish`,'POST',{},owner.cookie)).status,409);
  const finalReview=await call(reviewPath,'PATCH',{status:'APPROVED',reviewNote:'final',expectedRevision:(await current()).revision},owner.cookie);
  assert.equal(finalReview.status,200);
  assert.equal((await call(`admin/events/${eventId}/rounds/${round.id}/publish`,'POST',{},owner.cookie)).status,200);
  const publicRound=(await call(`events/${eventId}/rounds/${round.id}`)).body.data;
  assert.equal(publicRound.results[0].averageCs,1300); assert.equal(publicRound.results[0].rank,1);
  assert.equal(publicRound.results[0].revision,undefined,'review revisions are not part of public rankings');
  assert.ok(!JSON.stringify(publicRound).includes('example.test')); assert.equal(publicRound.mySubmission,null);
  assert.equal((await call(reviewPath,'PATCH',{status:'REJECTED',expectedRevision:finalReview.body.data.revision},admin.cookie)).status,409);
  assert.equal((await call('admin/audit','GET',undefined,owner.cookie)).status,403);
  assert.ok((await call('admin/audit','GET',undefined,admin.cookie)).body.data.some((a:any)=>a.action==='ROUND_PUBLISHED'));
 } finally {if(eventId) await query('DELETE FROM events WHERE id=$1',[eventId]); if(ids.length) await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]); await pool.end();}
});
