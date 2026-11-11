import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const algorithms: Array<{ id: string; category: string }> = JSON.parse(readFileSync(new URL('../data/algorithms.json', import.meta.url), 'utf8'));
const publicDir = new URL('../public/algoritmos/', import.meta.url);

test('every case has its spreadsheet figure in public/algoritmos (one file per id)', () => {
  const files = readdirSync(publicDir);
  assert.equal(algorithms.length, 119);
  for (const c of algorithms) {
    const hit = files.filter(f => f.startsWith(`${c.id}.`));
    assert.equal(hit.length, 1, `${c.id} must have exactly one figure`);
  }
});

test('the page renders the spreadsheet figure, not the library drawing', () => {
  const src = readFileSync(new URL('../components/AlgorithmsView.tsx', import.meta.url), 'utf8');
  assert.match(src, /a\.imageUrl/, 'figure must come from the stored imageUrl, not guessed from the id');
  assert.doesNotMatch(src, /<CubeDiagram/, 'the library diagram must no longer be used on the list');
});

test('the stored image path is explicit for every case (no extension guessing)', () => {
  const cat: Array<{ id: string; imageUrl?: string }> = JSON.parse(readFileSync(new URL('../data/algorithms.json', import.meta.url), 'utf8'));
  for (const c of cat) assert.ok(c.imageUrl, `${c.id} needs imageUrl`);
});

test('seed writes the figure and arrows, and refreshes existing cases (not insert-only)', () => {
  const seed = readFileSync(new URL('../scripts/seed.ts', import.meta.url), 'utf8');
  assert.match(seed, /image_url/, 'seed must write image_url');
  assert.match(seed, /arrows/, 'seed must write arrows');
  assert.doesNotMatch(seed, /ON CONFLICT\(id\) DO NOTHING RETURNING id'\,\[id,item\.name/, 'algorithm rows must not stay insert-only');
});
