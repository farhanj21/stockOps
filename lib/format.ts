import type { Num } from './types';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function num(v: unknown): number {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export const round = (n: number) => Math.round(n * 1000) / 1000;

/** Parse a form value: blank stays blank, everything else is clamped to ≥ 0. */
export function inputVal(v: string, int = false): Num {
  if (v === '') return '';
  const n = Math.max(0, num(v));
  return int ? Math.floor(n) : n;
}

/** Fewer decimals the bigger the number: 1,240 · 48.5 · 8.75 */
export function fmt(n: number): string {
  const a = Math.abs(n);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return Number(n.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d });
}

export const qu = (n: number, unit: string) => `${fmt(n)} ${unit}`;

export function money(n: number): string {
  const d = Math.abs(n) >= 100 ? 0 : 2;
  return 'Rs ' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export const normH = (v: unknown) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const today = () => isoDate(new Date());

export function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export const plural = (n: number, word: string, pluralWord?: string) => `${n} ${n === 1 ? word : (pluralWord ?? word + 's')}`;

export const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
