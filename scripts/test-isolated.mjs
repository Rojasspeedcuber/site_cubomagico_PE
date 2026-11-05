import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export function isolatedDatabaseUrl(connectionString, schema) {
  if (!/^cubo_test_[a-z0-9_]+$/.test(schema)) throw new Error('Schema de teste inválido.');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Conexão PostgreSQL inválida.');
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.href;
}

async function run(command, env) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, command, { env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (code !== 0) throw new Error(`Etapa de testes encerrou com código ${code}.`);
}

export function unitEnvironment(environment) {
  const { DATABASE_URL, ...safe } = environment;
  return safe;
}

async function main() {
  const tests = (await readdir('tests')).filter(name => name.endsWith('.test.ts')).sort().map(name => `tests/${name}`);
  if (process.argv.includes('--unit')) {
    await run(['--import', 'tsx', '--test', ...tests], unitEnvironment(process.env));
    return;
  }
  loadEnvFile('.env.test.local');
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL em .env.test.local para um banco de testes.');
  const schema = `cubo_test_${randomUUID().replaceAll('-', '')}`;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let created = false;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const env = { ...process.env, DATABASE_URL: isolatedDatabaseUrl(process.env.DATABASE_URL, schema), NODE_ENV: 'test' };
    console.log(`Suíte isolada no schema ${schema}; o schema da aplicação não será usado.`);
    await run(['--import', 'tsx', 'scripts/migrate.ts'], env);
    await run(['--import', 'tsx', 'scripts/seed.ts'], env);
    await run(['--import', 'tsx', '--test', ...tests], env);
  } finally {
    if (created) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      console.log(`Schema de teste ${schema} removido.`);
    }
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha no runner de testes.'); process.exitCode = 1; });
}
