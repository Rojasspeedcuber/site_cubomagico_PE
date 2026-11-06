import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { isolatedDatabaseUrl } from './test-isolated.mjs';

export function browserEnvironment(environment, schema, storage, port) {
 const {RESEND_API_KEY,MAIL_FROM,WCA_CLIENT_ID,WCA_CLIENT_SECRET,...safe}=environment;
 return {...safe,DATABASE_URL:isolatedDatabaseUrl(environment.DATABASE_URL,schema),MEDIA_STORAGE_DIR:storage,APP_URL:`http://127.0.0.1:${port}`,E2E_BASE_URL:`http://127.0.0.1:${port}`,NODE_ENV:'production'};
}
function child(args,env) {
 const process=spawn(globalThis.process.execPath,args,{env,stdio:'inherit'});
 const done=new Promise((resolve,reject)=>{process.once('error',reject);process.once('exit',code=>resolve(code ?? 1));});
 return {process,done};
}
async function run(args,env) {
 if(await child(args,env).done!==0) throw new Error('Etapa do teste de navegador falhou.');
}
async function main() {
 loadEnvFile('.env.test.local');
 if(!process.env.DATABASE_URL) throw new Error('Configure um banco exclusivo de testes em .env.test.local.');
 const schema=`cubo_test_${randomUUID().replaceAll('-','')}`;
 const storage=await mkdtemp(join(tmpdir(),'cubo-media-e2e-'));
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
 let server,created=false;
 try {
  await pool.query(`CREATE SCHEMA "${schema}"`);created=true;
  const env={...browserEnvironment(process.env,schema,storage,3199),RESEND_API_KEY:'',MAIL_FROM:'',WCA_CLIENT_ID:'',WCA_CLIENT_SECRET:''};
  await run(['--import','tsx','scripts/migrate.ts'],env);
  await run(['--import','tsx','scripts/seed.ts'],env);
  server=child(['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3199'],env);
  let ready=false;
  for(let attempt=0;attempt<60;attempt++) {
   if(server.process.exitCode!==null) throw new Error('Servidor de testes encerrou antes de iniciar.');
   try { const res=await fetch(`${env.APP_URL}/api/content`,{signal:AbortSignal.timeout(1000)}); if(res.ok){ready=true;break;} } catch {}
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready) throw new Error('Servidor de testes não iniciou.');
  await run(['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2)],env);
 } finally {
  if(server){server.process.kill('SIGTERM');await server.done;}
  if(created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool.end();
  await rm(storage,{recursive:true,force:true});
 }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{console.error(error instanceof Error?error.message:'Falha no teste de navegador.');process.exitCode=1;});
