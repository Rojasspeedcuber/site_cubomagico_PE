import { test, expect, type APIRequestContext } from '@playwright/test';
import pg from 'pg';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const origin=process.env.E2E_BASE_URL || 'http://localhost:3000';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
test.afterAll(async()=>{await pool.end();});
async function send(actor:APIRequestContext,path:string,method='GET',data?:unknown,status=200){
 const response=await actor.fetch(`/api/${path}`,{method,data});const body=await response.json();
 expect(response.status(),`${method} ${path}: ${JSON.stringify(body)}`).toBe(status);return body.data;
}

test('conta: foto enviada, perfil salvo, exportação baixada e exclusão confirmada pela interface',async({page,context,playwright})=>{
 test.skip(!process.env.DATABASE_URL);
 const actor=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
 const password=`UI-test-private-${Date.now()}!`;let id:string|undefined;
 try {
  const user=await send(actor,'auth/register','POST',{email:`ui-profile-${Date.now()}@example.invalid`,password,displayName:'Pessoa interface'},201);id=user.id;
  await context.addCookies((await actor.storageState()).cookies);
  await page.goto('/conta');
  await page.getByLabel('Enviar foto',{exact:true}).setInputFiles('public/imgs/logo-cubo-pe.jpeg');
  await expect(page.getByLabel('URL da foto (opcional)')).toHaveValue(/\/api\/media\//);
  const photo=await page.getByLabel('URL da foto (opcional)').inputValue();
  await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();
  await expect(page.getByText('Perfil atualizado.',{exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'Sua foto',exact:true})).toHaveAttribute('src',photo);
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/account-mobile.png',fullPage:true});
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar meus dados',exact:true}).click();
  const download=await downloadPromise;
  const exported=JSON.parse(await readFile((await download.path())!,'utf8'));
  expect(exported.profile.id).toBe(id);expect(exported.profile.photo_url).toBe(photo);
  await page.getByLabel('Senha atual',{exact:true}).fill('incorrect-password');
  await page.getByLabel('Digite EXCLUIR para confirmar',{exact:true}).fill('EXCLUIR');
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Excluir minha conta',exact:true}).click();
  await expect(page.getByText('Senha atual incorreta.',{exact:true})).toBeVisible();
  await page.getByLabel('Senha atual',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Excluir minha conta',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Minha conta',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Entrar na conta',exact:true})).toBeVisible();
  expect((await pool.query('SELECT id FROM users WHERE id=$1',[id])).rowCount).toBe(0);
 } finally {if(id)await pool.query('DELETE FROM users WHERE id=$1',[id]);await actor.dispose();}
});

test('painel: editar e excluir rodada, depois excluir o evento rascunho e voltar à lista',async({page,context,playwright})=>{
 test.skip(!process.env.DATABASE_URL);
 const actor=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
 let id:string|undefined,eventId:string|undefined;
 try {
  const user=await send(actor,'auth/register','POST',{email:`ui-event-${Date.now()}@example.invalid`,password:'Private-ui-event-password',displayName:'Organização interface'},201);id=user.id;
  await pool.query("UPDATE users SET role='ORGANIZER' WHERE id=$1",[id]);
  const iso=(offset:number)=>new Date(Date.now()+offset).toISOString();
  const event=await send(actor,'admin/events','POST',{name:'Rascunho interface',registrationOpen:iso(3600000),registrationClose:iso(7200000)},201);eventId=event.id;
  const round=await send(actor,`admin/events/${eventId}/rounds`,'POST',{name:'Rodada interface',puzzle:'222',format:'MO3',opensAt:iso(10800000),closesAt:iso(14400000)},201);
  await context.addCookies((await actor.storageState()).cookies);await page.goto('/admin');
  await page.locator('.admin-event-list article').filter({hasText:event.name}).getByRole('button',{name:'Gerenciar',exact:true}).click();
  await page.getByRole('button',{name:'Editar Rodada interface',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Nome da rodada',{exact:true}).fill('Rodada revisada');
  await page.getByRole('button',{name:'Salvar rodada',exact:true}).click();
  await expect(page.getByRole('button',{name:'Editar Rodada revisada',exact:true})).toBeVisible();
  expect((await pool.query('SELECT name FROM rounds WHERE id=$1',[round.id])).rows[0].name).toBe('Rodada revisada');
  await page.getByRole('button',{name:'Excluir Rodada revisada',exact:true}).click();
  await page.getByLabel('Digite EXCLUIR para confirmar').fill('EXCLUIR');await page.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();
  await expect(page.getByRole('button',{name:'Editar Rodada revisada',exact:true})).toHaveCount(0);
  expect((await pool.query('SELECT id FROM rounds WHERE id=$1',[round.id])).rowCount).toBe(0);
  await page.getByRole('button',{name:'Excluir evento rascunho',exact:true}).click();
  await page.getByLabel('Digite EXCLUIR para confirmar').fill('EXCLUIR');await page.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();
  await expect(page.getByRole('button',{name:'Novo campeonato',exact:true})).toBeVisible();
  expect((await pool.query('SELECT id FROM events WHERE id=$1',[eventId])).rowCount).toBe(0);
 } finally {if(eventId)await pool.query('DELETE FROM events WHERE id=$1',[eventId]);if(id)await pool.query('DELETE FROM users WHERE id=$1',[id]);await actor.dispose();}
});

test('vídeo: upload MP4 pela interface, envio das tentativas e reprodução autorizada',async({page,context,playwright})=>{
 test.skip(!process.env.DATABASE_URL);test.setTimeout(60000);
 const root=await mkdtemp(join(tmpdir(),'cubo-video-ui-'));
 const video=join(root,'resolucao.mp4');
 const generated=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=64x64:d=1','-c:v','libx264','-pix_fmt','yuv420p','-an',video]);
 expect(generated.status).toBe(0);
 const owner=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
 const actor=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
 const ids:string[]=[];let eventId:string|undefined;
 try {
  for(const [index,client] of [owner,actor].entries()) {
   const account=await send(client,'auth/register','POST',{email:`ui-video-${Date.now()}-${index}@example.invalid`,password:'Private-ui-video-password',displayName:`Vídeo interface ${index}`},201);ids.push(account.id);
  }
  await pool.query("UPDATE users SET role='ORGANIZER' WHERE id=$1",[ids[0]]);
  const iso=(offset:number)=>new Date(Date.now()+offset).toISOString();
  const event=await send(owner,'admin/events','POST',{name:'Vídeo interface fixture',registrationOpen:iso(-60000),registrationClose:iso(3600000)},201);eventId=event.id;
  const round=await send(owner,`admin/events/${eventId}/rounds`,'POST',{name:'Rodada com vídeo',puzzle:'222',format:'MO3',opensAt:iso(-60000),closesAt:iso(3600000),videoRequired:true},201);
  await send(owner,`admin/events/${eventId}`,'PATCH',{status:'OPEN'});
  await send(actor,`events/${eventId}/register`,'POST',{roundIds:[round.id]});
  await context.addCookies((await actor.storageState()).cookies);await page.goto(`/campeonatos/${eventId}`);
  await page.getByLabel('Enviar vídeo',{exact:true}).setInputFiles(video);
  await expect(page.getByRole('textbox',{name:/^Link do vídeo \(obrigatório\)/})).toHaveValue(/\/api\/media\//);
  const url=await page.getByRole('textbox',{name:/^Link do vídeo \(obrigatório\)/}).inputValue();
  for(let i=1;i<=3;i++)await page.getByLabel(`Tentativa ${i}`,{exact:true}).fill(`${10+i},00`);
  await page.getByRole('button',{name:'Enviar para revisão',exact:true}).click();
  await expect(page.getByRole('link',{name:'Abrir vídeo enviado'})).toHaveAttribute('href',url);
  expect((await page.request.get(url)).status()).toBe(200);
  expect((await owner.get(url)).status()).toBe(200);
  const anonymous=await playwright.request.newContext();try{expect((await anonymous.get(url)).status()).toBe(401);}finally{await anonymous.dispose();}
  const playable=await page.evaluate(async url=>new Promise<boolean>(resolve=>{
   const video=document.createElement('video');video.muted=true;video.src=url;video.preload='auto';document.body.append(video);
   const timer=setTimeout(()=>{video.remove();resolve(false);},10000);
   video.onloadeddata=()=>{clearTimeout(timer);const playable=video.videoWidth>0;video.remove();resolve(playable);};
   video.onerror=()=>{clearTimeout(timer);video.remove();resolve(false);};
  }),url);
  expect(playable).toBe(true);
 } finally {
  if(eventId)await pool.query('DELETE FROM events WHERE id=$1',[eventId]);
  if(ids.length)await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
  await owner.dispose();await actor.dispose();await rm(root,{recursive:true,force:true});
 }
});
