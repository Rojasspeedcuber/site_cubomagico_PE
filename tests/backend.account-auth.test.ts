import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { HttpError, type User } from '../lib/policy.ts';
import { tokenHash, verifyPassword } from '../lib/auth.ts';
import type { PoolClient } from 'pg';

const origin = 'https://conta.example.test';
const user: User = { id: 'e1f60e97-a8c1-4804-a5d9-8f7235961aaa', displayName: 'Pessoa', city: '', photoUrl: '', wcaId: '', role: 'COMPETITOR' };
const request = (route: string, payload?: unknown, customOrigin: string | null = origin) => new Request(`${origin}/api/auth/${route}`, {
  method: payload === undefined ? 'GET' : 'POST',
  headers: { ...(customOrigin ? { origin: customOrigin } : {}), 'content-type': 'application/json' },
  body: payload === undefined ? undefined : JSON.stringify(payload),
});

const mailPath = new URL('../lib/mail.ts', import.meta.url);
test('Resend só fica habilitado com chave e remetente configurados', async () => {
  assert.ok(existsSync(mailPath), 'Adaptador de e-mail ainda não implementado');
  const { mailEnabled } = await import('../lib/mail.ts');
  assert.equal(mailEnabled({}), false);
  assert.equal(mailEnabled({ RESEND_API_KEY: 'unit-key' }), false);
  assert.equal(mailEnabled({ MAIL_FROM: 'Cubo <conta@example.test>' }), false);
  assert.equal(mailEnabled({ RESEND_API_KEY: '  ', MAIL_FROM: 'conta@example.test' }), false);
  assert.equal(mailEnabled({ RESEND_API_KEY: 'unit-key', MAIL_FROM: 'Cubo <conta@example.test>' }), true);
});

test('adaptador envia a mensagem pela API Resend sem expor a chave', async () => {
  const mail = await import('../lib/mail.ts');
  assert.equal(typeof mail.sendMail, 'function', 'Envio Resend ainda não implementado');
  const calls: { url: string; init: RequestInit }[] = [];
  const result = await mail.sendMail({ to: 'pessoa@example.test', subject: 'Confirme seu e-mail', text: 'Abra o link seguro.' }, {
    env: { RESEND_API_KEY: 'unit-key', MAIL_FROM: 'Cubo <conta@example.test>' },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return Response.json({ id: 'unit-mail-id' });
    },
  });
  assert.equal(result, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(new Headers(calls[0].init.headers).get('authorization'), 'Bearer unit-key');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    from: 'Cubo <conta@example.test>', to: ['pessoa@example.test'], subject: 'Confirme seu e-mail', text: 'Abra o link seguro.',
  });
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('adaptador não chama rede sem configuração e trata falhas sem vazar resposta do provedor', async () => {
  const { sendMail } = await import('../lib/mail.ts');
  const message = { to: 'pessoa@example.test', subject: 'Assunto', text: 'Texto' };
  let calls = 0;
  await assert.rejects(sendMail(message, { env: {}, fetch: async () => {
    calls++; return Response.json({ id: 'não-deveria-enviar' });
  } }), (error: any) => error.status === 503 && /configurado/i.test(error.message));
  assert.equal(calls, 0);
  const env = { RESEND_API_KEY: 'unit-key', MAIL_FROM: 'conta@example.test' };
  for (const transport of [
    async () => Response.json({ message: 'unit-key pessoa@example.test' }, { status: 422 }),
    async () => { throw new Error('unit-key rede indisponível'); },
    async () => Response.json({}),
    async () => new Response('not-json'),
  ]) {
    await assert.rejects(sendMail(message, { env, fetch: transport }), (error: any) =>
      error.status === 503 && !/unit-key|pessoa@|not-json/.test(error.message));
  }
});

test('capabilities informa disponibilidade sem banco e não intercepta login/cadastro', async () => {
  assert.ok(existsSync(new URL('../lib/account-auth.ts', import.meta.url)), 'Handler de conta ainda não implementado');
  const { createAccountAuthHandler, handleAccountAuth } = await import('../lib/account-auth.ts');
  assert.equal(typeof handleAccountAuth, 'function');
  for (const enabled of [false, true]) {
    const handler = createAccountAuthHandler({ mailEnabled: () => enabled, query: async () => { throw new Error('Não acessar banco'); } });
    const response = (await handler(request('capabilities'), null))!;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { data: { mailEnabled: enabled, emailVerificationRequired: false } });
    assert.equal(await handler(request('login', {}), null), null);
    assert.equal(await handler(request('register', {}), null), null);
  }
});

test('solicitações sem provedor falham claramente sem consultar conta nem gerar token', async () => {
  const { createAccountAuthHandler } = await import('../lib/account-auth.ts');
  const handler = createAccountAuthHandler({ mailEnabled: () => false, appUrl: () => origin,
    query: async () => { assert.fail('Não consultar conta sem e-mail configurado'); },
    rateLimit: async () => {},
  });
  for (const route of ['forgot-password', 'request-verification']) {
    await assert.rejects(handler(request(route, route === 'forgot-password' ? { email: 'pessoa@example.test' } : {}), user),
      (error: any) => error instanceof HttpError && error.status === 503 && /não configurado/i.test(error.message) && !/token/i.test(error.message));
  }
  await assert.rejects(handler(request('request-verification', {}), null), (error: any) => error.status === 401);
  await assert.rejects(handler(request('forgot-password', {}, null), null), (error: any) => error.status === 403);
});

test('recuperação emite token aleatório hashed com prazo e resposta neutra para conta desconhecida', async () => {
  const { createAccountAuthHandler } = await import('../lib/account-auth.ts');
  const calls: { sql: string; values: unknown[]; db: unknown }[] = [];
  const messages: { to: string; text: string }[] = [];
  const limits: string[] = [];
  const client = {} as PoolClient;
  let found = true;
  const handler = createAccountAuthHandler({ mailEnabled: () => true, appUrl: () => origin,
    rateLimit: async key => { limits.push(key); },
    transaction: async run => run(client),
    query: async (sql, values = [], db) => {
      calls.push({ sql, values, db });
      return sql.startsWith('SELECT') && found ? [{ id: user.id, email: 'pessoa@example.test', email_verified_at: null }] : [];
    },
    sendMail: async message => { messages.push(message); },
  });
  const response = (await handler(request('forgot-password', { email: 'PESSOA@example.test' }), null))!;
  assert.ok(response, 'Solicitação de recuperação não implementada');
  assert.equal(response.status, 200);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'pessoa@example.test');
  const link = new URL(messages[0].text.match(/https:\/\/\S+/)![0]);
  assert.equal(link.origin, origin);
  assert.equal(link.pathname, '/conta');
  assert.equal(link.search, '');
  const fragment = new URLSearchParams(link.hash.slice(1));
  assert.equal(fragment.get('action'), 'reset-password');
  const token = fragment.get('token')!;
  assert.match(token, /^[a-f0-9]{64}$/);
  const inserted = calls.find(call => call.sql.startsWith('INSERT INTO account_tokens'))!;
  assert.ok(inserted);
  assert.deepEqual(inserted.values, [tokenHash(token), user.id, 'RESET_PASSWORD', 1800]);
  assert.ok(calls.every(call => call.db === client));
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.ok(calls.some(call => /DELETE FROM account_tokens/.test(call.sql)));
  assert.ok(!JSON.stringify(calls).includes(token));
  assert.ok(limits.includes('account-auth:global'));
  assert.ok(limits.includes('account-auth:email:pessoa@example.test'));
  const payload = await response.json();
  assert.ok(!JSON.stringify(payload).includes(token));
  found = false;
  const unknown = (await handler(request('forgot-password', { email: 'ausente@example.test' }), null))!;
  assert.deepEqual(await unknown.json(), payload);
  assert.equal(messages.length, 1);
  found = true;
  await handler(request('forgot-password', { email: 'pessoa@example.test' }), null);
  assert.notEqual(new URL(messages[1].text.match(/https:\/\/\S+/)![0]).hash, link.hash);
});

test('migração mantém confirmação opcional e tokens vinculados à conta sem segredo em texto puro', () => {
  const path = new URL('../db/003_account_auth.sql', import.meta.url);
  assert.ok(existsSync(path), 'Migração de autenticação ainda não implementada');
  const sql = readFileSync(path, 'utf8');
  assert.match(sql, /ADD COLUMN email_verified_at timestamptz/);
  assert.match(sql, /CREATE TABLE account_tokens/);
  assert.match(sql, /token_hash text PRIMARY KEY/);
  assert.match(sql, /REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /RESET_PASSWORD/);
  assert.match(sql, /VERIFY_EMAIL/);
  assert.match(sql, /expires_at timestamptz NOT NULL/);
  assert.match(sql, /consumed_at timestamptz/);
  assert.match(sql, /UNIQUE\(user_id,purpose\)/);
  assert.doesNotMatch(sql, /\btoken text\b/);
});

test('confirmação usa o e-mail da sessão, prazo de 24h e não envia novamente para conta já confirmada', async () => {
  const { createAccountAuthHandler } = await import('../lib/account-auth.ts');
  const messages: { to: string; text: string }[] = [];
  const calls: { sql: string; values: unknown[] }[] = [];
  let verified = false;
  const handler = createAccountAuthHandler({ appUrl: () => origin, mailEnabled: () => true,
    rateLimit: async () => {}, transaction: async run => run({} as PoolClient),
    query: async (sql, values = []) => {
      calls.push({ sql, values });
      return sql.startsWith('SELECT') ? [{ id: user.id, email: 'real@example.test', email_verified_at: verified ? new Date() : null }] : [];
    }, sendMail: async message => { messages.push(message); },
  });
  const response = (await handler(request('request-verification', {}), user))!;
  assert.ok(response, 'Solicitação de confirmação não implementada');
  assert.equal(response.status, 200);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'real@example.test');
  assert.deepEqual(calls[0].values, [user.id]);
  assert.match(calls[0].sql, /WHERE id=\$1 FOR UPDATE/);
  const link = new URL(messages[0].text.match(/https:\/\/\S+/)![0]);
  const fragment = new URLSearchParams(link.hash.slice(1));
  assert.equal(fragment.get('action'), 'verify-email');
  assert.deepEqual(calls.find(call => call.sql.startsWith('INSERT'))!.values,
    [tokenHash(fragment.get('token')!), user.id, 'VERIFY_EMAIL', 86400]);
  verified = true;
  await handler(request('request-verification', {}), user);
  assert.equal(messages.length, 1);
  await assert.rejects(handler(request('request-verification', { email: 'other@example.test' }), user), (error: any) => error.status === 400);
});

test('reset consome token uma única vez e altera hash/revoga sessões na mesma transação', async () => {
  const { createAccountAuthHandler } = await import('../lib/account-auth.ts');
  const client = {} as PoolClient;
  const calls: { sql: string; values: unknown[]; db: unknown }[] = [];
  const token = 'a'.repeat(64);
  let available = true;
  let expired = false;
  const handler = createAccountAuthHandler({ appUrl: () => origin, mailEnabled: () => false,
    rateLimit: async () => {}, transaction: async run => run(client),
    query: async (sql, values = [], db) => {
      calls.push({ sql, values, db });
      if (sql.startsWith('SELECT user_id FROM account_tokens')) return [{ user_id: user.id }];
      if (sql.startsWith('SELECT id FROM users')) return [{ id: user.id }];
      if (sql.startsWith('UPDATE account_tokens')) {
        assert.match(sql, /consumed_at IS NULL/);
        assert.match(sql, /expires_at>clock_timestamp\(\)/);
        assert.match(sql, /RETURNING user_id/);
        assert.deepEqual(values, [tokenHash(token), 'RESET_PASSWORD']);
        if (!available || expired) return [];
        available = false;
        return [{ user_id: user.id }];
      }
      return [];
    },
  });
  const results = await Promise.allSettled([
    handler(request('reset-password', { token, password: 'nova-senha-bem-longa' }), null),
    handler(request('reset-password', { token, password: 'outra-senha-bem-longa' }), null),
  ]);
  const successes = results.filter(result => result.status === 'fulfilled' && result.value?.status === 200);
  assert.equal(successes.length, 1, 'Reset deve alterar a senha exatamente uma vez');
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 400).length, 1);
  const passwordUpdates = calls.filter(call => call.sql.startsWith('UPDATE users SET password_hash'));
  assert.equal(passwordUpdates.length, 1);
  const stored = String(passwordUpdates[0].values[0]);
  assert.match(stored, /^scrypt\$/);
  assert.ok(await verifyPassword('nova-senha-bem-longa', stored) || await verifyPassword('outra-senha-bem-longa', stored));
  assert.deepEqual(calls.find(call => call.sql.startsWith('DELETE FROM sessions'))!.values, [user.id]);
  assert.ok(calls.some(call => /DELETE FROM account_tokens WHERE user_id/.test(call.sql)));
  assert.ok(calls.every(call => call.db === client));
  assert.ok(calls.some(call => /SELECT id FROM users.*FOR UPDATE/.test(call.sql)));
  expired = true; available = true;
  await assert.rejects(handler(request('reset-password', { token, password: 'nova-senha-bem-longa' }), null), (error: any) => error.status === 400);
  assert.equal(calls.filter(call => call.sql.startsWith('UPDATE users SET password_hash')).length, 1);
});

test('confirmação consome apenas token de confirmação e publica status privado sem mudar User', async () => {
  const { createAccountAuthHandler } = await import('../lib/account-auth.ts');
  let verifiedAt: Date | null = null;
  let consumed = false;
  const calls: { sql: string; values: unknown[] }[] = [];
  const handler = createAccountAuthHandler({ appUrl: () => origin, rateLimit: async () => {},
    transaction: async run => run({} as PoolClient),
    query: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT user_id FROM account_tokens')) {
        assert.deepEqual(values, [tokenHash('b'.repeat(64)), 'VERIFY_EMAIL']);
        return [{ user_id: user.id }];
      }
      if (sql.startsWith('SELECT id FROM users')) return [{ id: user.id }];
      if (sql.startsWith('UPDATE account_tokens')) {
        assert.match(sql, /consumed_at IS NULL AND expires_at>clock_timestamp\(\)/);
        if (consumed) return [];
        consumed = true; return [{ user_id: user.id }];
      }
      if (sql.startsWith('UPDATE users SET email_verified_at')) verifiedAt = new Date('2026-11-06T12:00:00.000Z');
      if (sql.startsWith('SELECT email,email_verified_at')) return [{ email: 'pessoa@example.test', email_verified_at: verifiedAt }];
      return [];
    },
  });
  await assert.rejects(handler(request('email-status'), null), (error: any) => error.status === 401);
  const response = (await handler(request('verify-email', { token: 'b'.repeat(64) }), null))!;
  assert.ok(response, 'Confirmação de token não implementada');
  assert.equal(response.status, 200);
  await assert.rejects(handler(request('verify-email', { token: 'b'.repeat(64) }), null), (error: any) => error.status === 400);
  const status = (await handler(request('email-status'), user))!;
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await status.json(), { data: { email: 'pessoa@example.test', verified: true, verifiedAt: '2026-11-06T12:00:00.000Z' } });
  assert.ok(!calls.some(call => call.sql.startsWith('DELETE FROM sessions')));
  assert.ok(!calls.some(call => call.sql.startsWith('UPDATE users SET password_hash')));
  assert.equal(Object.hasOwn(user, 'email'), false);
});

test('página da conta integra ferramentas sem substituir cadastro, login ou perfil', () => {
  const source = readFileSync(new URL('../components/AccountView.tsx', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*AuthTools\s*\}\s*from\s*["']\.\/AuthTools["']/);
  assert.match(source, /<AuthTools signedIn=\{!!user\} onSessionChange=\{refreshSession\}/);
  assert.match(source, /<form onSubmit=\{authenticate\}/);
  assert.match(source, /<ProfileForm key=\{user.id\}/);
  assert.match(source, /<form onSubmit=\{save\}/);
});

test('área desconectada monta login WCA fora do formulário de senha', () => {
  const source = readFileSync(new URL('../components/AccountView.tsx', import.meta.url), 'utf8');
  assert.ok(/import WcaLogin from ["']\.\/WcaLogin["']/.test(source), 'Falta importar WcaLogin');
  assert.ok(/<\/form>\s*<WcaLogin\s*\/>/.test(source), 'Login WCA deve ficar depois do formulário de autenticação');
});

test('entradas inválidas não acessam contas, não normalizam tokens e não contornam Origin', async () => {
  const { createAccountAuthHandler } = await import('../lib/account-auth.ts');
  const handler = createAccountAuthHandler({ appUrl: () => origin, mailEnabled: () => true, rateLimit: async () => {},
    transaction: async () => { assert.fail('Entrada inválida não deve acessar banco'); },
  });
  const validToken = 'd'.repeat(64);
  const cases: [string, unknown][] = [
    ['forgot-password', { email: 'inválido' }],
    ['forgot-password', { email: 'pessoa@example.test', userId: user.id }],
    ['request-verification', { email: 'outra@example.test' }],
    ['reset-password', { token: validToken, password: 'curta' }],
    ['reset-password', { token: validToken, password: 'a'.repeat(257) }],
    ['reset-password', { token: validToken.toUpperCase(), password: 'senha-nova-bem-longa' }],
    ['reset-password', { token: ` ${validToken}`, password: 'senha-nova-bem-longa' }],
    ['verify-email', { token: validToken, password: 'não-permitido' }],
    ['verify-email', { token: 'bad' }],
  ];
  for (const [route, payload] of cases) {
    await assert.rejects(handler(request(route, payload), user), (error: any) => error.status === 400);
  }
  for (const route of ['forgot-password', 'request-verification', 'reset-password', 'verify-email']) {
    for (const invalidOrigin of [null, 'https://outra.example.test']) {
      await assert.rejects(handler(request(route, {}, invalidOrigin), user), (error: any) => error.status === 403);
    }
  }
  await assert.rejects(handler(new Request(`${origin}/api/auth/reset-password`, {
    method: 'POST', headers: { origin }, body: '{',
  }), null), (error: any) => error.status === 400);
  assert.equal(await handler(request('reset-password'), null), null);
  assert.equal(await handler(request('verify-email'), null), null);
  assert.equal(await handler(request('unknown', {}), null), null);
});

test('limite de tentativas bloqueia envio e consumo antes de consultar tokens', async () => {
  const { createAccountAuthHandler } = await import('../lib/account-auth.ts');
  const handler = createAccountAuthHandler({ appUrl: () => origin, mailEnabled: () => true,
    rateLimit: async () => { throw new HttpError(429, 'Muitas tentativas.'); },
    transaction: async () => { assert.fail('Limite deve anteceder acesso ao banco'); },
    sendMail: async () => { assert.fail('Limite deve impedir envio'); },
  });
  for (const route of ['forgot-password', 'request-verification', 'reset-password', 'verify-email']) {
    await assert.rejects(handler(request(route, {}), user), (error: any) => error.status === 429);
  }
});

test('falha de entrega no reset responde igual e descarta somente o token recém-emitido', async () => {
  const { createAccountAuthHandler } = await import('../lib/account-auth.ts');
  const calls: { sql: string; values: unknown[] }[] = [];
  const handler = createAccountAuthHandler({ appUrl: () => origin, mailEnabled: () => true, rateLimit: async () => {},
    transaction: async run => run({} as PoolClient),
    query: async (sql, values = []) => {
      calls.push({ sql, values });
      return sql.startsWith('SELECT') ? [{ id: user.id, email: 'pessoa@example.test', email_verified_at: null }] : [];
    }, sendMail: async () => { throw new HttpError(503, 'Não foi possível enviar o e-mail.'); },
  });
  const response = await handler(request('forgot-password', { email: 'pessoa@example.test' }), null);
  assert.equal(response!.status, 200);
  await new Promise(resolve => setImmediate(resolve));
  const inserted = calls.find(call => call.sql.startsWith('INSERT'))!;
  const last = calls.at(-1)!;
  assert.match(last.sql, /^DELETE FROM account_tokens WHERE token_hash=\$1/);
  assert.deepEqual(last.values, [inserted.values[0]]);
});

test('links por e-mail recusam APP_URL com credenciais antes de gravar qualquer token', async () => {
  const { createAccountAuthHandler } = await import('../lib/account-auth.ts');
  const handler = createAccountAuthHandler({ appUrl: () => 'https://usuario:senha@conta.example.test', mailEnabled: () => true,
    rateLimit: async () => {}, transaction: async () => { assert.fail('Configuração insegura não pode gerar token'); },
  });
  await assert.rejects(handler(request('forgot-password', { email: 'pessoa@example.test' }), null),
    (error: any) => error instanceof HttpError && error.status === 503 && !/usuario|senha@/.test(error.message));
});

test('interface lê apenas ações reconhecidas e preserva o formato exato do token', async () => {
  assert.ok(existsSync(new URL('../components/AuthTools.tsx', import.meta.url)), 'Ferramentas de conta ainda não implementadas');
  const { readAccountLink } = await import('../components/AuthTools.tsx');
  for (const action of ['reset-password', 'verify-email'] as const) {
    assert.deepEqual(readAccountLink(`#action=${action}&token=${'a'.repeat(64)}`), { action, token: 'a'.repeat(64) });
  }
  for (const hash of ['', '#action=login&token=' + 'a'.repeat(64), '#action=reset-password&token=bad',
    '#action=verify-email&token=' + 'A'.repeat(64), '#action=verify-email&token=%20' + 'a'.repeat(64)]) {
    assert.equal(readAccountLink(hash), null);
  }
});

test('formulários de conta removem token da URL e só enviam após ação explícita', { timeout: 60_000 }, async () => {
  const tools = await import('../components/AuthTools.tsx');
  assert.equal(typeof tools.AuthTools, 'function', 'Interface de recuperação e confirmação ainda não implementada');
  const { build } = await import('esbuild');
  const { createServer } = await import('node:http');
  const { chromium } = await import('@playwright/test');
  const bundled = await build({ stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {AuthTools} from './components/AuthTools';
    const root=createRoot(document.getElementById('root')); window.sessionRefreshes=0;
    window.setSignedIn=(signedIn)=>root.render(<AuthTools signedIn={signedIn} onSessionChange={()=>window.sessionRefreshes++}/>); window.setSignedIn(false);`,
    resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx',
  }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' } });
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/bundle.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/bundle.js' ? bundled.outputFiles[0].text : '<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage(); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const posts: { path: string; body: any }[] = []; let enabled = true;
    await page.route('**/api/auth/**', async route => {
      const req = route.request(); const path = new URL(req.url()).pathname;
      if (req.method() === 'POST') posts.push({ path, body: req.postDataJSON() });
      const data = path.endsWith('/capabilities') ? { mailEnabled: enabled, emailVerificationRequired: false }
        : path.endsWith('/email-status') ? { email: 'pessoa@example.test', verified: false, verifiedAt: null }
        : { message: path.endsWith('/reset-password') ? 'Senha atualizada. Entre novamente com a nova senha.' : 'Solicitação recebida no teste.' };
      await route.fulfill({ json: { data } });
    });
    const base = `http://127.0.0.1:${address.port}/conta`; const token = 'c'.repeat(64);
    await page.goto(`${base}#action=reset-password&token=${token}`);
    await page.getByLabel('Nova senha', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, ''); assert.equal(posts.length, 0);
    await page.getByLabel('Nova senha', { exact: true }).fill('senha-nova-bem-longa');
    await page.getByLabel('Repita a nova senha').fill('senha-diferente-bem-longa');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await page.getByRole('alert').filter({ hasText: 'As senhas não coincidem.' }).waitFor();
    assert.equal(posts.length, 0);
    await page.getByLabel('Repita a nova senha').fill('senha-nova-bem-longa');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await page.getByRole('status').filter({ hasText: 'Senha atualizada.' }).waitFor();
    assert.deepEqual(posts[0], { path: '/api/auth/reset-password', body: { token, password: 'senha-nova-bem-longa' } });
    assert.equal(await page.evaluate(() => (window as any).sessionRefreshes), 1);
    await page.getByText('Esqueci minha senha', { exact: true }).click();
    await page.getByLabel('E-mail da sua conta').fill('pessoa@example.test');
    await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
    await page.getByRole('status').filter({ hasText: 'Solicitação recebida no teste.' }).waitFor();
    assert.deepEqual(posts[1], { path: '/api/auth/forgot-password', body: { email: 'pessoa@example.test' } });
    await page.evaluate(() => (window as any).setSignedIn(true));
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/request-verification')),
      page.getByRole('button', { name: 'Enviar confirmação de e-mail' }).click(),
    ]);
    assert.deepEqual(posts[2], { path: '/api/auth/request-verification', body: {} });
    await page.goto(`${base}#action=verify-email&token=${token}`);
    await page.getByRole('button', { name: 'Confirmar meu e-mail' }).waitFor();
    assert.equal(posts.length, 3); assert.equal(new URL(page.url()).hash, '');
    await page.getByRole('button', { name: 'Confirmar meu e-mail' }).click();
    await page.getByRole('status').filter({ hasText: 'Solicitação recebida no teste.' }).waitFor();
    assert.deepEqual(posts[3], { path: '/api/auth/verify-email', body: { token } });
    enabled = false; await page.goto(base);
    await page.getByText(/Envio de e-mail não configurado/).waitFor();
    await page.getByText('Esqueci minha senha', { exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Enviar link de recuperação' }).isDisabled(), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
