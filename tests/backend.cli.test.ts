import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pool,query } from '../lib/db.ts';
const run=promisify(execFile);
test('migration and curated seed are idempotent; CLI promotes only existing real accounts', {skip:!process.env.DATABASE_URL},async()=>{
 const email=`cli-${randomUUID()}@example.test`;let userId:string|undefined;
 try {
  await run(process.execPath,['scripts/migrate.ts']);
  await run(process.execPath,['scripts/seed.ts']);
  const initial=(await query('SELECT id,name,notes FROM algorithms WHERE NOT archived ORDER BY id'));
  assert.ok(initial.length>0);
  await run(process.execPath,['scripts/seed.ts']);
  assert.deepEqual(await query('SELECT id,name,notes FROM algorithms WHERE NOT archived ORDER BY id'),initial);
  const curated=JSON.parse(await readFile(new URL('../data/algorithms.json',import.meta.url),'utf8'));
  assert.ok(curated.every((a:any)=>initial.some(row=>row.id===a.id)));
  const [fixture]=await query("INSERT INTO users(email,password_hash,display_name) VALUES($1,'not-a-login-hash','CLI fixture') RETURNING id",[email]);userId=fixture.id;
  const result=await run(process.execPath,['scripts/admin.ts','--email',email,'--role','ADMIN']);
  assert.ok(!result.stdout.includes('not-a-login-hash'));
  assert.equal((await query('SELECT role FROM users WHERE id=$1',[userId]))[0].role,'ADMIN');
  const missing=`missing-${randomUUID()}@example.test`;
  await assert.rejects(()=>run(process.execPath,['scripts/admin.ts','--email',missing,'--role','ADMIN']));
  assert.equal((await query('SELECT id FROM users WHERE email=$1',[missing])).length,0);
 } finally {if(userId)await query('DELETE FROM users WHERE id=$1',[userId]);await pool.end();}
});
