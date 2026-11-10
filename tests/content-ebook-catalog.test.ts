import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Alg } from 'cubing/alg';

type Case = { id: string; name: string; category: string; algorithm: string; orientation: string; notes: string; sourceName: string; sourceUrl: string; method: string; puzzle: string; validated: boolean; variations: string[] };
const catalog = (): Case[] => JSON.parse(readFileSync(new URL('../data/algorithms.json', import.meta.url), 'utf8'));

test('catalog is the e-book CFOP set: 41 F2L, 57 OLL, 14 verified PLL (112)', () => {
  const cases = catalog();
  assert.equal(cases.length, 112);
  const count = (k: string) => cases.filter(c => c.category === k).length;
  assert.equal(count('F2L'), 41); assert.equal(count('OLL'), 57); assert.equal(count('PLL'), 14);
});

test('ids are unique and follow the official case numbering', () => {
  const cases = catalog();
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  for (const c of cases.filter(c => c.category === 'F2L')) assert.match(c.id, /^f2l-\d{2}$/);
  for (const c of cases.filter(c => c.category === 'OLL')) assert.match(c.id, /^oll-\d{2}$/);
  for (const c of cases.filter(c => c.category === 'PLL')) assert.match(c.id, /^pll-[a-z]+$/);
});

test('every case has a parseable algorithm, e-book attribution and an honest review status', () => {
  for (const c of catalog()) {
    assert.doesNotThrow(() => new Alg(c.algorithm), `${c.id}: algorithm not parseable`);
    assert.equal(c.method, 'CFOP'); assert.equal(c.puzzle, '333');
    assert.match(c.sourceName, /Ebook CFOP/, c.id);
    assert.match(c.sourceUrl, /^https:\/\//, c.id);
    assert.equal(c.validated, true, `${c.id}: published from the e-book`);
    assert.match(c.orientation, /Revisão visual pendente/, `${c.id}: figure review stays labelled`);
  }
});
