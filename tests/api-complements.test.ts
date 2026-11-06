import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../lib/api.ts';

test('WCA capabilities are routed without database access or credentials', async()=>{
 const previous=[process.env.WCA_CLIENT_ID,process.env.WCA_CLIENT_SECRET];
 delete process.env.WCA_CLIENT_ID;delete process.env.WCA_CLIENT_SECRET;
 try {
  const response=await handleApi(new Request('http://localhost:3000/api/wca/capabilities'));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{data:{enabled:false}});
  assert.equal((await handleApi(new Request('http://localhost:3000/api/wca/start'))).status,503);
 } finally {
  for(const [index,key] of ['WCA_CLIENT_ID','WCA_CLIENT_SECRET'].entries()) if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];
 }
});

test('account, media, privacy and lifecycle extensions are routed with authentication enforced',async()=>{
 const origin=process.env.APP_URL || 'http://localhost:3000';
 const previous=[process.env.RESEND_API_KEY,process.env.MAIL_FROM];
 delete process.env.RESEND_API_KEY;delete process.env.MAIL_FROM;
 try {
  const capabilities=await handleApi(new Request(`${origin}/api/auth/capabilities`));
  assert.equal(capabilities.status,200);
  assert.deepEqual(await capabilities.json(),{data:{mailEnabled:false,emailVerificationRequired:false}});
  for(const [path,method] of [['auth/email-status','GET'],['privacy/export','GET'],['privacy/account','DELETE'],['media','POST'],['admin/events/00000000-0000-4000-8000-000000000001/rounds/00000000-0000-4000-8000-000000000002','PATCH']]) {
   const response=await handleApi(new Request(`${origin}/api/${path}`,{method,headers:{origin}}));
   assert.equal(response.status,401,`${method} ${path}`);
  }
  assert.equal((await handleApi(new Request(`${origin}/api/auth/forgot-password`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'missing@example.test'})}))).status,503);
 } finally {
  for(const [index,key] of ['RESEND_API_KEY','MAIL_FROM'].entries()) if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];
 }
});
