import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { puzzles } from 'cubing/puzzles';
import { Alg } from 'cubing/alg';

// Contract for the OLL/PLL illustrations:
// - OLL: CubeIcons "ci-oll" mode renders the case directly (no ci-inverse, no y2 x2).
// - PLL: arrows come from a sticker map derived from the algorithm on the cube, and are
//   drawn only when the case is a pure permutation (orientation preserved). Otherwise, no arrows.

type Algorithm = { id: string; category: string; algorithm: string };
const algorithms: Algorithm[] = JSON.parse(readFileSync(new URL('../data/algorithms.json', import.meta.url), 'utf8'));

test('component exposes the OLL and PLL illustration modes', () => {
  const src = readFileSync(new URL('../components/CubeDiagram.tsx', import.meta.url), 'utf8');
  assert.match(src, /ci-oll/, 'OLL mode must use the ci-oll class');
  assert.match(src, /data-ci-arrows/, 'PLL mode must pass arrows through data-ci-arrows');
  assert.match(src, /category === 'OLL'/, 'the component must branch on the OLL category');
  assert.match(src, /category === 'PLL'/, 'the component must branch on the PLL category');
});

test('every OLL case is an OLL-mode case (no inverse setup)', () => {
  const oll = algorithms.filter(c => c.category === 'OLL');
  assert.equal(oll.length, 57);
  for (const c of oll) {
    // The OLL illustration uses the algorithm as written, so it must parse as a plain sequence.
    assert.doesNotThrow(() => new Alg(c.algorithm), c.id);
  }
});

test('PLL arrows are only derived for pure permutations', async () => {
  const kp = await puzzles['3x3x3'].kpuzzle();
  const solved = kp.defaultPattern();
  const pure: string[] = [];
  const impure: string[] = [];
  for (const c of algorithms.filter(c => c.category === 'PLL')) {
    const p = solved.applyAlg(new Alg(c.algorithm).invert()).patternData;
    const oriented = p.EDGES.orientation.every(v => v === 0) && p.CORNERS.orientation.every(v => v === 0);
    (oriented ? pure : impure).push(c.id);
  }
  // Aa, Ab, E (verification failed) and V (edge orientation) must not get swap arrows.
  for (const id of ['pll-aa', 'pll-ab', 'pll-e', 'pll-v']) assert.ok(impure.includes(id), `${id} must have no arrows`);
  assert.equal(pure.length + impure.length, 21);
  assert.ok(pure.length >= 17, `expected at least 17 pure PLL, got ${pure.length}`);
});

test('PLL with arrows is drawn in the top view (ci-top), as in the e-book', () => {
  const src = readFileSync(new URL('../components/CubeDiagram.tsx', import.meta.url), 'utf8');
  assert.match(src, /category === 'PLL' && arrows\)/, 'PLL with arrows branch');
  assert.match(src, /'ci ci-3x3 ci-top ci-inverse'/, 'top view class');
});

test('every PLL is drawn in the top view, with or without arrows (as in the e-book)', () => {
  const src = readFileSync(new URL('../components/CubeDiagram.tsx', import.meta.url), 'utf8');
  assert.match(src, /category === 'PLL'\)\s*\{?/, 'PLL branch');
  assert.doesNotMatch(src, /category === 'PLL' && arrows\)\s*\{\s*\/\/ Top view/, 'top view must not depend on arrows');
});
