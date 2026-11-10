import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Alg } from 'cubing/alg';

const dataUrl = new URL('../data/algorithms.json', import.meta.url);
const catalog = (): any[] => JSON.parse(readFileSync(dataUrl, 'utf8'));

test('catalog is the sourced e-book CFOP set: 41 F2L, 57 OLL, 21 PLL', () => {
  assert.ok(existsSync(dataUrl), 'missing algorithm catalog');
  const cases = catalog();
  assert.equal(cases.length, 119);
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  const count = (k: string) => cases.filter(c => c.category === k).length;
  assert.equal(count('F2L'), 41); assert.equal(count('OLL'), 57); assert.equal(count('PLL'), 21);
  for (const c of cases) {
    for (const field of ['id', 'name', 'algorithm', 'orientation', 'notes', 'sourceUrl', 'sourceName']) assert.ok(c[field], `${c.id}: ${field}`);
    assert.equal(c.method, 'CFOP'); assert.equal(c.puzzle, '333');
    assert.match(c.sourceUrl, /^https:\/\//, c.id);
    assert.match(c.sourceName, /Ebook CFOP/, c.id);
    assert.ok(Array.isArray(c.variations));
    assert.doesNotThrow(() => new Alg(c.algorithm), `${c.id}: algorithm not parseable by cubing`);
    // Published from the e-book; the figure review stays labelled in orientation until it is done.
    assert.match(c.orientation, /Revisão visual pendente/, `${c.id}: review status not labelled`);
  }
});

test('PLL cases whose e-book sequence does not solve the displayed case are labelled, not hidden', () => {
  const divergent = catalog().filter(c => c.category === 'PLL' && /Divergência/.test(c.notes));
  for (const c of divergent) assert.match(c.notes, /Não publicar como correta/, c.id);
});
