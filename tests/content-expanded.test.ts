import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Alg } from 'cubing/alg';
import { puzzles } from 'cubing/puzzles';

type CatalogCase = {
  id: string; name: string; category: string; algorithm: string;
  orientation: string; notes: string; sourceUrl: string; sourceName: string;
  validated: boolean; method: string; puzzle: string; variations: string[];
};
const catalog: CatalogCase[] = JSON.parse(readFileSync(new URL('../data/algorithms.json', import.meta.url), 'utf8'));
const context = vm.createContext({ console });
vm.runInContext(readFileSync(new URL('../public/vendor/cube-icons.js', import.meta.url), 'utf8'), context);
const icons = context.CubeIcons;
const faces = ['U', 'R', 'F', 'D', 'L', 'B'];

async function verifyCase(id: string, category: string, algorithm: string, source: string) {
  const entry = catalog.find(candidate => candidate.id === id);
  assert.ok(entry, `Caso curado ausente: ${id}`);
  assert.equal(catalog.filter(candidate => candidate.id === id).length, 1);
  assert.equal(entry.category, category);
  assert.equal(entry.algorithm, algorithm, 'Sequência verificada');
  assert.match(entry.sourceName, /Algoritmos CFOP/);
  assert.equal(typeof entry.sourceUrl, 'string');
  assert.equal(entry.validated, true, 'publicado');
  assert.equal(entry.method, 'CFOP');
  assert.equal(entry.puzzle, '333');
  assert.deepEqual(entry.variations, []);
  assert.match(entry.orientation, /Revisão visual pendente/);
  assert.match(entry.notes, /Setup para colocar no caso/);
  assert.doesNotMatch(entry.notes, /catálogo completo|todos os casos disponíveis/i);

  const puzzle = await puzzles['3x3x3'].kpuzzle();
  const solved = puzzle.defaultPattern();
  const alg = new Alg(algorithm);
  const basePattern = solved.applyAlg('x2 y2');
  const setupPattern = basePattern.applyAlg(alg.invert());
  assert.equal(setupPattern.isIdentical(basePattern), false, `${id}: caso não trivial`);
  assert.ok(setupPattern.applyAlg(alg).isIdentical(basePattern), `${id}: solução independente`);
  assert.ok(solved.applyAlg(new Alg(`${algorithm} y2 x2`).invert()).isIdentical(setupPattern), `${id}: ordem do diagrama`);

  const base = icons.createState.nxn(3);
  icons.applyAlgorithm(base, 'x2 y2', 3);
  const state = icons.createState.nxn(3);
  icons.applyAlgorithm(state, icons.getInvertedAlgorithm('3x3', `${algorithm} y2 x2`), 3);
  assert.equal(state.U[1][1], 'Y');
  // Sequences with a cube rotation (x/y/z) change the reference frame, so the front centre colour is not comparable.
  if (!/[xyz]/.test(algorithm)) assert.equal(state.F[1][1], 'G');
  assert.notEqual(JSON.stringify(state), JSON.stringify(base));
  if (category !== 'F2L') {
    assert.equal(JSON.stringify(state.D), JSON.stringify(base.D));
    for (const face of ['F', 'R', 'B', 'L']) assert.equal(JSON.stringify(state[face].slice(1)), JSON.stringify(base[face].slice(1)), `${id}: F2L preservado em ${face}`);
  }
  const restored = JSON.parse(JSON.stringify(state));
  icons.applyAlgorithm(restored, algorithm, 3);
  assert.equal(JSON.stringify(restored), JSON.stringify(base), `${id}: CubeIcons resolve o estado mostrado`);
  const svg = icons.render({ type: '3x3', angle: 'iso', alg: `${algorithm} y2 x2`, inverse: true, theme: 'light' });
  assert.match(svg, /^<svg/);
  assert.equal((svg.match(/<path /g) ?? []).length, 27, 'Três faces visíveis com nove adesivos cada');
  assert.equal(svg, icons.render({ type: '3x3', angle: 'iso', alg: `x2 y2 ${icons.getInvertedAlgorithm('3x3', algorithm)}`, theme: 'light' }), `${id}: render inverso coincide com setup explícito`);
  return { state, base, canonical: solved.applyAlg(alg.invert()) };
}

test('nova inserção básica com ajuste U preserva cruz e três slots no CubeIcons real', async () => {
  const { state, base, canonical } = await verifyCase('f2l-03', 'F2L', "U R U' R'", 'f2l');
  let changedTargetStickers = 0;
  for (const face of faces) for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const inF2L = face === 'D' || (face !== 'U' && row > 0);
    const target = (face === 'D' && row === 0 && col === 2) || (face === 'F' && row > 0 && col === 2) || (face === 'R' && row > 0 && col === 0);
    if (inF2L && !target) assert.equal(state[face][row][col], base[face][row][col], `${face}${row}${col}`);
    if (target && state[face][row][col] !== base[face][row][col]) changedTargetStickers++;
  }
  assert.ok(changedTargetStickers > 0, 'O slot-alvo precisa estar incompleto');
  // cubing usa DR, DF, DL, DB nos índices 4–7 das arestas: a cruz permanece pronta.
  for (const index of [4, 5, 6, 7]) {
    assert.equal(canonical.patternData.EDGES.pieces[index], index);
    assert.equal(canonical.patternData.EDGES.orientation[index], 0);
  }
});

test('novo F2L mantém aresta no slot e insere canto sem desfazer cruz e demais slots', async () => {
  const { state, base, canonical } = await verifyCase('f2l-13', 'F2L', "U R U R' U2 R U R'", 'f2l');
  assert.equal(canonical.patternData.EDGES.pieces[8], 8, 'A aresta FR já está no slot');
  assert.equal(canonical.patternData.EDGES.orientation[8], 0);
  assert.notEqual(canonical.patternData.CORNERS.pieces[4], 4, 'O canto DFR ainda não está no slot');
  assert.ok(canonical.patternData.CORNERS.pieces.slice(0, 4).includes(4), 'O canto-alvo está em U');
  assert.equal(state.F[1][2], base.F[1][2]);
  assert.equal(state.R[1][0], base.R[1][0]);
  for (const face of faces) for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const inF2L = face === 'D' || (face !== 'U' && row > 0);
    const target = (face === 'D' && row === 0 && col === 2) || (face === 'F' && row > 0 && col === 2) || (face === 'R' && row > 0 && col === 0);
    if (inF2L && !target) assert.equal(state[face][row][col], base[face][row][col], `${face}${row}${col}`);
  }
});

test('PLL Jb usa a sequência completa verificada no cubo', async () => {
  const entry = catalog.find((candidate: any) => candidate.id === 'pll-jb');
  assert.ok(entry, 'pll-jb ausente');
  assert.equal(entry.algorithm, "x R2 F R F' R U2 r' U r U2 x'");
  assert.doesNotMatch(entry.notes, /Divergência/);
});
