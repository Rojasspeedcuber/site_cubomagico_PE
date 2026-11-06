import { randomBytes } from 'node:crypto';
import { createSession, tokenHash } from './auth.ts';
import { query, transaction } from './db.ts';
import { HttpError, type User } from './policy.ts';

type Environment = { WCA_CLIENT_ID?: string; WCA_CLIENT_SECRET?: string; APP_URL?: string; NODE_ENV?: string };
export type WcaProfile = {providerId:string; email:string; name:string; wcaId:string};
type AccountRepository = {
 findMapped: (providerId:string) => Promise<string | null>;
 hasCollision: (email:string,wcaId:string) => Promise<boolean>;
 create: (profile:WcaProfile) => Promise<string>;
};
type Dependencies = {
 env: () => Environment;
 saveState: typeof saveWcaState;
 consumeState: typeof consumeWcaState;
 login: typeof loginWcaAccount;
 fetch: typeof fetch;
};
const collisionMessage = 'Não foi possível vincular esta conta com segurança. Entre com sua conta local e contate o suporte: henriquer01@rojasdev.cloud.';
export async function resolveWcaAccount(profile: WcaProfile, repository: AccountRepository) {
 const mapped = await repository.findMapped(profile.providerId);
 if (mapped) return mapped;
 if (await repository.hasCollision(profile.email,profile.wcaId)) throw new HttpError(409,collisionMessage);
 return repository.create(profile);
}
export async function loginWcaAccount(profile: WcaProfile) {
 try {
  return await transaction(async db => {
   // Serialize first sign-ins for the same immutable provider id across instances.
   await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`wca:${profile.providerId}`],db);
   const userId = await resolveWcaAccount(profile,{
    findMapped:async id => (await query('SELECT user_id FROM wca_accounts WHERE wca_user_id=$1',[id],db))[0]?.user_id ?? null,
    hasCollision:async (email,wcaId) => (await query("SELECT id FROM users WHERE email=$1 OR ($2<>'' AND wca_id=$2) LIMIT 1",[email,wcaId],db)).length > 0,
    create:async p => {
     // An invalid password scheme is deliberately unusable by verifyPassword.
     const [user] = await query("INSERT INTO users(email,password_hash,display_name,wca_id,role) VALUES($1,'!wca-oauth-only',$2,$3,'COMPETITOR') RETURNING id",[p.email,p.name,p.wcaId],db);
     await query('INSERT INTO wca_accounts(wca_user_id,user_id) VALUES($1,$2)',[p.providerId,user.id],db);
     return user.id;
    },
   });
   return createSession(userId,db);
  });
 } catch (error) {
  // Unique constraints also protect concurrent local registrations.
  if ((error as {code?:string})?.code === '23505') throw new HttpError(409,collisionMessage);
  throw error;
 }
}
export async function saveWcaState(stateHash: string, browserHash: string) {
 await query('DELETE FROM wca_oauth_states WHERE expires_at <= clock_timestamp()');
 await query("INSERT INTO wca_oauth_states(state_hash,browser_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '10 minutes')",[stateHash,browserHash]);
}
export async function consumeWcaState(stateHash: string, browserHash: string) {
 const rows = await query('DELETE FROM wca_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>clock_timestamp() RETURNING state_hash',[stateHash,browserHash]);
 return rows.length === 1;
}
function parseProfile(payload: unknown): WcaProfile {
 // Current official controller returns {user}; the published v0 examples use {me}.
 const envelope = payload as {user?:Record<string,unknown>;me?:Record<string,unknown>};
 const me = envelope?.user ?? envelope?.me;
 if (!me || !Number.isSafeInteger(me.id) || (me.id as number) <= 0 || typeof me.email !== 'string' ||
     me.email.length > 254 || /[\x00-\x1f\x7f]/.test(me.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(me.email) ||
     typeof me.name !== 'string' || /[\x00-\x1f\x7f]/.test(me.name) || me.name.trim().length < 2 || me.name.trim().length > 100 ||
     (me.wca_id != null && me.wca_id !== '' && (typeof me.wca_id !== 'string' || !/^[1-9][0-9]{3}[A-Z]{4}[0-9]{2}$/.test(me.wca_id)))) {
  throw new HttpError(502,'A WCA não forneceu os dados necessários para entrar. Autorize o acesso ao e-mail e tente novamente.');
 }
 return {providerId:String(me.id),email:me.email.toLowerCase(),name:me.name.trim(),wcaId:(me.wca_id as string | null) || ''};
}
function configuration(env: Environment) {
 if (!env.WCA_CLIENT_ID?.trim() || !env.WCA_CLIENT_SECRET?.trim() || !env.APP_URL) return null;
 try {
  const url = new URL(env.APP_URL);
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && env.NODE_ENV !== 'production'))) return null;
  return {clientId:env.WCA_CLIENT_ID,clientSecret:env.WCA_CLIENT_SECRET,origin:url.origin,callback:`${url.origin}/api/wca/callback`};
 } catch { return null; }
}
const headers = {'cache-control':'no-store','referrer-policy':'no-referrer'};
function stateCookie(value: string, secure: boolean, clear = false) {
 return `wca_browser=${value}; HttpOnly; SameSite=Lax; Path=/api/wca; Max-Age=${clear ? 0 : 600}${secure ? '; Secure' : ''}`;
}
export function createWcaAuthHandler(overrides: Partial<Dependencies> = {}) {
 const deps: Dependencies = {env:()=>process.env,saveState:saveWcaState,consumeState:consumeWcaState,login:loginWcaAccount,fetch:(...args)=>fetch(...args),...overrides};
 return async (request: Request, user: User | null): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!['/api/wca/capabilities','/api/wca/start','/api/wca/callback'].includes(url.pathname)) return null;
  if (request.method !== 'GET') return Response.json({error:'Método não permitido.'},{status:405,headers:{...headers,allow:'GET'}});
  const config = configuration(deps.env());
  if (url.pathname === '/api/wca/capabilities') return Response.json({data:{enabled:!!config}},{headers});
  if (!config) return Response.json({error:'Login WCA indisponível. Configuração externa pendente.'},{status:503,headers});
  if (user) return Response.json({error:'Você já está em uma conta local. A vinculação WCA exige um processo explícito com o suporte.'},{status:409,headers});
  if (url.pathname === '/api/wca/start') {
   const state = randomBytes(32).toString('hex');
   const browser = randomBytes(32).toString('hex');
   await deps.saveState(tokenHash(state),tokenHash(browser));
   const authorize = new URL('https://www.worldcubeassociation.org/oauth/authorize');
   authorize.search = new URLSearchParams({client_id:config.clientId,redirect_uri:config.callback,response_type:'code',scope:'public email',state}).toString();
   return new Response(null,{status:302,headers:{...headers,location:authorize.href,'set-cookie':stateCookie(browser,config.origin.startsWith('https:'))}});
  }
  const callbackHeaders = new Headers({...headers,'set-cookie':stateCookie('',config.origin.startsWith('https:'),true)});
  try {
   const values = url.searchParams;
   const state = values.get('state') || '';
   const cookies = (request.headers.get('cookie') || '').split(';').map(x=>x.trim()).filter(x=>x.startsWith('wca_browser='));
   const browser = cookies.length === 1 ? cookies[0].slice('wca_browser='.length) : '';
   if (values.getAll('state').length !== 1 || !/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browser) ||
       !await deps.consumeState(tokenHash(state),tokenHash(browser))) throw new HttpError(400,'Solicitação inválida ou expirada. Inicie o login WCA novamente.');
   if (values.has('error')) throw new HttpError(400,'Autorização WCA não concluída. Inicie o login novamente se desejar.');
   const code = values.get('code') || '';
   if (values.getAll('code').length !== 1 || !code || code.length > 2048 || /[\s\x00-\x1f\x7f]/.test(code)) throw new HttpError(400,'Código WCA inválido. Inicie o login novamente.');
   let profile: WcaProfile;
   try {
    const tokenResponse = await deps.fetch('https://www.worldcubeassociation.org/oauth/token',{
     method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},
     body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.callback,code}),
     signal:AbortSignal.timeout(10_000),redirect:'error',cache:'no-store',
    });
    if (!tokenResponse.ok) throw new Error('Token exchange failed');
    const token = await tokenResponse.json();
    if (typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 4096 || /[\s\x00-\x1f\x7f]/.test(token.access_token) ||
        typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer') throw new Error('Invalid provider token');
    const meResponse = await deps.fetch('https://www.worldcubeassociation.org/api/v0/me',{
     headers:{authorization:`Bearer ${token.access_token}`,accept:'application/json'},
     signal:AbortSignal.timeout(10_000),redirect:'error',cache:'no-store',
    });
    if (!meResponse.ok) throw new Error('Profile request failed');
    profile = parseProfile(await meResponse.json());
   } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502,'A WCA está indisponível ou não concluiu a autorização. Tente entrar novamente mais tarde.');
   }
   callbackHeaders.append('set-cookie',await deps.login(profile));
   callbackHeaders.set('location',`${config.origin}/conta`);
   return new Response(null,{status:303,headers:callbackHeaders});
  } catch (error) {
   const status = error instanceof HttpError ? error.status : 503;
   return Response.json({error:error instanceof HttpError ? error.message : 'Login WCA indisponível no momento. Tente novamente mais tarde.'},{status,headers:callbackHeaders});
  }
 };
}
export const handleWcaAuth = createWcaAuthHandler();
