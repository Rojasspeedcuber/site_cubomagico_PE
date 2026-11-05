import test from 'node:test';
import assert from 'node:assert/strict';
import { canManage, assertWindow, requireOrigin } from '../lib/policy.ts';
test('only owner ORGANIZER or ADMIN can manage events, competitor owner cannot', () => {
  assert.equal(canManage({id:'a',role:'COMPETITOR'}, 'a'), false);
  assert.equal(canManage({id:'a',role:'ORGANIZER'}, 'a'), true);
  assert.equal(canManage({id:'b',role:'ORGANIZER'}, 'a'), false);
  assert.equal(canManage({id:'b',role:'ADMIN'}, 'a'), true);
  assert.equal(canManage(null, 'a'), false);
});
test('deadline windows are inclusive at opening and exclusive at closure', () => {
  assert.throws(() => assertWindow('2026-01-01T12:00:00Z','2026-01-01T13:00:00Z',new Date('2026-01-01T11:59:59Z')));
  assert.doesNotThrow(() => assertWindow('2026-01-01T12:00:00Z','2026-01-01T13:00:00Z',new Date('2026-01-01T12:00:00Z')));
  assert.throws(() => assertWindow('2026-01-01T12:00:00Z','2026-01-01T13:00:00Z',new Date('2026-01-01T13:00:00Z')));
});
test('writes require exact configured Origin, including server-side requests', () => {
  const allowed = 'https://cubos.example';
  for (const origin of [null,'null','https://evil.example','https://cubos.example.evil']) {
    assert.throws(() => requireOrigin(new Request(allowed,{method:'POST',headers:origin ? {origin}: {}}),allowed));
  }
  assert.doesNotThrow(() => requireOrigin(new Request(allowed,{method:'POST',headers:{origin:allowed}}),allowed));
});
