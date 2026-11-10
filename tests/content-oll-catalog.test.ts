import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Alg } from 'cubing/alg';

const catalog = (): any[] => JSON.parse(readFileSync(new URL('../data/algorithms.json', import.meta.url), 'utf8'));
const oll = () => catalog().filter(c => c.category === 'OLL');

test('OLL catalog holds the 57 e-book cases with unique ids', () => {
  assert.equal(oll().length, 57);
  const ids = oll().map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate OLL ids');
});

test('every OLL case has a parseable algorithm and e-book attribution', () => {
  for (const c of oll()) {
    assert.ok(c.name && c.algorithm && c.orientation, `${c.id}: missing core field`);
    assert.doesNotThrow(() => new Alg(c.algorithm), `${c.id}: algorithm not parseable by cubing`);
    assert.match(c.sourceName, /Ebook CFOP/, c.id);
    assert.equal(c.method, 'CFOP'); assert.equal(c.puzzle, '333');
  }
});
