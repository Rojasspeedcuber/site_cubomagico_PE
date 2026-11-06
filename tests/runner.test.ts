import test from 'node:test';
import assert from 'node:assert/strict';

test('runner de integração isola search_path e rejeita identificadores de schema inseguros', async () => {
  const helper = await import('../scripts/test-isolated.mjs').catch(() => null);
  assert.equal(typeof helper?.isolatedDatabaseUrl, 'function', 'runner deve fornecer isolamento explícito');
  const input = 'postgresql://fixture:placeholder@localhost:5432/tests?sslmode=require';
  const output = new URL(helper!.isolatedDatabaseUrl(input, 'cubo_test_abc123'));
  assert.equal(output.searchParams.get('options'), '-c search_path=cubo_test_abc123');
  assert.equal(output.searchParams.get('sslmode'), 'require');
  assert.equal(output.pathname, '/tests');
  assert.equal(typeof helper!.unitEnvironment, 'function');
  assert.deepEqual(helper!.unitEnvironment({ DATABASE_URL: input, OTHER: 'keep' }), { OTHER: 'keep' });
  for (const invalid of ['public', 'cubo_test_a;DROP SCHEMA public', 'cubo_test_a,b', 'cubo_test_a b']) {
    assert.throws(() => helper!.isolatedDatabaseUrl(input, invalid), /schema/i);
  }
});

test('browser runner uses isolated storage and disables outbound credentials', async () => {
  const runner = await import('../scripts/test-browser.mjs').catch(() => null);
  assert.equal(typeof runner?.browserEnvironment, 'function');
  const env = runner!.browserEnvironment({DATABASE_URL:'postgresql://fixture:***@localhost/test',RESEND_API_KEY:'must-not-send',WCA_CLIENT_ID:'no-oauth',WCA_CLIENT_SECRET:'no-secret',MAIL_FROM:'x@example.test'}, 'cubo_test_browser', '/safe/media', 3199);
  assert.equal(env.APP_URL,'http://127.0.0.1:3199');
  assert.equal(env.E2E_BASE_URL,env.APP_URL);
  assert.equal(env.MEDIA_STORAGE_DIR,'/safe/media');
  assert.equal(new URL(env.DATABASE_URL).searchParams.get('options'),'-c search_path=cubo_test_browser');
  assert.equal(env.RESEND_API_KEY,undefined);
  assert.equal(env.WCA_CLIENT_SECRET,undefined);
});
