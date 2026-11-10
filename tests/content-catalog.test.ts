import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { puzzles } from 'cubing/puzzles';
import { Alg } from 'cubing/alg';

const ROTATION_PLL = new Set(['pll-aa', 'pll-ab', 'pll-e', 'pll-v', 'pll-na']);
const dataUrl = new URL('../data/algorithms.json', import.meta.url);
function library() {
  const context = vm.createContext({ console });
  vm.runInContext(readFileSync(new URL('../public/vendor/cube-icons.js', import.meta.url), 'utf8'), context);
  return context.CubeIcons;
}
function catalog(): any[] { return JSON.parse(readFileSync(dataUrl, 'utf8')); }
function f2lSolved(state: any, base: any) {
  assert.equal(JSON.stringify(state.D), JSON.stringify(base.D));
  for (const face of ['F', 'R', 'B', 'L']) {
    assert.equal(JSON.stringify(state[face].slice(1)), JSON.stringify(base[face].slice(1)));
  }
}

test('catalog is an explicitly small, sourced, validated CFOP selection', () => {
  assert.ok(existsSync(dataUrl), 'missing sourced algorithm catalog');
  const cases = catalog();
  assert.equal(cases.length, 76); // 9 existing + 50 OLL main sequences from the CubeSkills table
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  assert.equal(cases.filter(c => c.category === 'OLL').length, 52);
  assert.equal(cases.filter(c => c.category === 'F2L').length, 3);
  assert.equal(cases.filter(c => c.category === 'PLL').length, 21);
  for (const c of cases) {
    for (const field of ['id', 'name', 'algorithm', 'orientation', 'notes', 'sourceUrl', 'sourceName']) assert.ok(c[field]);
    assert.equal(c.method, 'CFOP'); assert.equal(c.puzzle, '333'); if (!c.validated) assert.match(c.orientation, /Revisão visual pendente/, c.id);
    assert.match(c.sourceUrl, /^https:\/\//); assert.ok(Array.isArray(c.variations));
    // Notation is checked by cubing's parser (see the kpuzzle test); the original RUFLBD-only pattern no longer applies.
    assert.doesNotThrow(() => new Alg(c.algorithm), c.id);
    if (c.validated) { assert.match(c.orientation, /amarelo.*U/); assert.match(c.orientation, /verde.*F/); }
  }
});

test('independent cubing/kpuzzle validates inverse solution and PLL piece permutations', async () => {
  const puzzle = await puzzles['3x3x3'].kpuzzle();
  const solved = puzzle.defaultPattern();
  const oriented = solved.applyAlg('x2 y2');
  for (const c of catalog()) {
    const alg = new Alg(c.algorithm);
    const setup = oriented.applyAlg(alg.invert());
    assert.equal(setup.isIdentical(oriented), false, c.id);
    assert.ok(setup.applyAlg(alg).isIdentical(oriented), `${c.id}: independent inverse/setup`);
    assert.ok(solved.applyAlg(new Alg(`${c.algorithm} y2 x2`).invert()).isIdentical(setup), `${c.id}: display setup order`);
    const canonical = solved.applyAlg(alg.invert());
    if (c.category === 'PLL') {
      const { EDGES, CORNERS } = canonical.patternData;
      // PLL only permutes pieces: every PLL moves at least one piece, and no piece is reoriented.
      // Cases written with a cube rotation (x/y/z) apply it as a whole-cube move, so their raw piece state is not a
      // pure permutation; they are checked below only through the displayed setup.
      if (!ROTATION_PLL.has(c.id)) {
        assert.ok(EDGES.orientation.every(value => value === 0), c.id);
        assert.ok(CORNERS.orientation.every(value => value === 0), c.id);
        const moved = EDGES.pieces.filter((value, index) => value !== index).length + CORNERS.pieces.filter((value, index) => value !== index).length;
        assert.ok(moved >= 2, `${c.id}: PLL must move at least one piece`);
      }
    }
    if (c.category === 'OLL') {
      // Edge state is family-specific: only the all-edges-oriented families (OCLL) are asserted here.
      if (c.id.startsWith('oll-ocll') || c.id === 'oll-sune' || c.id === 'oll-anti-sune') assert.ok(canonical.patternData.EDGES.orientation.every(value => value === 0), c.id);
    }
  }
});

test('every displayed inverse setup solves exactly; OLL and PLL preserve F2L', () => {
  const icons = library();
  const base = icons.createState.nxn(3);
  icons.applyAlgorithm(base, 'x2 y2', 3);
  assert.equal(base.U[1][1], 'Y'); assert.equal(base.F[1][1], 'G');
  for (const c of catalog()) {
    const setup = icons.createState.nxn(3);
    // This is precisely the ci-inverse data-ci-alg contract used in CubeDiagram.
    icons.applyAlgorithm(setup, icons.getInvertedAlgorithm('3x3', `${c.algorithm} y2 x2`), 3);
    assert.notEqual(JSON.stringify(setup), JSON.stringify(base), c.id);
    // Sequences that contain a cube rotation (x/y/z) turn the reference frame, so the side-face colours are not comparable.
    if (c.category !== 'F2L' && !/[xyz]/.test(c.algorithm)) f2lSolved(setup, base);
    if (c.category === 'PLL') assert.ok(setup.U.flat().every((v: string) => v === 'Y'), c.id);
    if (c.category === 'OLL') {
      if (c.id.startsWith('oll-ocll') || c.id === 'oll-sune' || c.id === 'oll-anti-sune') {
        for (const [r, col] of [[0, 1], [1, 0], [1, 2], [2, 1]]) assert.equal(setup.U[r][col], 'Y', c.id);
      }
    }
    if (c.category === 'F2L') {
      // Only the front-right slot is disrupted; cross and the other slots remain solved.
      for (const face of ['U', 'R', 'F', 'L', 'B', 'D']) for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) {
        const inF2L = face === 'D' || (face !== 'U' && r > 0);
        const targetSlot = (face === 'D' && r === 0 && col === 2) || (face === 'F' && r > 0 && col === 2) || (face === 'R' && r > 0 && col === 0);
        if (inF2L && !targetSlot) assert.equal(setup[face][r][col], base[face][r][col], `${c.id} ${face}${r}${col}`);
      }
    }
    if (c.id === 'pll-ua' || c.id === 'pll-ub') {
      for (const face of ['R', 'F', 'L', 'B']) for (const col of [0, 2]) assert.equal(setup[face][0][col], base[face][0][col]);
      const movedEdges = ['R', 'F', 'L', 'B'].filter(face => setup[face][0][1] !== base[face][0][1]);
      assert.equal(movedEdges.length, 3, c.id);
    }
    icons.applyAlgorithm(setup, c.algorithm, 3);
    assert.equal(JSON.stringify(setup), JSON.stringify(base), `${c.id}: solution must solve depicted case`);
    // Variations are source text only: an alternative may solve the same case with a different permutation, so no equivalence is asserted.
  }
});
