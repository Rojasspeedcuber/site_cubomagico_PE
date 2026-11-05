import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../lib/api.ts';
import { pool, query } from '../lib/db.ts';
import { randomUUID } from 'node:crypto';
const origin = process.env.APP_URL || 'http://localhost:3000';
const call = (path: string, body?: unknown, cookie?: string, method = body === undefined ? 'GET' : 'POST', customOrigin: string | null = origin) => handleApi(new Request(`${origin}/api/${path}`,{method,headers:{...(customOrigin ? {origin:customOrigin}:{}),...(cookie?{cookie}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));
test('persistent registration, session, profile, logout; cannot self-promote or leak credentials', {skip:!process.env.DATABASE_URL}, async () => {
 const email = `auth-${randomUUID()}@example.test`;
 try {
  const csrf = await call('auth/register',{displayName:'CSRF',email,password:'safe-long-passphrase'},undefined,'POST',null);
  assert.equal(csrf.status,403);
  const res = await call('auth/register',{displayName:'Pessoa teste',email,password:'safe-long-passphrase',role:'ADMIN'});
  assert.equal(res.status,201);
  const data = await res.json(); assert.equal(data.data.role,'COMPETITOR'); assert.equal(data.data.email,undefined); assert.equal(data.data.passwordHash,undefined);
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  assert.ok(res.headers.get('set-cookie')!.includes('HttpOnly'));
  assert.equal((await (await call('session',undefined,cookie)).json()).data.id,data.data.id);
  assert.equal((await call('admin/events',{},cookie)).status,403);
  assert.equal((await call('auth/login',{email,password:'wrong-password'})).status,401);
  const patch = await call('profile',{displayName:'Nome novo',city:'Recife',photoUrl:'',wcaId:''},cookie,'PATCH');
  assert.equal(patch.status,200);
  const stored = await query('SELECT password_hash FROM users WHERE email=$1',[email]);
  assert.ok(!stored[0].password_hash.includes('safe-long-passphrase'));
  assert.equal((await call('auth/logout',{},cookie)).status,200);
  assert.equal((await (await call('session',undefined,cookie)).json()).data,null);
  const login = await call('auth/login',{email,password:'safe-long-passphrase'}); assert.equal(login.status,200);
 } finally {await query('DELETE FROM users WHERE email=$1',[email]); await pool.end();}
});
