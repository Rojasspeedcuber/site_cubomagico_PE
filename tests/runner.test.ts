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
