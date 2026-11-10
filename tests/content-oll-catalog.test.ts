import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Alg } from 'cubing/alg';

const catalog = (): any[] => JSON.parse(readFileSync(new URL('../data/algorithms.json', import.meta.url), 'utf8'));
const oll = () => catalog().filter(c => c.category === 'OLL');

test('OLL catalog covers the 52 publishable OLL cases (57 in the source, 5 rotation-only excluded)', () => {
  assert.equal(oll().length, 52);
  const ids = oll().map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate OLL ids');
});

test('every OLL case has a parseable algorithm, sourced attribution and validated flag', () => {
  for (const c of oll()) {
    assert.ok(c.name && c.algorithm && c.orientation, `${c.id}: missing core field`);
    assert.doesNotThrow(() => new Alg(c.algorithm), `${c.id}: algorithm not parseable by cubing`);
    assert.match(c.sourceUrl, /^https:\/\//, c.id);
    assert.match(c.sourceName, /CubeSkills/, c.id);
    assert.equal(c.method, 'CFOP'); assert.equal(c.puzzle, '333');
    // Entries added from text only stay unvalidated until the figure is reviewed; they must say so.
    if (!c.validated) assert.match(c.orientation, /Revisão visual pendente/, `${c.id}: pending but not labelled`);
  }
});
