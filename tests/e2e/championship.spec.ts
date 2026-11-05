import { test, expect } from '@playwright/test';
import pg from 'pg';

const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

test.afterAll(async () => { await pool.end(); });

test('fluxo persistente: cadastro, RBAC, inscrição, embaralhamento, revisão e publicação', async ({ playwright }) => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL deve apontar para banco isolado de testes.');
  test.setTimeout(120_000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } })));
  const [admin, competitor, outsider, anonymous] = contexts;
  const suffix = `${Date.now()}`;
  const userIds: string[] = [];
  let eventId: string | undefined;
  async function send(actor: typeof admin, method: string, url: string, data?: object, expected = 200) {
    const res = await actor.fetch(url, { method, data });
    const body = await res.json();
    expect(res.status(), `${method} ${url}: ${JSON.stringify(body)}`).toBe(expected);
    return body.data;
  }
  try {
    for (const [index, actor] of [admin, competitor, outsider].entries()) {
      await send(actor, 'POST', '/api/auth/register', { displayName: `Teste privado ${index}`, email: `e2e-${suffix}-${index}@example.invalid`, password: `Teste-seguro-${suffix}!`, city: 'Recife' }, 201);
      const user = await send(actor, 'GET', '/api/session');
      userIds.push(user.id);
    }
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['ADMIN', userIds[0]]);
    expect((await competitor.post('/api/admin/events', { data: {} })).status()).toBe(403);
    expect((await anonymous.get('/api/admin/users')).status()).toBe(401);
    const now = Date.now();
    const iso = (offset: number) => new Date(now + offset).toISOString();
    const event = await send(admin, 'POST', '/api/admin/events', { name: `Evento de teste ${suffix}`, description: 'Fixture automatizada, removida ao encerrar.', rules: 'Teste independente da WCA. Enviar os tempos em ordem.', registrationOpen: iso(-60_000), registrationClose: iso(3_600_000) }, 201);
    eventId = event.id;
    const round = await send(admin, 'POST', `/api/admin/events/${eventId}/rounds`, { name: '3×3 • teste', puzzle: '333', format: 'AO5', opensAt: iso(3_700_000), closesAt: iso(7_200_000), videoRequired: true }, 201);
    await send(admin, 'PATCH', `/api/admin/events/${eventId}`, { status: 'OPEN' });
    const before = await send(anonymous, 'GET', `/api/events/${eventId}/rounds/${round.id}`);
    expect(before.scrambles || []).toHaveLength(0);
    await send(competitor, 'POST', `/api/events/${eventId}/register`, { roundIds: [round.id] });
    await pool.query('UPDATE rounds SET opens_at = NOW() - interval \'1 minute\' WHERE id=$1', [round.id]);
    const opened = await send(competitor, 'GET', `/api/events/${eventId}/rounds/${round.id}`);
    expect(opened.scrambles).toHaveLength(5);
    expect(opened.scrambles.every((s: unknown) => typeof s === 'string' && s.length > 5)).toBeTruthy();
    const repeated = await send(competitor, 'GET', `/api/events/${eventId}/rounds/${round.id}`);
    expect(repeated.scrambles).toEqual(opened.scrambles);
    const notRegistered = await send(outsider, 'GET', `/api/events/${eventId}/rounds/${round.id}`);
    expect(notRegistered.scrambles || []).toHaveLength(0);
    const attempts = [1000, 1100, 1200, 1300, 1400].map(timeCs => ({ timeCs, penalty: 'NONE' }));
    const submissionPath = `/api/events/${eventId}/rounds/${round.id}/submissions`;
    expect((await competitor.post(submissionPath, { data: { attempts } })).status()).toBe(400);
    await send(competitor, 'POST', submissionPath, { attempts, videoUrl: 'https://example.org/video-test' });
    expect((await outsider.post(submissionPath, { data: { attempts, videoUrl: 'https://example.org/video-test' } })).status()).toBe(403);
    const submissions = await send(admin, 'GET', `/api/admin/events/${eventId}/submissions`);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe('PENDING');
    await send(admin, 'PATCH', `/api/admin/submissions/${submissions[0].id}`, { status: 'APPROVED', reviewNote: 'Fixture aprovada.' });
    await send(competitor, 'POST', submissionPath, { attempts, videoUrl: 'https://example.org/video-corrected' });
    expect((await send(admin, 'GET', `/api/admin/events/${eventId}/submissions`))[0].status).toBe('PENDING');
    expect((await admin.post(`/api/admin/events/${eventId}/rounds/${round.id}/publish`, { data: {} })).status()).toBeGreaterThanOrEqual(400);
    await pool.query('UPDATE rounds SET closes_at = NOW() - interval \'1 second\' WHERE id=$1', [round.id]);
    expect((await competitor.post(submissionPath, { data: { attempts, videoUrl: 'https://example.org/late' } })).status()).toBe(403);
    await send(admin, 'PATCH', `/api/admin/submissions/${submissions[0].id}`, { status: 'APPROVED', reviewNote: 'Revisão final.' });
    await send(admin, 'POST', `/api/admin/events/${eventId}/rounds/${round.id}/publish`, {});
    const published = await send(anonymous, 'GET', `/api/events/${eventId}/rounds/${round.id}`);
    expect(published.results).toHaveLength(1);
    expect(published.results[0].averageCs).toBe(1200);
    expect(published.results[0].rank).toBe(1);
    const serialized = JSON.stringify(published);
    expect(serialized).not.toContain('@example.invalid');
    expect(serialized).not.toContain('video-corrected');
    const audit = await send(admin, 'GET', '/api/admin/audit');
    expect(audit.length).toBeGreaterThan(0);
  } finally {
    if (eventId) await pool.query('DELETE FROM events WHERE id=$1', [eventId]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
    await Promise.all(contexts.map(c => c.dispose()));
  }
});
