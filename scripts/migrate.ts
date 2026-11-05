import '../lib/env.ts';
import { readdir, readFile } from 'node:fs/promises';
import { pool, query, transaction } from '../lib/db.ts';
export async function migrate() {
 await transaction(async db => {
  await query("SELECT pg_advisory_xact_lock(1865264829)",[],db);
  await query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',[],db);
  const applied = new Set((await query('SELECT name FROM schema_migrations',[],db)).map(r=>r.name));
  for (const name of (await readdir(new URL('../db/',import.meta.url))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()) {
   if(applied.has(name)) continue;
   await query(await readFile(new URL(`../db/${name}`,import.meta.url),'utf8'),[],db);
   await query('INSERT INTO schema_migrations(name) VALUES($1)',[name],db);
   console.log(`Migração aplicada: ${name}`);
  }
 });
}
try { await migrate(); } catch(error) { console.error('Falha na migração:',error instanceof Error ? error.message : 'erro'); process.exitCode=1; } finally { await pool.end(); }
