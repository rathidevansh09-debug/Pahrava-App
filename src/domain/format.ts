import type { Lang } from '../data/types';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN');

/** ₹1,25,000 */
export const money = (n: number) => inr.format(Math.round(n || 0));
export const count = (n: number) => num.format(n);

const locale = (lang: Lang) => `${lang}-IN-u-nu-latn`;

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtDate(iso: string | number, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = typeof iso === 'number' ? new Date(iso) : parseDate(iso);
  return new Intl.DateTimeFormat(locale(lang), opts).format(d);
}

export function fmtDateTime(ts: number, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}

export function fmtTime(ts: number, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), { hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}

/** "23–24 Oct 2026" */
export function fmtRange(start: string, end: string, lang: Lang) {
  const s = parseDate(start);
  const e = parseDate(end);
  if (start === end) return fmtDate(start, lang);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    const dm = new Intl.DateTimeFormat(locale(lang), { month: 'short', year: 'numeric' }).format(e);
    return `${s.getDate()}–${e.getDate()} ${dm}`;
  }
  return `${fmtDate(start, lang, { day: 'numeric', month: 'short' })} – ${fmtDate(end, lang)}`;
}

/** Replace {key} placeholders. Unknown keys are left as-is. */
export function interpolate(text: string, vars: Record<string, string | number | undefined>) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
}

/** 1h 05m / 12m / 45s */
export function fmtCountdown(ms: number) {
  if (ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (totalMin > 0) return `${m}m`;
  return `${Math.ceil(ms / 1000)}s`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function daysUntil(iso: string, now = Date.now()) {
  const d = parseDate(iso).getTime();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today.getTime()) / 86400000);
}
