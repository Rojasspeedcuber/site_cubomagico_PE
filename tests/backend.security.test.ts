import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword,verifyPassword,tokenHash } from '../lib/auth.ts';
import { handleApi } from '../lib/api.ts';
import { safeUrl,parse,body,parsePatch,eventPatchSchema } from '../lib/validation.ts';
const origin=process.env.APP_URL || 'http://localhost:3000';
test('salted scrypt validates password without reversible storage; session hashes are one-way',async()=>{
 const password='Long private test password';
 const one=await hashPassword(password),two=await hashPassword(password);
 assert.notEqual(one,two);assert.ok(!one.includes(password));
 assert.equal(await verifyPassword(password,one),true);assert.equal(await verifyPassword('wrong',one),false);
 assert.equal(await verifyPassword(password,'malformed'),false);
 assert.match(tokenHash('random session'),/^[a-f0-9]{64}$/);assert.notEqual(tokenHash('one'),tokenHash('two'));
});
test('safe URLs reject active schemes, credentials, relative URLs and oversized inputs',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,bad','file:///root/test','//evil.test','https://user:pass@example.org','https://example.org/'+ 'x'.repeat(2048)]) assert.throws(()=>parse(safeUrl,value));
 for(const value of ['', 'https://example.org/watch?v=a','http://example.org/path']) assert.equal(parse(safeUrl,value),value);
});
test('body parser enforces size and valid JSON, PATCH never invents default fields',async()=>{
 await assert.rejects(()=>body(new Request(origin,{method:'POST',body:'not json'})),/JSON inválido/);
 await assert.rejects(()=>body(new Request(origin,{method:'POST',body:'x'.repeat(100001)})),/Corpo muito grande/);
 assert.deepEqual(parsePatch(eventPatchSchema,{status:'OPEN'}),{status:'OPEN'});
});
test('validation errors are localized in Portuguese',()=>{
 assert.throws(()=>parse(eventPatchSchema,{name:1}),/Entrada inválida/);
});
test('unknown auth suffixes do not execute authentication; malformed path encoding is 400',async()=>{
 const badAuth=await handleApi(new Request(`${origin}/api/auth/register/unexpected`,{method:'POST',headers:{origin},body:'{}'}));
 assert.equal(badAuth.status,404);
 const malformed=await handleApi(new Request(`${origin}/api/events/%ZZ`));assert.equal(malformed.status,400);
});
