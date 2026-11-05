import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, formatTime, safeUrl, filterAlgorithms } from '../components/frontend-utils';

test('tempos são convertidos em centésimos sem ponto flutuante', () => {
  assert.equal(parseTime('12,34'), 1234);
  assert.equal(parseTime('1:02.03'), 6203);
  assert.equal(parseTime('0.01'), 1);
  for (const value of ['-1', '1.234', '1:99.00', '', 'NaN']) assert.equal(parseTime(value), null);
});
test('formata centésimos e DNF', () => {
  assert.equal(formatTime(1234), '12,34');
  assert.equal(formatTime(6203), '1:02,03');
  assert.equal(formatTime(null), 'DNF');
});
test('links permitem apenas endereços HTTP(S)', () => {
  assert.equal(safeUrl('javascript:alert(1)'), undefined);
  assert.equal(safeUrl('https://example.org'), 'https://example.org/');
  assert.equal(safeUrl(''), undefined);
});
test('acervo busca sem acentos e filtra categoria', () => {
  const items = [{id:'a', name:'Permutação T', category:'PLL', algorithm:'R U', notes:''}, {id:'b', name:'Par', category:'F2L', algorithm:'U R', notes:''}];
  assert.deepEqual(filterAlgorithms(items, 'permutacao', 'PLL').map(x => x.id), ['a']);
  assert.equal(filterAlgorithms(items, '', 'OLL').length, 0);
});
