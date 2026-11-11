import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { algorithmSchema } from '../lib/validation';

const base = { name: 'PLL Ua', category: 'PLL', algorithm: "R U' R U R U R U' R' U' R2" };

test('arrow strings written by CubeIcons (flat sticker ids, 1-2 digits) are accepted', () => {
  const real = 'U5->U3:#ff3b30,U7->U5:#ff3b30,U3->U7:#ff3b30,B1->R1:#ff3b30,R8->B8:#ff3b30';
  assert.equal(algorithmSchema.parse({ ...base, arrows: real }).arrows, real);
  assert.equal(algorithmSchema.parse({ ...base, arrows: '' }).arrows, '');
});

test('arrows that could inject markup or are malformed are rejected', () => {
  for (const bad of ['<script>', 'U1->U2', 'U1->U2:red', 'U1->U2:#ff3b30;x', 'U1->U2:#ff3b30,']) {
    assert.throws(() => algorithmSchema.parse({ ...base, arrows: bad }), { name: 'ZodError' }, bad);
  }
});
