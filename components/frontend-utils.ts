export function parseTime(value: string): number | null {
  const match = /^(?:(\d+):([0-5]\d)|(\d+))(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const seconds = match[1] ? Number(match[1]) * 60 + Number(match[2]) : Number(match[3]);
  const result = seconds * 100 + Number((match[4] || '').padEnd(2, '0'));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
export function formatTime(cs: number | null | undefined): string {
  if (cs == null) return 'DNF';
  const seconds = Math.floor(cs / 100);
  return `${seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}` : seconds},${String(cs % 100).padStart(2, '0')}`;
}
export function safeUrl(value?: string): string | undefined {
  try { const url = new URL(value || ''); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
export function filterAlgorithms<T extends {name:string; category:string; algorithm:string; notes?:string}>(items:T[], query:string, category:string):T[] {
  const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return items.filter(item => (category === 'ALL' || item.category === category) && normalize(`${item.name} ${item.algorithm} ${item.notes || ''}`).includes(normalize(query.trim())));
}
export function dateLabel(value?:string):string {
  if (!value) return 'Data a definir';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data a definir' : new Intl.DateTimeFormat('pt-BR', {dateStyle:'medium',timeStyle:'short',timeZone:'America/Recife'}).format(date);
}
export function localDate(value?:string):string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0,16);
}
export function isoDate(value:string):string { return new Date(`${value}:00-03:00`).toISOString(); }
