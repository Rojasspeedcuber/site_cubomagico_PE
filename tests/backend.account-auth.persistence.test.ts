import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAccountAuthHandler } from '../lib/account-auth.ts';
import { handleApi } from '../lib/api.ts';
import { pool, query } from '../lib/db.ts';
import { tokenHash, verifyPassword } from '../lib/auth.ts';
import { HttpError } from '../lib/policy.ts';

const origin=process.env.APP_URL || 'http://localhost:3000';
const request=(path:string,data:unknown)=>new Request(`${origin}/api/auth/${path}`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});

test('PostgreSQL account links expire, consume once atomically and reset all sessions', {skip:!process.env.DATABASE_URL},async()=>{
 const [{schema}]=await query('SELECT current_schema() AS schema');
 assert.match(schema,/^cubo_test_/);
 const email=`account-links-${randomUUID()}@example.test`;
 const password='Original-private-test-password';
 const messages:{text:string}[]=[];
 const handler=createAccountAuthHandler({mailEnabled:()=>true,sendMail:async message=>{messages.push(message);}});
 let userId:string|undefined;
 const tokenFromLastMessage=()=>new URLSearchParams(new URL(messages.at(-1)!.text.split('\n')[1]).hash.slice(1)).get('token')!;
 try {
  const registered=await handleApi(new Request(`${origin}/api/auth/register`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email,password,displayName:'Account links fixture'})}));
  assert.equal(registered.status,201);
  const actor=(await registered.json()).data;userId=actor.id;
  const cookie=registered.headers.get('set-cookie')!.split(';')[0];
  await handler(request('request-verification',{}),actor);
  const verification=tokenFromLastMessage();
  assert.match(verification,/^[a-f0-9]{64}$/);
  const [stored]=await query('SELECT * FROM account_tokens WHERE user_id=$1',[userId]);
  assert.equal(stored.token_hash,tokenHash(verification));
  assert.ok(new Date(stored.expires_at).getTime()>Date.now());
  const consumed=await Promise.allSettled([handler(request('verify-email',{token:verification}),null),handler(request('verify-email',{token:verification}),null)]);
  assert.equal(consumed.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(consumed.filter(result=>result.status==='rejected' && result.reason instanceof HttpError && result.reason.status===400).length,1);
  assert.ok((await query('SELECT email_verified_at FROM users WHERE id=$1',[userId]))[0].email_verified_at);
  await handler(request('forgot-password',{email}),null);
  const expired=tokenFromLastMessage();
  await query("UPDATE account_tokens SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE token_hash=$1",[tokenHash(expired)]);
  await assert.rejects(()=>handler(request('reset-password',{token:expired,password:'Replacement-private-password'}),null),{status:400});
  await handler(request('forgot-password',{email}),null);
  const reset=tokenFromLastMessage();
  await assert.rejects(()=>handler(request('verify-email',{token:reset}),null),{status:400});
  const responses=await Promise.allSettled([handler(request('reset-password',{token:reset,password:'Replacement-private-password'}),null),handler(request('reset-password',{token:reset,password:'Replacement-private-password'}),null)]);
  assert.equal(responses.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(responses.filter(result=>result.status==='rejected' && result.reason.status===400).length,1);
  const session=await handleApi(new Request(`${origin}/api/session`,{headers:{cookie}}));
  assert.equal((await session.json()).data,null);
  assert.equal((await query('SELECT 1 FROM sessions WHERE user_id=$1',[userId])).length,0);
  const [row]=await query('SELECT password_hash FROM users WHERE id=$1',[userId]);
  assert.equal(await verifyPassword(password,row.password_hash),false);
  assert.equal(await verifyPassword('Replacement-private-password',row.password_hash),true);
  const unknown=await handler(request('forgot-password',{email:`missing-${randomUUID()}@example.test`}),null);
  assert.match((await unknown!.json()).data.message,/Se houver/);
 } finally {if(userId)await query('DELETE FROM users WHERE id=$1',[userId]);await pool.end();}
});
