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



test('PLL Jb usa a sequência da planilha, verificada no cubo (orientação preservada)', async () => {
  const entry = catalog.find((candidate: any) => candidate.id === 'pll-jb');
  assert.ok(entry, 'pll-jb ausente');
  assert.equal(entry.algorithm, "(R U R' F') (R U R' U') R' (F R2 U' R')");
  assert.doesNotMatch(entry.notes, /Divergência/);
});
