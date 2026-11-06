import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const origin=process.env.E2E_BASE_URL || 'http://localhost:3000';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
test.afterAll(async()=>{await pool.end();});

test('identidade oficial, contato e política pública funcionam em tela pequena',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/sobre');
 await expect(page.locator('.brand-logo')).toBeVisible();
 await expect.poll(()=>page.locator('.brand-logo').evaluate((el:HTMLImageElement)=>el.complete && el.naturalWidth>0)).toBe(true);
 await page.getByRole('link',{name:'Privacidade e dados',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Privacidade e dados',exact:true})).toBeVisible();
 await expect(page.getByText(/90 dias/).first()).toBeVisible();
 await expect(page.getByRole('link',{name:'henriquer01@rojasdev.cloud',exact:true})).toHaveAttribute('href','mailto:henriquer01@rojasdev.cloud');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});

test('upload local, exportação e exclusão removem conta e arquivos sem expor dados de terceiros',async({playwright})=>{
 test.skip(!process.env.DATABASE_URL);
 const actor=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
 const anonymous=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
 const password=`Teste-privado-${Date.now()}!`;
 let userId:string|undefined;
 try {
  const register=await actor.post('/api/auth/register',{data:{email:`privacy-${Date.now()}@example.invalid`,password,displayName:'Pessoa de teste'}});
  expect(register.status()).toBe(201);userId=(await register.json()).data.id;
  const upload=await actor.post('/api/media',{multipart:{kind:'photo',file:{name:'autorizada.jpeg',mimeType:'image/jpeg',buffer:await readFile('public/imgs/logo-cubo-pe.jpeg')}}});
  expect(upload.status()).toBe(201);
  const uploaded=(await upload.json()).data;
  expect((await anonymous.get(uploaded.url)).status()).toBe(200);
  expect((await anonymous.get('/api/privacy/export')).status()).toBe(401);
  const exported=await actor.get('/api/privacy/export');expect(exported.status()).toBe(200);
  const exportText=await exported.text();expect(exportText).toContain('Pessoa de teste');expect(exportText).not.toContain('password_hash');
  const capabilities=await actor.get('/api/auth/capabilities');expect(capabilities.status()).toBe(200);
  const unavailable=await actor.post('/api/auth/forgot-password',{data:{email:'missing@example.invalid'}});expect(unavailable.status()).toBe(503);
  const wca=await actor.get('/api/wca/capabilities');expect(wca.status()).toBe(200);expect((await wca.json()).data.enabled).toBe(false);
  expect((await actor.delete('/api/privacy/account',{data:{password:'wrong',confirmation:'EXCLUIR'}})).status()).toBe(401);
  const removed=await actor.delete('/api/privacy/account',{data:{password,confirmation:'EXCLUIR'}});expect(removed.status()).toBe(200);
  expect((await (await actor.get('/api/session')).json()).data).toBe(null);
  expect((await anonymous.get(uploaded.url)).status()).toBe(404);
  expect((await pool.query('SELECT id FROM users WHERE id=$1',[userId])).rowCount).toBe(0);
 } finally {
  if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);
  await actor.dispose();await anonymous.dispose();
 }
});
