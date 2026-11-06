import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool, query } from '../lib/db.ts';
import type { User } from '../lib/policy.ts';
import type { TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const origin = process.env.APP_URL || 'http://localhost:3000';
const owner: User = { id: randomUUID(), role: 'ORGANIZER', displayName: 'Organização fixture', city: '', photoUrl: '', wcaId: '' };
const eventId = randomUUID(), roundId = randomUUID();
function request(path: string, method = 'PATCH', payload?: unknown, withOrigin = true) {
  return new Request(`${origin}/api/${path}`, {
    method, headers: { ...(withOrigin ? { origin } : {}), 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}
async function lifecycle() {
  // A missing module is an explicit feature assertion during the initial RED run.
  const module: Partial<typeof import('../lib/event-lifecycle.ts')> = await import('../lib/event-lifecycle.ts').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof module.handleEventLifecycle, 'function', 'export the lifecycle handler');
  return module as typeof import('../lib/event-lifecycle.ts');
}

test('lifecycle dispatch leaves unrelated routes alone and authenticates matched routes', async () => {
  const { handleEventLifecycle } = await lifecycle();
  assert.equal(await handleEventLifecycle(request('admin/events', 'POST', {}), null), null);
  assert.equal(await handleEventLifecycle(request(`admin/events/${eventId}`, 'GET'), null), null);
  await assert.rejects(() => handleEventLifecycle(request(`admin/events/${eventId}/rounds/${roundId}`, 'PATCH', { name: 'Nova rodada' }), null), { status: 401 });
  await assert.rejects(() => handleEventLifecycle(request(`admin/events/${eventId}`, 'DELETE', {}, false), owner), { status: 403 });
  await assert.rejects(() => handleEventLifecycle(request(`admin/events/not-a-uuid`, 'DELETE'), owner), { status: 400 });
});

// Unit tests replace only the PostgreSQL connection boundary. Persistent coverage
// below runs unchanged business code against the isolated integration database.
function database(t: TestContext) {
  const state = {
    eventFound: true, roundFound: true,
    event: { id: eventId, owner_id: owner.id, status: 'DRAFT', published: false },
    round: { id: roundId, event_id: eventId, name: 'Rodada inicial', puzzle: '222', format: 'MO3', opens_at: '2030-01-01T12:00:00.000Z', closes_at: '2030-01-01T14:00:00.000Z', video_required: true, published: false, scrambles: ['R U', 'U R', "R U'"] },
    usage: { participants: false, registrations: false, submissions: false, published: false },
    statements: [] as { sql: string; values: any[] }[],
  };
  t.mock.method(pool, 'connect', async () => ({
    release() {},
    async query(sql: string, values: any[] = []) {
      state.statements.push({ sql, values });
      if (sql.includes('FROM events e JOIN users')) return { rows: state.eventFound ? [state.event] : [] };
      if (sql.startsWith('SELECT * FROM rounds')) return { rows: state.roundFound ? [state.round] : [] };
      if (sql.includes('AS participants')) return { rows: [state.usage] };
      if (sql.startsWith('UPDATE rounds')) {
        const [name, puzzle, format, opens_at, closes_at, video_required, scrambles] = values;
        Object.assign(state.round, { name, puzzle, format, opens_at, closes_at, video_required, scrambles: JSON.parse(scrambles) });
        const { scrambles: _private, ...publicRound } = state.round;
        return { rows: [publicRound] };
      }
      if (sql.startsWith('DELETE FROM')) return { rows: [{ id: roundId }] };
      return { rows: [] };
    },
  }));
  return state;
}

test('draft round PATCH preserves omitted fields and scrambles, locks event before round, and audits atomically', async t => {
  const state = database(t);
  const { handleEventLifecycle } = await lifecycle();
  const response = await handleEventLifecycle(request(`admin/events/${eventId}/rounds/${roundId}`, 'PATCH', { name: 'Rodada revisada' }), owner);
  assert.equal(response?.status, 200);
  const result = await response!.json();
  assert.equal(result.data.name, 'Rodada revisada');
  assert.equal(result.data.videoRequired, true, 'omitted Zod default must not reset video requirement');
  assert.equal(result.data.format, 'MO3');
  assert.equal(result.data.scrambles, undefined, 'management write must not disclose private scrambles');
  assert.deepEqual(state.round.scrambles, ['R U', 'U R', "R U'"]);
  const sql = state.statements.map(s => s.sql);
  const eventLock = sql.findIndex(s => s.includes('FOR UPDATE OF e'));
  const roundLock = sql.findIndex(s => s.startsWith('SELECT * FROM rounds') && s.includes('FOR UPDATE'));
  assert.ok(eventLock >= 0 && roundLock > eventLock);
  assert.ok(sql.some(s => s.startsWith('INSERT INTO audit')));
  assert.equal(sql.at(-1), 'COMMIT');
});

test('round PATCH rejects every non-draft, published or used event without writing', async t => {
  const { handleEventLifecycle } = await lifecycle();
  for (const condition of ['OPEN', 'RUNNING', 'CLOSED', 'eventPublished', 'roundPublished', 'participants', 'registrations', 'submissions', 'published']) {
    const state = database(t);
    if (['OPEN', 'RUNNING', 'CLOSED'].includes(condition)) state.event.status = condition;
    else if (condition === 'eventPublished') state.event.published = true;
    else if (condition === 'roundPublished') state.round.published = true;
    else state.usage[condition as keyof typeof state.usage] = true;
    await assert.rejects(() => handleEventLifecycle(request(`admin/events/${eventId}/rounds/${roundId}`, 'PATCH', { name: 'Não alterar' }), owner), { status: 409 }, condition);
    assert.ok(!state.statements.some(s => /^(UPDATE|DELETE|INSERT)/.test(s.sql)), condition);
    assert.equal(state.statements.at(-1)?.sql, 'ROLLBACK');
    t.mock.restoreAll();
  }
});

test('round PATCH validates the merged date window and rejects empty or immutable input', async t => {
  const { handleEventLifecycle } = await lifecycle();
  for (const payload of [{}, { opensAt: '2030-01-01T15:00:00.000Z' }, { closesAt: '2030-01-01T12:00:00.000Z' }, { scrambles: ['R'] }, { published: true }, { videoRequired: null }]) {
    const state = database(t);
    await assert.rejects(() => handleEventLifecycle(request(`admin/events/${eventId}/rounds/${roundId}`, 'PATCH', payload), owner), { status: 400 }, JSON.stringify(payload));
    assert.ok(!state.statements.some(s => s.sql.startsWith('UPDATE')));
    t.mock.restoreAll();
  }
});

test('round PATCH authorizes owner/admin and reports missing or mismatched targets', async t => {
  const { handleEventLifecycle } = await lifecycle();
  for (const scenario of ['foreignOwner', 'competitor', 'eventMissing', 'roundMissing', 'admin']) {
    const state = database(t);
    const actor = { ...owner };
    if (scenario === 'foreignOwner') actor.id = randomUUID();
    if (scenario === 'competitor') actor.role = 'COMPETITOR';
    if (scenario === 'admin') { actor.id = randomUUID(); actor.role = 'ADMIN'; }
    if (scenario === 'eventMissing') state.eventFound = false;
    if (scenario === 'roundMissing') state.roundFound = false;
    const call = () => handleEventLifecycle(request(`admin/events/${eventId}/rounds/${roundId}`, 'PATCH', { name: 'Revisada' }), actor);
    if (scenario === 'admin') assert.equal((await call())?.status, 200);
    else await assert.rejects(call, { status: scenario.endsWith('Missing') ? 404 : 403 }, scenario);
    t.mock.restoreAll();
  }
});

test('puzzle or format changes generate a new coherent server-side scramble series', async t => {
  const { handleEventLifecycle } = await lifecycle();
  for (const payload of [{ format: 'AO5' }, { puzzle: 'pyram' }]) {
    const state = database(t), previous = [...state.round.scrambles];
    const response = await handleEventLifecycle(request(`admin/events/${eventId}/rounds/${roundId}`, 'PATCH', payload), owner);
    assert.equal(response?.status, 200);
    assert.equal(state.round.scrambles.length, payload.format === 'AO5' ? 5 : 3);
    assert.notDeepEqual(state.round.scrambles, previous);
    assert.ok(state.round.scrambles.every(s => typeof s === 'string' && s.trim().length > 0));
    assert.equal((await response!.json()).data.scrambles, undefined);
    t.mock.restoreAll();
  }
});

test('round DELETE removes only an authorized unused draft round and keeps an audit record', async t => {
  const { handleEventLifecycle } = await lifecycle();
  const state = database(t);
  const response = await handleEventLifecycle(request(`admin/events/${eventId}/rounds/${roundId}`, 'DELETE'), owner);
  assert.equal(response?.status, 200);
  assert.equal((await response!.json()).data.removed, true);
  assert.ok(state.statements.some(s => s.sql.startsWith('DELETE FROM rounds') && s.values.includes(roundId)));
  assert.ok(state.statements.some(s => s.sql.startsWith('INSERT INTO audit') && s.values.includes('ROUND_DELETED')));
  assert.equal(state.statements.at(-1)?.sql, 'COMMIT');
});

test('event DELETE locks its rounds before safely deleting an unused draft and auditing', async t => {
  const { handleEventLifecycle } = await lifecycle();
  const state = database(t);
  const response = await handleEventLifecycle(request(`admin/events/${eventId}`, 'DELETE'), owner);
  assert.equal(response?.status, 200);
  assert.equal((await response!.json()).data.removed, true);
  const sql = state.statements.map(s => s.sql);
  const eventLock = sql.findIndex(s => s.includes('FOR UPDATE OF e'));
  const roundsLock = sql.findIndex(s => s.includes('FROM rounds') && s.includes('ORDER BY id FOR UPDATE'));
  const deletion = sql.findIndex(s => s.startsWith('DELETE FROM events'));
  assert.ok(eventLock >= 0 && roundsLock > eventLock && deletion > roundsLock);
  assert.ok(state.statements.some(s => s.sql.startsWith('INSERT INTO audit') && s.values.includes('EVENT_DELETED')));
  assert.equal(sql.at(-1), 'COMMIT');
});

test('DELETE routes reject protected drafts, foreign organizers and absent rounds without mutation', async t => {
  const { handleEventLifecycle } = await lifecycle();
  for (const suffix of ['', `/rounds/${roundId}`]) {
    for (const reason of ['OPEN', 'published', 'participants', 'registrations', 'submissions', 'foreignOwner', ...(suffix ? ['roundMissing'] : [])]) {
      const state = database(t), actor = { ...owner };
      if (reason === 'OPEN') state.event.status = 'OPEN';
      else if (reason === 'foreignOwner') actor.id = randomUUID();
      else if (reason === 'roundMissing') state.roundFound = false;
      else state.usage[reason as keyof typeof state.usage] = true;
      await assert.rejects(() => handleEventLifecycle(request(`admin/events/${eventId}${suffix}`, 'DELETE'), actor), { status: reason === 'foreignOwner' ? 403 : reason === 'roundMissing' ? 404 : 409 });
      assert.ok(!state.statements.some(s => /^(DELETE|INSERT|UPDATE)/.test(s.sql)));
      t.mock.restoreAll();
    }
  }
});

async function lifecyclePage(t: TestContext) {
  assert.ok(existsSync(new URL('../components/EventLifecycleTools.tsx', import.meta.url)), 'provide the reusable lifecycle UI');
  const fixture = { id: eventId, name: 'Campeonato fixture', description: '', rules: '', organizerName: 'Organização', registrationOpen: '2030-01-01T10:00:00.000Z', registrationClose: '2030-01-01T11:00:00.000Z', status: 'DRAFT', published: false, participantCount: 0,
    rounds: [{ id: roundId, eventId, name: 'Rodada inicial', puzzle: '222', format: 'MO3', opensAt: '2030-01-01T12:00:00.000Z', closesAt: '2030-01-01T14:00:00.000Z', videoRequired: true, published: false }] };
  const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import EventLifecycleTools from './components/EventLifecycleTools';
    const root=createRoot(document.getElementById('root')); const fixture=${JSON.stringify(fixture)}; window.changes=0;
    window.renderEvent=(patch={})=>root.render(<EventLifecycleTools event={{...fixture,...patch}} onChange={()=>window.changes++}/>); window.renderEvent();`, resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' } });
  const server = createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="pt-BR"><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage(), writes: { url: string; method: string; body: any }[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const req = route.request(); writes.push({ url: new URL(req.url()).pathname, method: req.method(), body: req.postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { removed: true } }) });
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  return { page, writes, errors };
}

test('lifecycle UI edits round fields with Pernambuco dates and reloads only after successful PATCH', async t => {
  const { page, writes, errors } = await lifecyclePage(t);
  await page.getByRole('button', { name: 'Editar Rodada inicial', exact: true }).click();
  assert.equal(await page.getByLabel('Exigir vídeo em todos os envios').isChecked(), true);
  assert.equal(await page.getByLabel('Abertura (Pernambuco)').inputValue(), '2030-01-01T09:00');
  await page.getByLabel('Nome da rodada').fill('Rodada revisada');
  await page.getByRole('button', { name: 'Salvar rodada', exact: true }).click();
  await page.waitForFunction(() => (window as any).changes === 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'PATCH');
  assert.equal(writes[0].url, `/api/admin/events/${eventId}/rounds/${roundId}`);
  assert.equal(writes[0].body.name, 'Rodada revisada');
  assert.equal(writes[0].body.videoRequired, true);
  assert.equal(writes[0].body.opensAt, '2030-01-01T12:00:00.000Z');
  assert.deepEqual(errors, []);
});

test('lifecycle UI requires explicit confirmation for round and event deletion and supports cancellation', async t => {
  const { page, writes, errors } = await lifecyclePage(t);
  await page.getByRole('button', { name: 'Excluir Rodada inicial', exact: true }).click();
  assert.equal(writes.length, 0);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(writes.length, 0);
  for (const label of ['Excluir Rodada inicial', 'Excluir evento rascunho']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const confirm = page.getByRole('button', { name: 'Confirmar exclusão', exact: true });
    assert.equal(await confirm.isDisabled(), true);
    await page.getByLabel('Digite EXCLUIR para confirmar').fill('EXCLUIR');
    const expectedChanges = writes.length + 1;
    await confirm.click();
    await page.waitForFunction(count => (window as any).changes === count, expectedChanges);
  }
  assert.equal(writes.length, 2);
  assert.equal(writes[0].method, 'DELETE');
  assert.equal(writes[0].url, `/api/admin/events/${eventId}/rounds/${roundId}`);
  assert.equal(writes[1].method, 'DELETE');
  assert.equal(writes[1].url, `/api/admin/events/${eventId}`);
  assert.deepEqual(errors, []);
});

test('lifecycle UI disables edits and deletes outside an unused unpublished draft', async t => {
  const { page, writes } = await lifecyclePage(t);
  for (const patch of [{ status: 'OPEN' }, { published: true }, { participantCount: 1 }]) {
    await page.evaluate(patch => (window as any).renderEvent(patch), patch);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].every(button => button.disabled));
    assert.equal(await page.getByRole('button', { name: 'Editar Rodada inicial', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Excluir evento rascunho', exact: true }).isDisabled(), true);
  }
  assert.equal(writes.length, 0);
});

test('lifecycle UI displays server conflicts without claiming deletion or notifying a successful change', async t => {
  const { page } = await lifecyclePage(t);
  await page.route('**/api/**', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'O evento recebeu uma inscrição. Recarregue antes de continuar.' }) }));
  await page.getByRole('button', { name: 'Excluir evento rascunho', exact: true }).click();
  await page.getByLabel('Digite EXCLUIR para confirmar').fill('EXCLUIR');
  await page.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /recebeu uma inscrição/);
  assert.equal(await page.evaluate(() => (window as any).changes), 0);
  assert.equal(await page.getByRole('dialog').isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'Cancelar', exact: true }).isEnabled(), true);
});

test('persistent lifecycle preserves private data, prevents in-use mutations and rechecks state after waiting for the event lock', { skip: !process.env.DATABASE_URL }, async () => {
  const { handleEventLifecycle } = await lifecycle();
  const { createEvent, createRound } = await import('../lib/events.ts');
  const actor = { ...owner, id: randomUUID() }, outsider = { ...owner, id: randomUUID() }, memberId = randomUUID();
  const events: string[] = [];
  async function createDraft(name: string) {
    const event = await createEvent(actor, { name, registrationOpen: '2030-01-01T10:00:00.000Z', registrationClose: '2030-01-01T11:00:00.000Z' });
    events.push(event.id); return event;
  }
  async function round(eventId: string) {
    return createRound(eventId, actor, { name: 'Rodada persistente', puzzle: '222', format: 'MO3', opensAt: '2030-01-01T12:00:00.000Z', closesAt: '2030-01-01T14:00:00.000Z', videoRequired: true });
  }
  try {
    for (const account of [actor, outsider, { ...owner, id: memberId, role: 'COMPETITOR' }]) {
      await query('INSERT INTO users(id,email,password_hash,display_name,role) VALUES($1,$2,$3,$4,$5)', [account.id, `lifecycle-${account.id}@example.test`, 'unused-fixture-hash', account.displayName, account.role]);
    }
    const event = await createDraft('Ciclo de vida fixture'), first = await round(event.id);
    const path = `admin/events/${event.id}/rounds/${first.id}`;
    const original = (await query('SELECT * FROM rounds WHERE id=$1', [first.id]))[0];
    await assert.rejects(() => handleEventLifecycle(request(path, 'PATCH', { name: 'Proibida' }), outsider), { status: 403 });
    assert.equal((await handleEventLifecycle(request(path, 'PATCH', { name: 'Revisada' }), actor))?.status, 200);
    let saved = (await query('SELECT * FROM rounds WHERE id=$1', [first.id]))[0];
    assert.equal(saved.name, 'Revisada'); assert.equal(saved.video_required, true); assert.deepEqual(saved.scrambles, original.scrambles);
    assert.equal((await handleEventLifecycle(request(path, 'PATCH', { format: 'AO5', puzzle: 'pyram' }), actor))?.status, 200);
    saved = (await query('SELECT * FROM rounds WHERE id=$1', [first.id]))[0];
    assert.equal(saved.format, 'AO5'); assert.equal(saved.puzzle, 'pyram'); assert.equal(saved.scrambles.length, 5); assert.notDeepEqual(saved.scrambles, original.scrambles);
    const other = await createDraft('Outro rascunho fixture');
    await assert.rejects(() => handleEventLifecycle(request(`admin/events/${other.id}/rounds/${first.id}`, 'DELETE'), actor), { status: 404 });
    assert.equal((await handleEventLifecycle(request(path, 'DELETE'), actor))?.status, 200);
    assert.equal((await query('SELECT id FROM rounds WHERE id=$1', [first.id])).length, 0);
    const second = await round(event.id), secondPath = `admin/events/${event.id}/rounds/${second.id}`;
    // The old committed version is an unused DRAFT. While lifecycle waits for
    // this event lock, a registration transaction makes it OPEN and in use.
    const locker = await pool.connect();
    try {
      await locker.query('BEGIN');
      await locker.query("UPDATE events SET status='OPEN' WHERE id=$1", [event.id]);
      await locker.query('INSERT INTO participants(event_id,user_id) VALUES($1,$2)', [event.id, memberId]);
      await locker.query('INSERT INTO registrations(event_id,round_id,user_id) VALUES($1,$2,$3)', [event.id, second.id, memberId]);
      const pending = handleEventLifecycle(request(secondPath, 'PATCH', { name: 'Não pode vencer a inscrição' }), actor);
      // Attach rejection handling before unlocking, avoiding unhandled promises.
      const rejected = assert.rejects(pending, { status: 409 });
      await locker.query('SELECT pg_sleep(0.05)'); await locker.query('COMMIT'); await rejected;
    } finally { await locker.query('ROLLBACK'); locker.release(); }
    for (const target of [secondPath, `admin/events/${event.id}`]) await assert.rejects(() => handleEventLifecycle(request(target, 'DELETE'), actor), { status: 409 });
    await query("UPDATE events SET status='DRAFT' WHERE id=$1", [event.id]);
    await query('INSERT INTO submissions(round_id,user_id,attempts,average_cs,best_cs) VALUES($1,$2,$3::jsonb,200,100)', [second.id, memberId, JSON.stringify([100, 200, 300].map(timeCs => ({ timeCs, penalty: 'NONE' })))]);
    for (const target of [secondPath, `admin/events/${event.id}`]) await assert.rejects(() => handleEventLifecycle(request(target, 'DELETE'), actor), { status: 409 });
    await assert.rejects(() => handleEventLifecycle(request(secondPath, 'PATCH', { videoRequired: false }), actor), { status: 409 });
    assert.equal((await query('SELECT video_required,name FROM rounds WHERE id=$1', [second.id]))[0].name, 'Rodada persistente');
    await query('DELETE FROM participants WHERE event_id=$1 AND user_id=$2', [event.id, memberId]);
    await query('UPDATE rounds SET published=true WHERE id=$1', [second.id]);
    await assert.rejects(() => handleEventLifecycle(request(`admin/events/${event.id}`, 'DELETE'), actor), { status: 409 });
    await query('UPDATE rounds SET published=false WHERE id=$1', [second.id]);
    assert.equal((await handleEventLifecycle(request(`admin/events/${event.id}`, 'DELETE'), actor))?.status, 200);
    assert.equal((await query('SELECT id FROM events WHERE id=$1', [event.id])).length, 0);
    assert.equal((await query('SELECT id FROM rounds WHERE event_id=$1', [event.id])).length, 0);
    for (const [action, target] of [['ROUND_UPDATED', first.id], ['ROUND_DELETED', first.id], ['EVENT_DELETED', event.id]]) {
      assert.ok((await query('SELECT id FROM audit WHERE actor_id=$1 AND action=$2 AND target_id=$3', [actor.id, action, target])).length > 0);
    }
  } finally {
    if (events.length) await query('DELETE FROM events WHERE id=ANY($1::uuid[])', [events]);
    await query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[actor.id, outsider.id, memberId]]);
    await pool.end();
  }
});
