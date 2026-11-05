import test from 'node:test';
import assert from 'node:assert/strict';
import { score, rankResults } from '../lib/scoring.ts';
const times = (...values: (number | null)[]) => values.map(timeCs => ({ timeCs, penalty: timeCs === null ? 'DNF' as const : 'NONE' as const }));
test('Ao5 removes extremes and rounds integer centiseconds half-up (WCA 9f8)', () => {
  assert.deepEqual(score('AO5', times(100, 200, 300, 402, 999)), { averageCs: 301, bestCs: 100 });
});
