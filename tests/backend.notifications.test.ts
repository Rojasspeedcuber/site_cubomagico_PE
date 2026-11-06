import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { User } from '../lib/policy.ts';

const origin = 'https://cubo.example.test';
const user: User = { id: 'a1f60e97-a8c1-4804-a5d9-8f7235961aaa', displayName: 'Pessoa', city: '', photoUrl: '', wcaId: '', role: 'COMPETITOR' };
const eventId = 'b1f60e97-a8c1-4804-a5d9-8f7235961aaa';
const targetId = 'c1f60e97-a8c1-4804-a5d9-8f7235961aaa';
const request = (payload?: unknown, customOrigin: string | null = origin) => new Request(`${origin}/api/notifications/preferences`, {
  method: payload === undefined ? 'GET' : 'PATCH',
  headers: { ...(customOrigin ? { origin: customOrigin } : {}), 'content-type': 'application/json' },
  body: payload === undefined ? undefined : JSON.stringify(payload),
});

test('preferências privadas exigem sessão e opt-in booleano explícito com Origin e limite', async () => {
  assert.ok(existsSync(new URL('../lib/notifications.ts', import.meta.url)), 'Notificações ainda não implementadas');
  const { createNotificationsHandler, handleNotifications } = await import('../lib/notifications.ts');
  assert.equal(typeof handleNotifications, 'function');
  const client = {} as PoolClient;
  let enabled = false;
  const calls: { sql: string; values: unknown[]; db: unknown }[] = [];
  const limits: string[] = [];
  const handler = createNotificationsHandler({ appUrl: () => origin, mailEnabled: () => false,
    transaction: async run => run(client), rateLimit: async key => { limits.push(key); },
    query: async (sql, values = [], db) => {
      calls.push({ sql, values, db });
      if (sql.startsWith('UPDATE users')) enabled = values[0] as boolean;
      if (/SELECT|RETURNING/.test(sql)) return [{ notifications_enabled: enabled, email_verified_at: null }];
      return [];
    },
  });
  await assert.rejects(handler(request(), null), (error: any) => error.status === 401);
  let response = (await handler(request(), user))!;
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { data: { enabled: false, mailEnabled: false, verified: false } });
  for (const payload of [{}, { enabled: 'true' }, { enabled: 1 }, { enabled: true, userId: targetId }]) {
    await assert.rejects(handler(request(payload), user), (error: any) => error.status === 400);
  }
  for (const customOrigin of [null, 'https://outro.example.test']) {
    await assert.rejects(handler(request({ enabled: true }, customOrigin), user), (error: any) => error.status === 403);
  }
  response = (await handler(request({ enabled: true }), user))!;
  assert.deepEqual(await response.json(), { data: { enabled: true, mailEnabled: false, verified: false } });
  assert.ok(limits.includes(`notifications:preferences:${user.id}`));
  const update = calls.find(call => call.sql.startsWith('UPDATE users'))!;
  assert.deepEqual(update.values, [true, user.id]);
  assert.equal(update.db, client);
  assert.ok(calls.some(call => /FOR UPDATE/.test(call.sql) && call.db === client));
  await handler(request({ enabled: false }), user);
  assert.ok(calls.some(call => /UPDATE notification_outbox/.test(call.sql) && /CANCELLED/.test(call.sql) && call.db === client));
  assert.equal(await handler(new Request(`${origin}/api/notifications/unknown`), user), null);
  const throttled = createNotificationsHandler({ appUrl: () => origin,
    rateLimit: async () => { throw Object.assign(new Error('Limite'), { status: 429 }); },
    transaction: async () => { assert.fail('Não gravar depois do limite'); },
  });
  await assert.rejects(throttled(request({ enabled: true }), user), (error: any) => error.status === 429);
});

test('outbox opt-in persiste apenas identificadores e deduplica por revisão na transação chamadora', async () => {
  const notifications = await import('../lib/notifications.ts');
  assert.equal(typeof notifications.enqueueNotification, 'function', 'Enfileiramento ainda não implementado');
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = { query: async (sql: string, values: unknown[]) => {
    calls.push({ sql, values }); return { rows: [] };
  } } as unknown as PoolClient;
  await notifications.enqueueNotification(client, user.id, 'SUBMISSION_REVIEW', `${targetId}:2`, eventId);
  await notifications.enqueueNotification(client, user.id, 'VIDEO_REQUEST', targetId, eventId);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /INSERT INTO notification_outbox/);
  assert.match(calls[0].sql, /FROM users WHERE id=\$1 AND notifications_enabled=true/);
  assert.match(calls[0].sql, /ON CONFLICT\s*\(user_id,kind,target_id\) DO NOTHING/);
  assert.deepEqual(calls[0].values, [user.id, 'SUBMISSION_REVIEW', `${targetId}:2`, eventId]);
  assert.doesNotMatch(calls[0].sql, /email|review_note|video_url|attempts|BEGIN|COMMIT/);
  for (const invalid of ['https://private.test/video', 'pessoa@example.test', `${targetId}:nota privada`, ` ${targetId}`, `${targetId}:0`]) {
    await assert.rejects(notifications.enqueueNotification(client, user.id, 'SUBMISSION_REVIEW', invalid, eventId), (error: any) => error.status === 400);
  }
  assert.equal(calls.length, 2, 'Não persistir dados arbitrários no targetId');
  const path = new URL('../db/007_notifications.sql', import.meta.url);
  assert.ok(existsSync(path), 'Migração de notificações ainda não implementada');
  const sql = readFileSync(path, 'utf8');
  assert.match(sql, /notifications_enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql, /user_id uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /event_id uuid NOT NULL REFERENCES events\(id\) ON DELETE CASCADE/);
  assert.match(sql, /UNIQUE\(user_id,kind,target_id\)/);
  for (const status of ['PENDING', 'SENDING', 'SENT', 'RETRY', 'FAILED', 'CANCELLED']) assert.ok(sql.includes(`'${status}'`));
  assert.match(sql, /attempts integer NOT NULL DEFAULT 0/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /payload|video_url|review_note|recipient|email text/i);
});

test('CLI exige modo explícito, limita lote e dry-run não altera fila nem envia e-mail', async () => {
  assert.ok(existsSync(new URL('../scripts/notifications.ts', import.meta.url)), 'CLI ainda não implementada');
  const { parseNotificationArgs, runNotifications } = await import('../scripts/notifications.ts');
  assert.deepEqual(parseNotificationArgs(['--dry-run']), { mode: 'dry-run', limit: 20 });
  assert.deepEqual(parseNotificationArgs(['--send', '--limit=5']), { mode: 'send', limit: 5 });
  for (const args of [[], ['--send', '--dry-run'], ['--send', '--limit=0'], ['--send', '--limit=101'], ['--send', '--limit=2.5'], ['--send', '--force']]) {
    assert.throws(() => parseNotificationArgs(args), /Uso/);
  }
  const calls: string[] = []; let released = false;
  const client = { release: () => { released = true; } } as unknown as PoolClient;
  const report = await runNotifications({ mode: 'dry-run', limit: 5 }, {
    connect: async () => client, sendMail: async () => { assert.fail('Dry-run não envia'); },
    query: async (sql, values = [], db) => {
      calls.push(sql); assert.equal(db, client);
      if (/pg_try_advisory_lock/.test(sql)) return [{ locked: true }];
      if (/FROM notification_outbox n/.test(sql)) {
        assert.deepEqual(values, [5]);
        assert.match(sql, /attempts<3/); assert.match(sql, /next_attempt_at<=clock_timestamp/);
        return [
          { notifications_enabled: true, email_verified_at: new Date() },
          { notifications_enabled: true, email_verified_at: null },
          { notifications_enabled: false, email_verified_at: new Date() },
        ];
      }
      return [];
    },
  });
  assert.equal(report.dryRun, true); assert.equal(report.selected, 3); assert.equal(report.eligible, 1);
  assert.equal(report.deferred, 1); assert.equal(report.cancelled, 1); assert.equal(report.sent, 0);
  assert.ok(released); assert.ok(calls.some(sql => /pg_advisory_unlock/.test(sql)));
  assert.ok(calls.every(sql => !/INSERT|UPDATE|DELETE|\bu\.email\b/.test(sql)));
  for (const options of [{ mode: 'send' }, { mode: 'send', limit: 101 }, { mode: 'bad' }]) {
    await assert.rejects(runNotifications(options as any, { mailEnabled: () => false,
      connect: async () => { assert.fail('Configuração inválida não acessa banco'); },
    }));
  }
  const locked = await runNotifications({ mode: 'dry-run' }, {
    connect: async () => client, query: async sql => {
      if (/pg_try_advisory_lock/.test(sql)) return [{ locked: false }];
      assert.fail('Lock ocupado não pode consultar fila');
    },
  });
  assert.equal(locked.locked, true); assert.equal(locked.selected, 0);
});

function deliveryDatabase(options: { enabled?: boolean; verified?: boolean; attempts?: number; disableAfterClaim?: boolean; unverifyAfterClaim?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const state = { status: 'PENDING', attempts: options.attempts ?? 0, notifications_enabled: options.enabled ?? true,
    email_verified_at: options.verified === false ? null : new Date(), email: 'atual@example.test' };
  let transaction = false;
  let persistedStatus = state.status;
  let released = false;
  const client = { release: () => { released = true; } } as unknown as PoolClient;
  const query = async (sql: string, values: unknown[] = [], db?: unknown): Promise<any[]> => {
    assert.equal(db, client); calls.push({ sql, values });
    if (/pg_try_advisory_lock/.test(sql)) return [{ locked: true }];
    if (sql === 'BEGIN') { transaction = true; return []; }
    if (sql === 'COMMIT') {
      persistedStatus = state.status; transaction = false;
      if (state.status === 'SENDING' && options.disableAfterClaim) state.notifications_enabled = false;
      if (state.status === 'SENDING' && options.unverifyAfterClaim) state.email_verified_at = null;
      return [];
    }
    if (sql === 'ROLLBACK') { transaction = false; state.status = persistedStatus; return []; }
    if (/FROM notification_outbox n/.test(sql)) return [{ id: targetId, user_id: user.id, ...state }];
    if (/FROM users/.test(sql)) { assert.match(sql, /FOR UPDATE/); return [{ ...state }]; }
    if (/SELECT.*FROM notification_outbox/.test(sql.replace(/\n/g, ' '))) {
      assert.match(sql, /FOR UPDATE/); return [{ id: targetId, user_id: user.id, kind: 'VIDEO_REQUEST', event_id: eventId, due: true, ...state }];
    }
    if (/UPDATE notification_outbox/.test(sql)) {
      assert.ok(transaction);
      const status = sql.match(/SET status='([A-Z]+)'/);
      if (status) state.status = status[1];
      else if (/SET status=\$2/.test(sql)) state.status = values[1] as string;
      if (/attempts=attempts\+1/.test(sql)) state.attempts++;
    }
    return [];
  };
  return { state, calls, query, connect: async () => client, inTransaction: () => transaction,
    persistedStatus: () => persistedStatus, released: () => released };
}

test('envio real reconsulta destinatário confirmado sob lock e só registra SENT após sendMail', async () => {
  const { runNotifications } = await import('../scripts/notifications.ts');
  const database = deliveryDatabase();
  const messages: any[] = [];
  const report = await runNotifications({ mode: 'send' }, { ...database, mailEnabled: () => true, appUrl: () => origin,
    sendMail: async message => {
      assert.equal(database.persistedStatus(), 'SENDING', 'Claim deve ser durável antes da rede');
      assert.equal(database.inTransaction(), true, 'Opt-out e exclusão devem aguardar o envio em andamento');
      assert.equal(database.state.status, 'SENDING'); messages.push(message);
    },
  });
  assert.equal(messages.length, 1, 'CLI --send precisa chamar sendMail');
  assert.equal(messages[0].to, 'atual@example.test');
  assert.match(messages[0].text, new RegExp(`${origin}/campeonatos/${eventId}`));
  assert.doesNotMatch(messages[0].text, /api\/media|\.mp4|https:\/\/private|review_note|tempo|nota privada/);
  assert.equal(database.calls.filter(call => /FROM users/.test(call.sql)).length, 2);
  assert.equal(database.state.attempts, 1); assert.equal(database.persistedStatus(), 'SENT');
  assert.equal(report.sent, 1); assert.equal(report.failed, 0); assert.ok(database.released());
  assert.ok(!JSON.stringify(report).includes('example.test'));
});

test('envio respeita opt-out e confirmação inclusive quando mudam após claim', async () => {
  const { runNotifications } = await import('../scripts/notifications.ts');
  for (const options of [{ enabled: false }, { verified: false }, { disableAfterClaim: true }, { unverifyAfterClaim: true }]) {
    const database = deliveryDatabase(options);
    const report = await runNotifications({ mode: 'send' }, { ...database, mailEnabled: () => true, appUrl: () => origin,
      sendMail: async () => { assert.fail('Sem opt-in e confirmação atuais não pode enviar'); },
    });
    assert.equal(report.sent, 0);
    assert.equal(database.persistedStatus(), options.enabled === false || options.disableAfterClaim ? 'CANCELLED' : 'PENDING');
    assert.equal(options.enabled === false || options.verified === false ? database.state.attempts : 0, 0);
  }
});

test('falha do provedor registra erro genérico, agenda retry e respeita teto de três tentativas', async () => {
  const { runNotifications } = await import('../scripts/notifications.ts');
  for (const attempts of [0, 2]) {
    const database = deliveryDatabase({ attempts });
    const report = await runNotifications({ mode: 'send' }, { ...database, mailEnabled: () => true, appUrl: () => origin,
      sendMail: async () => { throw new Error('segredo pessoa@example.test https://private.test/video'); },
    });
    assert.equal(database.persistedStatus(), attempts === 2 ? 'FAILED' : 'RETRY');
    assert.equal(database.state.attempts, attempts + 1); assert.equal(report.sent, 0);
    assert.equal(attempts === 2 ? report.failed : report.retried, 1);
    assert.ok(database.calls.some(call => /last_error='MAIL_DELIVERY_FAILED'/.test(call.sql)));
    assert.ok(database.calls.some(call => /interval '15 minutes'/.test(call.sql)));
    assert.doesNotMatch(JSON.stringify(database.calls), /segredo|pessoa@|private.test/);
  }
});

test('registros terminais, em envio ou sem tentativas restantes não são reenviados', async () => {
  const { runNotifications } = await import('../scripts/notifications.ts');
  for (const status of ['SENDING', 'SENT', 'FAILED', 'CANCELLED']) {
    const database = deliveryDatabase(); database.state.status = status;
    const report = await runNotifications({ mode: 'send' }, { ...database, mailEnabled: () => true, appUrl: () => origin,
      sendMail: async () => { assert.fail('Não reenviar estado terminal ou incerto'); },
    });
    assert.equal(report.sent, 0); assert.equal(database.state.attempts, 0);
  }
  const database = deliveryDatabase({ attempts: 3 });
  const report = await runNotifications({ mode: 'send' }, { ...database, mailEnabled: () => true, appUrl: () => origin,
    sendMail: async () => { assert.fail('Não ultrapassar três tentativas'); },
  });
  assert.equal(report.sent, 0); assert.equal(database.state.attempts, 3);
});

test('falha de banco depois da rede preserva claim durável incerto em vez de repetir envio', async () => {
  const { runNotifications } = await import('../scripts/notifications.ts');
  const database = deliveryDatabase(); let sends = 0;
  await assert.rejects(runNotifications({ mode: 'send' }, { ...database, mailEnabled: () => true, appUrl: () => origin,
    query: async (sql, values, db) => {
      if (/SET status='SENT'/.test(sql)) throw new Error('Banco indisponível após entrega');
      return database.query(sql, values, db);
    }, sendMail: async () => { sends++; },
  }), /Banco indisponível/);
  assert.equal(sends, 1); assert.equal(database.state.status, 'SENDING');
  assert.equal(database.persistedStatus(), 'SENDING'); assert.ok(database.released());
  assert.ok(database.calls.some(call => call.sql === 'ROLLBACK'));
  const next = await runNotifications({ mode: 'send' }, { ...database, mailEnabled: () => true, appUrl: () => origin,
    sendMail: async () => { assert.fail('Claim incerto não pode ser repetido automaticamente'); },
  });
  assert.equal(next.sent, 0);
});

test('mensagens são genéricas e APP_URL insegura impede envio antes do banco', async () => {
  const cli = await import('../scripts/notifications.ts');
  assert.equal(typeof cli.notificationMessage, 'function');
  for (const kind of ['VIDEO_REQUEST', 'SUBMISSION_REVIEW'] as const) {
    const message = cli.notificationMessage(kind, eventId, origin);
    assert.match(message.text, /\/campeonatos\//);
    assert.ok(!Object.hasOwn(message, 'to'));
    assert.throws(() => cli.notificationMessage(kind, 'private/video', origin));
  }
  for (const appUrl of [undefined, 'not-url', 'https://pessoa:segredo@example.test', 'javascript:alert(1)', 'https://example.test/path?private=1', 'http://example.test']) {
    await assert.rejects(cli.runNotifications({ mode: 'send' }, { mailEnabled: () => true, appUrl: () => appUrl,
      connect: async () => { assert.fail('APP_URL inválida não acessa banco'); },
    }), /Configure APP_URL/);
  }
});

test('preferências na interface carregam API real e só salvam opt-in após ação explícita', { timeout: 60_000 }, async () => {
  assert.ok(existsSync(new URL('../components/NotificationPreferences.tsx', import.meta.url)), 'Componente ainda não implementado');
  const { build } = await import('esbuild');
  const { createServer } = await import('node:http');
  const { chromium } = await import('@playwright/test');
  const bundled = await build({ stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {NotificationPreferences} from './components/NotificationPreferences'; createRoot(document.getElementById('root')).render(<NotificationPreferences/>);`,
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
    const patches: unknown[] = []; let enabled = false; let fail = false;
    await page.route('**/api/notifications/preferences', async route => {
      const req = route.request();
      if (req.method() === 'PATCH') {
        const payload = req.postDataJSON(); patches.push(payload);
        if (fail) { await route.fulfill({ status: 503, json: { error: 'Não foi possível salvar.' } }); return; }
        enabled = payload.enabled;
      }
      await route.fulfill({ json: { data: { enabled, mailEnabled: false, verified: false } } });
    });
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const checkbox = page.getByRole('checkbox', { name: /Receber avisos/ });
    await checkbox.waitFor(); assert.equal(await checkbox.isChecked(), false); assert.equal(patches.length, 0);
    await page.getByText(/Envio de e-mail não configurado/).waitFor();
    await page.getByText(/Confirme seu e-mail/).waitFor();
    await checkbox.check(); assert.equal(patches.length, 0);
    await page.getByRole('button', { name: 'Salvar preferências' }).click();
    await page.getByRole('status').filter({ hasText: /Preferências salvas/ }).waitFor();
    assert.deepEqual(patches, [{ enabled: true }]);
    fail = true; await checkbox.uncheck();
    await page.getByRole('button', { name: 'Salvar preferências' }).click();
    await page.getByRole('alert').filter({ hasText: /Não foi possível salvar/ }).waitFor();
    fail = false;
    await page.getByRole('button', { name: 'Salvar preferências' }).click();
    await page.getByRole('status').filter({ hasText: /Preferências salvas/ }).waitFor();
    assert.equal(enabled, false); assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('PostgreSQL: opt-in, idempotência, rollback, confirmação, concorrência, retries e cascata', { skip: !process.env.DATABASE_URL, timeout: 30_000 }, async () => {
  const { query, pool, transaction } = await import('../lib/db.ts');
  const { enqueueNotification, createNotificationsHandler } = await import('../lib/notifications.ts');
  const { runNotifications } = await import('../scripts/notifications.ts');
  const [schema] = await query('SELECT current_schema() AS name');
  assert.match(schema.name, /^cubo_test_[a-z0-9_]+$/, 'Exige runner de integração com schema isolado');
  const actorId = randomUUID(); const recipientId = randomUUID(); const fixtureEvent = randomUUID(); const target = randomUUID();
  // The global test runner may exercise other event fixtures concurrently.
  // Keep this worker's deliveries confined to this test's event, even in mocks.
  const scopedQuery: typeof query = (sql, values = [], db) => /FROM notification_outbox n/.test(sql)
    ? query(sql.replace('ORDER BY n.next_attempt_at', 'AND n.event_id=$2 ORDER BY n.next_attempt_at'), [...values, fixtureEvent], db)
    : query(sql, values, db);
  const deps = { query: scopedQuery, mailEnabled: () => true, appUrl: () => origin };
  let releaseSend: (() => void) | undefined;
  let sending: Promise<unknown> | undefined;
  try {
    await query("INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,'unused','Organização'),($3,$4,'unused','Participante')", [actorId, `notice-${actorId}@example.test`, recipientId, `notice-${recipientId}@example.test`]);
    await query("INSERT INTO events(id,owner_id,name,registration_open,registration_close) VALUES($1,$2,'Teste de avisos',clock_timestamp(),clock_timestamp()+interval '1 day')", [fixtureEvent, actorId]);
    const enqueue = (revision: number) => transaction(db => enqueueNotification(db, recipientId, 'SUBMISSION_REVIEW', `${target}:${revision}`, fixtureEvent));
    await enqueue(1);
    assert.equal((await query('SELECT * FROM notification_outbox WHERE user_id=$1', [recipientId])).length, 0);
    await query('UPDATE users SET notifications_enabled=true WHERE id=$1', [recipientId]);
    await Promise.all([enqueue(1), enqueue(1), enqueue(2)]);
    assert.equal((await query('SELECT * FROM notification_outbox WHERE user_id=$1', [recipientId])).length, 2);
    await assert.rejects(transaction(async db => {
      await enqueueNotification(db, recipientId, 'SUBMISSION_REVIEW', `${target}:3`, fixtureEvent);
      throw new Error('Rollback solicitado');
    }));
    assert.equal((await query('SELECT * FROM notification_outbox WHERE user_id=$1', [recipientId])).length, 2);
    const neverSend = async () => { assert.fail('Sem e-mail confirmado não pode enviar'); };
    let report = await runNotifications({ mode: 'dry-run' }, { ...deps, sendMail: neverSend });
    assert.equal(report.deferred, 2);
    assert.ok((await query('SELECT attempts FROM notification_outbox WHERE user_id=$1', [recipientId])).every(row => row.attempts === 0));
    report = await runNotifications({ mode: 'send' }, { ...deps, sendMail: neverSend });
    assert.equal(report.deferred, 2);
    await query('UPDATE users SET email_verified_at=clock_timestamp() WHERE id=$1', [recipientId]);
    await query('UPDATE notification_outbox SET next_attempt_at=clock_timestamp() WHERE user_id=$1', [recipientId]);
    let started!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; });
    const wait = new Promise<void>(resolve => { releaseSend = resolve; });
    sending = runNotifications({ mode: 'send', limit: 1 }, { ...deps, sendMail: async message => {
      assert.equal(message.to, `notice-${recipientId}@example.test`);
      assert.match(message.text, new RegExp(`/campeonatos/${fixtureEvent}`));
      started(); await wait;
    } });
    await Promise.race([start, sending.then(() => { throw new Error('Envio terminou antes do teste de concorrência'); })]);
    const concurrent = await runNotifications({ mode: 'send' }, { ...deps, sendMail: neverSend });
    assert.equal(concurrent.locked, true);
    let optedOut = false;
    const handler = createNotificationsHandler({ ...deps, rateLimit: async () => {} });
    const disable = handler(request({ enabled: false }), { ...user, id: recipientId }).then(response => { optedOut = true; return response; });
    // The in-flight delivery holds the account lock until its result is persisted.
    assert.equal(optedOut, false);
    releaseSend!();
    assert.equal((await sending as any).sent, 1);
    await disable;
    const stored = await query('SELECT status,attempts FROM notification_outbox WHERE user_id=$1 ORDER BY status', [recipientId]);
    assert.deepEqual(stored.map(row => row.status), ['CANCELLED', 'SENT']);
    await query('UPDATE users SET notifications_enabled=true WHERE id=$1', [recipientId]);
    await enqueue(3);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await query("UPDATE notification_outbox SET next_attempt_at=clock_timestamp() WHERE user_id=$1 AND status IN ('PENDING','RETRY')", [recipientId]);
      report = await runNotifications({ mode: 'send' }, { ...deps, sendMail: async () => { throw new Error('Dados privados do provedor'); } });
      assert.equal(attempt === 3 ? report.failed : report.retried, 1);
    }
    const [failed] = await query("SELECT * FROM notification_outbox WHERE user_id=$1 AND target_id=$2", [recipientId, `${target}:3`]);
    assert.equal(failed.status, 'FAILED'); assert.equal(failed.attempts, 3); assert.equal(failed.last_error, 'MAIL_DELIVERY_FAILED');
    await query('DELETE FROM users WHERE id=$1', [recipientId]);
    assert.equal((await query('SELECT * FROM notification_outbox WHERE user_id=$1', [recipientId])).length, 0);
    await query('UPDATE users SET notifications_enabled=true WHERE id=$1', [actorId]);
    await transaction(db => enqueueNotification(db, actorId, 'VIDEO_REQUEST', target, fixtureEvent));
    await query('DELETE FROM events WHERE id=$1', [fixtureEvent]);
    assert.equal((await query('SELECT * FROM notification_outbox WHERE event_id=$1', [fixtureEvent])).length, 0);
  } finally {
    releaseSend?.(); await sending?.catch(() => {});
    await query('DELETE FROM events WHERE id=$1', [fixtureEvent]);
    await query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[actorId, recipientId]]);
    await pool.end();
  }
});
