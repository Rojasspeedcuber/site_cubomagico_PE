import test from 'node:test';
import assert from 'node:assert/strict';
import { algorithmSchema } from '../lib/validation.ts';

const base = { name: 'Fixture', category: 'PLL', algorithm: "R U R'", sourceUrl: 'https://example.test/source' };

test('a case with no figure yet (empty imageUrl) is valid, so PATCH can merge it', () => {
  assert.equal(algorithmSchema.safeParse({ ...base, imageUrl: '' }).success, true);
  assert.equal(algorithmSchema.safeParse(base).success, true);
});

test('a figure path must be a local /algoritmos/ png or gif; anything else is rejected', () => {
  assert.equal(algorithmSchema.safeParse({ ...base, imageUrl: '/algoritmos/pll-ua.gif' }).success, true);
  for (const bad of ['https://evil.test/x.png', '/algoritmos/../x.png', '/imgs/x.jpeg', 'javascript:alert(1)']) {
    assert.equal(algorithmSchema.safeParse({ ...base, imageUrl: bad }).success, false, bad);
  }
});
