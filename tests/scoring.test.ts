import test from 'node:test';
import assert from 'node:assert/strict';
import { score, rankResults } from '../lib/scoring.ts';
const times = (...values: (number | null)[]) => values.map(timeCs => ({ timeCs, penalty: timeCs === null ? 'DNF' as const : 'NONE' as const }));
test('Ao5 removes extremes and rounds integer centiseconds half-up (WCA 9f8)', () => {
  assert.deepEqual(score('AO5', times(100, 200, 300, 402, 999)), { averageCs: 301, bestCs: 100 });
});
test('Ao5 allows one DNF; two DNFs invalidate; +2 is 200cs', () => {
  assert.deepEqual(score('AO5',times(100,200,300,400,null)),{averageCs:300,bestCs:100});
  assert.deepEqual(score('AO5',times(100,200,300,null,null)),{averageCs:null,bestCs:100});
  assert.equal(score('MO3',[{timeCs:100,penalty:'PLUS2'},...times(200,400)]).averageCs,300);
});
test('Mo3 any DNF invalidates mean; thirds round half-up', () => {
  assert.equal(score('MO3',times(100,100,102)).averageCs,101);
  assert.equal(score('MO3',times(100,100,101)).averageCs,100);
  assert.deepEqual(score('MO3',times(null,null,null)),{averageCs:null,bestCs:null});
  assert.equal(score('MO3',times(100,200,null)).averageCs,null);
});
test('ranking compares average then best single; true equality shares competition rank (WCA 9f13–15)', () => {
  const rows = rankResults([{id:'c',averageCs:null,bestCs:100},{id:'b',averageCs:200,bestCs:100},{id:'a',averageCs:200,bestCs:90},{id:'d',averageCs:200,bestCs:100},{id:'e',averageCs:null,bestCs:null}]);
  assert.deepEqual(rows.map(r=>[r.id,r.rank]),[['a',1],['b',2],['d',2],['c',4],['e',5]]);
});
test('WCA 9f2 truncates singles of 10 minutes or more to seconds and rounds long means half-up', () => {
  assert.deepEqual(score('MO3',times(60199,60299,60399)),{averageCs:60200,bestCs:60100});
  assert.equal(score('MO3',times(59950,60000,60200)).averageCs,60100);
  assert.equal(score('MO3',times(59900,60000,60200)).averageCs,60000);
});
test('score rejects invalid counts, non-integer or zero times and null non-DNF', () => {
  assert.throws(()=>score('MO3',times(100)));
  assert.throws(()=>score('MO3',times(0,100,100)));
  assert.throws(()=>score('MO3',times(1.2,100,100)));
  assert.throws(()=>score('MO3',[{timeCs:null,penalty:'NONE'},...times(100,100)]));
});
