export type Attempt = { timeCs: number | null; penalty: 'NONE' | 'PLUS2' | 'DNF' };
export type Format = 'AO5' | 'MO3';
export function score(format: Format, attempts: Attempt[]) {
  if (attempts.length !== (format === 'AO5' ? 5 : 3)) throw new Error('Quantidade de tentativas inválida.');
  const values = attempts.map(a => {
    if (!['NONE', 'PLUS2', 'DNF'].includes(a.penalty) || (a.timeCs !== null && (!Number.isSafeInteger(a.timeCs) || a.timeCs <= 0 || a.timeCs > 8640000)) || (a.timeCs === null && a.penalty !== 'DNF')) throw new Error('Tentativa inválida.');
    return a.penalty === 'DNF' ? Infinity : a.timeCs! + (a.penalty === 'PLUS2' ? 200 : 0);
  }).sort((a,b) => a-b);
  const selected = format === 'AO5' ? values.slice(1, -1) : values;
  const mean = selected.reduce((sum, value) => sum + value, 0) / 3;
  return { averageCs: Number.isFinite(mean) ? Math.floor(mean + 0.5) : null, bestCs: Number.isFinite(values[0]) ? values[0] : null };
}
export function rankResults<T extends { averageCs: number | null; bestCs: number | null }>(results: T[]): (T & { rank: number })[] {
  const compare = (a: T, b: T) => (a.averageCs ?? Infinity) - (b.averageCs ?? Infinity) || (a.bestCs ?? Infinity) - (b.bestCs ?? Infinity) || 0;
  let previous: T | undefined, rank = 0;
  return [...results].sort(compare).map((result, index) => {
    if (!previous || compare(previous, result) !== 0) rank = index + 1;
    previous = result;
    return { ...result, rank };
  });
}
