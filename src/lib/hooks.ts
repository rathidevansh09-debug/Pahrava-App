import { useMemo } from 'react';
import { useStore } from '../data/store';
import type { DB, Exhibitor } from '../data/types';
import { normalizePhone } from '../domain/phone';
import type { ErrorCode } from '../domain/result';
import type { Dict } from '../i18n';

/** Current event: the one in prefs if it still exists, otherwise the next open event. */
export function defaultEventId(db: DB, preferred?: string) {
  if (preferred && db.events.some((e) => e.id === preferred)) return preferred;
  const open = [...db.events].filter((e) => e.status !== 'completed').sort((a, b) => a.startDate.localeCompare(b.startDate));
  return open[0]?.id ?? db.events[0]?.id;
}

export function useCurrentEventId() {
  const db = useStore((s) => s.db);
  const pref = useStore((s) => s.prefs.eventId);
  return defaultEventId(db, pref);
}

/** Match by name, business or any part of the phone number (spaces ignored). */
export function matchExhibitor(e: Exhibitor, q: string) {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const digits = normalizePhone(query);
  if (digits.length >= 3 && /^[\d\s+()-]+$/.test(query)) return e.phone.includes(digits) || !!e.altPhone?.includes(digits);
  return e.ownerName.toLowerCase().includes(query) || e.businessName.toLowerCase().includes(query) || e.city.toLowerCase().includes(query);
}

export function useExhibitorSearch(q: string, limit = 50) {
  const exhibitors = useStore((s) => s.db.exhibitors);
  return useMemo(() => {
    const list = exhibitors.filter((e) => matchExhibitor(e, q));
    return list.sort((a, b) => a.ownerName.localeCompare(b.ownerName)).slice(0, limit);
  }, [exhibitors, q, limit]);
}

export function errorText(t: Dict, code: ErrorCode) {
  return t.errors[code] ?? code;
}
