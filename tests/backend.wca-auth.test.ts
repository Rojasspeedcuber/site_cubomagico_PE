import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

const env = {WCA_CLIENT_ID:'test-client',WCA_CLIENT_SECRET:'test-secret',APP_URL:'https://example.test'};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

// These tests never load environment files or call the live WCA provider.
test('WCA remains explicitly unavailable without complete, safe server configuration', async () => {
 const { createWcaAuthHandler } = await import('../lib/wca-auth.ts');
 for (const env of [{}, {WCA_CLIENT_ID:'id', WCA_CLIENT_SECRET:'secret'}, {WCA_CLIENT_ID:'id',WCA_CLIENT_SECRET:'secret',APP_URL:'http://unsafe.example'}, {WCA_CLIENT_ID:'id',WCA_CLIENT_SECRET:'secret',APP_URL:'https://example.test/redirect'}]) {
  const handler = createWcaAuthHandler({env:()=>env});
  const capabilities = await handler(new Request('https://example.test/api/wca/capabilities'),null);
  assert.deepEqual(await capabilities!.json(),{data:{enabled:false}});
  for (const path of ['start','callback?code=x&state=x']) {
   const response = await handler(new Request(`https://example.test/api/wca/${path}`),null);
   assert.equal(response!.status,503);
   assert.match((await response!.json()).error,/indisponível/i);
  }
 }
});

test('start persists only hashes, binds a secure browser cookie and fixes redirect and minimum scopes', async () => {
 const { createWcaAuthHandler } = await import('../lib/wca-auth.ts');
 const saved: string[][] = [];
 const handler = createWcaAuthHandler({env:()=>env,
  saveState:async (state: string,browser: string) => {saved.push([state,browser]);},
 });
 const response = await handler(new Request(`${env.APP_URL}/api/wca/start?next=https://evil.test`),null);
 assert.equal(response!.status,302);
 const url = new URL(response!.headers.get('location')!);
 assert.equal(url.origin,'https://www.worldcubeassociation.org');
 assert.equal(url.pathname,'/oauth/authorize');
 assert.equal(url.searchParams.get('redirect_uri'),`${env.APP_URL}/api/wca/callback`);
 assert.equal(url.searchParams.get('scope'),'public email');
 assert.equal(url.searchParams.get('response_type'),'code');
 assert.equal(url.searchParams.get('client_secret'),null);
 const state = url.searchParams.get('state')!;
 assert.match(state,/^[a-f0-9]{64}$/);
 const cookie = response!.headers.get('set-cookie')!;
 assert.match(cookie,/HttpOnly; SameSite=Lax; Path=\/api\/wca; Max-Age=600; Secure/);
 const browser = cookie.split(';')[0].split('=')[1];
 assert.match(browser,/^[a-f0-9]{64}$/);
 assert.deepEqual(saved,[[hash(state),hash(browser)]]);
 assert.notEqual(state,browser);
 assert.equal(response!.headers.get('cache-control'),'no-store');
});

test('callback rejects missing, mismatched, expired, duplicate or replayed state before calling WCA', async () => {
 const { createWcaAuthHandler } = await import('../lib/wca-auth.ts');
 let consumed = 0;
 let fetched = 0;
 const state = 'a'.repeat(64), browser = 'b'.repeat(64);
 const handler = createWcaAuthHandler({env:()=>env,
  consumeState:async (s,b) => {consumed++; assert.equal(s,hash(state)); assert.equal(b,hash(browser)); return false;},
  fetch:async () => {fetched++; throw new Error('No provider call with invalid state');},
 });
 for (const [params,cookie] of [
  [`code=x&state=${state}`, ''],
  ['code=x&state=invalid',`wca_browser=${browser}`],
  [`code=x&state=${state}&state=${state}`,`wca_browser=${browser}`],
  [`code=x&state=${state}`,`wca_browser=${browser}`],
  [`code=x&state=${state}`,`wca_browser=${browser}`],
 ]) {
  const response = await handler(new Request(`${env.APP_URL}/api/wca/callback?${params}`,{headers:{cookie}}),null);
  assert.equal(response!.status,400);
  assert.match((await response!.json()).error,/inválid|expir/i);
  assert.match(response!.headers.get('set-cookie')!,/Max-Age=0/);
 }
 assert.equal(consumed,2);
 assert.equal(fetched,0);
});

test('callback consumes state once, exchanges authorization code and sets only a local session', async () => {
 const { createWcaAuthHandler } = await import('../lib/wca-auth.ts');
 const calls: string[] = [];
 const providerUser = {id:1234,name:'Pessoa WCA',email:'pessoa@example.test',wca_id:null};
 let used = false;
 const handler = createWcaAuthHandler({env:()=>env,
  consumeState:async () => {if(used)return false; used=true; calls.push('consume'); return true;},
  fetch:async (input,init) => {
   calls.push(String(input));
   assert.equal(init?.redirect,'error');
   assert.equal(init?.cache,'no-store');
   assert.ok(init?.signal instanceof AbortSignal);
   if (String(input).endsWith('/oauth/token')) {
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('grant_type'),'authorization_code');
    assert.equal(body.get('client_secret'),env.WCA_CLIENT_SECRET);
    assert.equal(body.get('redirect_uri'),`${env.APP_URL}/api/wca/callback`);
    assert.equal(body.get('code'),'code-from-provider');
    return Response.json({access_token:'provider-access',token_type:'bearer',scope:'public email'});
   }
   assert.equal(new Headers(init?.headers).get('authorization'),'Bearer provider-access');
   return Response.json({me:providerUser});
  },
  login:async profile => {assert.deepEqual(profile,{providerId:'1234',name:'Pessoa WCA',email:'pessoa@example.test',wcaId:''}); calls.push('login');return 'session=local; HttpOnly; SameSite=Lax; Path=/; Secure';},
 });
 const request = new Request(`${env.APP_URL}/api/wca/callback?code=code-from-provider&state=${'a'.repeat(64)}&next=https://evil.test`,{headers:{cookie:`wca_browser=${'b'.repeat(64)}`}});
 const response = await handler(request,null);
 assert.equal(response!.status,303);
 assert.equal(response!.headers.get('location'),`${env.APP_URL}/conta`);
 assert.equal(response!.headers.getSetCookie().length,2);
 assert.ok(response!.headers.getSetCookie().some(c=>c.startsWith('session=local')));
 assert.ok(!JSON.stringify([...response!.headers]).includes('provider-access'));
 assert.deepEqual(calls,['consume','https://www.worldcubeassociation.org/oauth/token','https://www.worldcubeassociation.org/api/v0/me','login']);
 assert.equal((await handler(request,null))!.status,400);
 assert.equal(calls.length,4);
});

test('account selection trusts only the provider user id and never links email or self-declared WCA id', async () => {
 const { resolveWcaAccount } = await import('../lib/wca-auth.ts');
 const profile = {providerId:'1234',email:'pessoa@example.test',name:'Pessoa WCA',wcaId:'2020TEST01'};
 let created = 0;
 const repository = {
  findMapped:async () => 'mapped-local-uuid' as string | null,
  hasCollision:async ():Promise<boolean> => {throw new Error('Mapped identity must not be reassigned by email');},
  create:async () => {created++; return 'new-local-uuid';},
 };
 assert.equal(await resolveWcaAccount(profile,repository),'mapped-local-uuid');
 assert.equal(created,0);
 repository.findMapped = async () => null;
 repository.hasCollision = async () => true;
 await assert.rejects(resolveWcaAccount(profile,repository),error => (error as any).status===409 && /suporte/i.test((error as Error).message));
 assert.equal(created,0);
 repository.hasCollision = async () => false;
 assert.equal(await resolveWcaAccount(profile,repository),'new-local-uuid');
 assert.equal(created,1);
});

test('the current official /me user envelope works as well as the legacy documented me envelope', async () => {
 const {createWcaAuthHandler} = await import('../lib/wca-auth.ts');
 let loggedIn = false;
 const handler = createWcaAuthHandler({env:()=>env,consumeState:async()=>true,
  fetch:async url => String(url).endsWith('/oauth/token')
   ? Response.json({access_token:'test-access',token_type:'bearer'})
   : Response.json({user:{id:1234,name:'Pessoa WCA',email:'pessoa@example.test',wca_id:null}}),
  login:async profile=>{assert.equal(profile.providerId,'1234');loggedIn=true;return 'session=local';},
 });
 const response = await handler(new Request(`${env.APP_URL}/api/wca/callback?code=test&state=${'a'.repeat(64)}`,{headers:{cookie:`wca_browser=${'b'.repeat(64)}`}}),null);
 assert.equal(response!.status,303);
 assert.equal(loggedIn,true);
});

test('an existing local session cannot silently switch accounts or imply consent to WCA linking', async () => {
 const { createWcaAuthHandler } = await import('../lib/wca-auth.ts');
 const handler = createWcaAuthHandler({env:()=>env,saveState:async()=>{throw new Error('Must not start OAuth');},consumeState:async()=>{throw new Error('Must not consume');}});
 const user = {id:'local',displayName:'Local',role:'COMPETITOR' as const,city:'',photoUrl:'',wcaId:''};
 for (const path of ['start','callback?code=x&state=x']) {
  const response = await handler(new Request(`${env.APP_URL}/api/wca/${path}`),user);
  assert.equal(response!.status,409);
  assert.match((await response!.json()).error,/conta|suporte/i);
 }
});

test('WCA UI defaults to disabled instead of offering an unconfigured login', async () => {
 const {renderToStaticMarkup} = await import('react-dom/server');
 const {createElement} = await import('react');
 const {WcaLogin} = await import('../components/WcaLogin.tsx');
 const markup = renderToStaticMarkup(createElement(WcaLogin));
 assert.match(markup,/disabled/);
 assert.match(markup,/Verificando disponibilidade/);
 assert.ok(!markup.includes('href="/api/wca/start"'));
});

test('malformed provider identities never reach account creation (including control characters)', async () => {
 const {createWcaAuthHandler} = await import('../lib/wca-auth.ts');
 const base = {id:1234,email:'pessoa@example.test',name:'Pessoa WCA',wca_id:'2020TEST01'};
 for (const invalid of [{id:'1234'},{id:0},{email:null},{email:'pessoa\u0000@example.test'},{name:'Pessoa\u0000 WCA'},{wca_id:'2020test01'}]) {
  let loggedIn = false;
  const handler = createWcaAuthHandler({env:()=>env,consumeState:async()=>true,
   fetch:async url => String(url).endsWith('/oauth/token') ? Response.json({access_token:'test-access',token_type:'bearer'}) : Response.json({me:{...base,...invalid}}),
   login:async()=>{loggedIn=true;return 'session=bad';},
  });
  const response = await handler(new Request(`${env.APP_URL}/api/wca/callback?code=test-code&state=${'a'.repeat(64)}`,{headers:{cookie:`wca_browser=${'b'.repeat(64)}`}}),null);
  assert.equal(response!.status,502,JSON.stringify(invalid));
  assert.equal(loggedIn,false);
 }
});

test('provider refusal and network/HTTP/JSON failures burn state without leaking provider details', async () => {
 const {createWcaAuthHandler} = await import('../lib/wca-auth.ts');
 let consumed = 0, fetched = 0;
 const deny = createWcaAuthHandler({env:()=>env,consumeState:async()=>{consumed++;return true;},fetch:async()=>{fetched++;throw new Error('must-not-fetch');}});
 const cookie = `wca_browser=${'b'.repeat(64)}`;
 const denied = await deny(new Request(`${env.APP_URL}/api/wca/callback?state=${'a'.repeat(64)}&error=access_denied&error_description=DO_NOT_ECHO`,{headers:{cookie}}),null);
 assert.equal(denied!.status,400);
 assert.equal(consumed,1);assert.equal(fetched,0);
 assert.ok(!(await denied!.text()).includes('DO_NOT_ECHO'));
 for (const providerFetch of [
  async()=>{throw new Error('SECRET_PROVIDER_DETAILS');},
  async()=>new Response('SECRET_PROVIDER_DETAILS',{status:500}),
  async()=>new Response('not-json'),
  async()=>Response.json({access_token:'bad\r\nheader',token_type:'bearer'}),
 ]) {
  const handler = createWcaAuthHandler({env:()=>env,consumeState:async()=>true,fetch:providerFetch,login:async()=>{throw new Error('must-not-login');}});
  const response = await handler(new Request(`${env.APP_URL}/api/wca/callback?state=${'a'.repeat(64)}&code=test`,{headers:{cookie}}),null);
  assert.equal(response!.status,502);
  assert.ok(!(await response!.text()).includes('SECRET_PROVIDER_DETAILS'));
  assert.match(response!.headers.get('set-cookie')!,/Max-Age=0/);
 }
});

// Executed only by the parent's isolated integration runner, never against the application schema.
test('PostgreSQL persists browser-bound expiring state atomically and protects account collisions', {skip:!process.env.DATABASE_URL}, async () => {
 const {saveWcaState,consumeWcaState,loginWcaAccount} = await import('../lib/wca-auth.ts');
 const {query,pool} = await import('../lib/db.ts');
 const {verifyPassword,sessionUser} = await import('../lib/auth.ts');
 const state = hash(randomBytes(32).toString('hex')), browser = hash(randomBytes(32).toString('hex'));
 const emails = [`wca-${randomUUID()}@example.test`,`wca-${randomUUID()}@example.test`];
 const providerId = String(randomInt(1_000_000_000,999_999_999_999));
 const profile = {providerId,email:emails[0],name:'Teste WCA',wcaId:''};
 const [schema] = await query('SELECT current_schema() AS name');
 assert.match(schema.name,/^cubo_test_[a-z0-9_]+$/,'This test requires the isolated integration runner');
 try {
  await saveWcaState(state,browser);
  const [stored] = await query('SELECT * FROM wca_oauth_states WHERE state_hash=$1',[state]);
  assert.equal(stored.browser_hash,browser);
  assert.ok(new Date(stored.expires_at).getTime()>Date.now());
  assert.equal(await consumeWcaState(state,hash('another-browser')),false);
  const results = await Promise.all([consumeWcaState(state,browser),consumeWcaState(state,browser)]);
  assert.deepEqual(results.sort(),[false,true]);
  await saveWcaState(state,browser);
  await query("UPDATE wca_oauth_states SET expires_at=clock_timestamp()-interval '1 second' WHERE state_hash=$1",[state]);
  assert.equal(await consumeWcaState(state,browser),false);

  const cookie = await loginWcaAccount(profile);
  const actor = await sessionUser(new Request(`${env.APP_URL}/api/session`,{headers:{cookie:cookie.split(';')[0]}}));
  assert.equal(actor!.role,'COMPETITOR');
  const [user] = await query('SELECT * FROM users WHERE email=$1',[emails[0]]);
  assert.equal(user.id,actor!.id);
  assert.equal(await verifyPassword('!wca-oauth-only',user.password_hash),false);
  const mapping = await query('SELECT * FROM wca_accounts WHERE wca_user_id=$1',[providerId]);
  assert.equal(mapping.length,1);assert.equal(mapping[0].user_id,user.id);
  // Email changes at the provider must never reassign an established identity.
  await loginWcaAccount({...profile,email:emails[1]});
  assert.equal((await query('SELECT * FROM users WHERE email=$1',[emails[1]])).length,0);
  await assert.rejects(loginWcaAccount({...profile,providerId:String(Number(providerId)+1)}),error=>(error as any).status===409);
  // Even a user-entered WCA ID is only a collision signal, never a linking credential.
  const declaredId = `${randomInt(2000,2099)}TEST${String(randomInt(10,99))}`;
  await query('UPDATE users SET wca_id=$1 WHERE id=$2',[declaredId,user.id]);
  await assert.rejects(loginWcaAccount({...profile,providerId:String(Number(providerId)+2),email:emails[1],wcaId:declaredId}),error=>(error as any).status===409);
  assert.equal((await query('SELECT * FROM users WHERE email=$1',[emails[1]])).length,0);
  const nextProfile = {...profile,providerId:String(Number(providerId)+3),email:emails[1]};
  await Promise.all([loginWcaAccount(nextProfile),loginWcaAccount(nextProfile)]);
  assert.equal((await query('SELECT * FROM wca_accounts WHERE wca_user_id=$1',[nextProfile.providerId])).length,1);
 } finally {
  await query('DELETE FROM wca_oauth_states WHERE state_hash=$1',[state]);
  await query('DELETE FROM users WHERE email=ANY($1::text[])',[emails]);
  await pool.end();
 }
});
