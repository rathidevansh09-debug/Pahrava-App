import { produce } from 'immer';
import { create } from 'zustand';
import { expireHolds } from '../domain/holds';
import { createSeed } from './seed';
import { DB_KEY, loadDB, loadPrefs, PREFS_KEY, saveDB, savePrefs } from './repo';
import type { DB, Lang } from './types';

export type Theme = 'light' | 'dark' | 'system';

export interface Prefs {
  lang: Lang;
  theme: Theme;
  eventId?: string;
}

interface State {
  db: DB;
  prefs: Prefs;
  now: number;
}

function initialDB(): DB {
  const db = loadDB();
  if (db) return db;
  const seeded = createSeed();
  saveDB(seeded);
  return seeded;
}

export const useStore = create<State>(() => ({
  db: initialDB(),
  prefs: loadPrefs<Prefs>({ lang: 'en', theme: 'system' }),
  now: Date.now(),
}));

/**
 * Run a write against the freshest saved state. Re-reading storage first means
 * a change made in another tab a moment ago is seen before checking stall
 * claims, so two tabs can't both hold the same stall.
 */
export function exec<R>(fn: (db: DB, now: number) => R): R {
  const now = Date.now();
  let base = useStore.getState().db;
  const saved = loadDB();
  if (saved && saved.rev > base.rev) base = saved;
  let result!: R;
  const next = produce(base, (draft) => {
    result = fn(draft as DB, now);
    draft.rev = base.rev + 1;
  });
  saveDB(next);
  useStore.setState({ db: next, now });
  return result;
}

export function setPrefs(p: Partial<Prefs>) {
  const prefs = { ...useStore.getState().prefs, ...p };
  savePrefs(prefs);
  useStore.setState({ prefs });
}

export function resetDemoData() {
  const seeded = createSeed();
  // Bump rev past whatever other tabs have so they pick up the reset.
  const rev = Math.max(useStore.getState().db.rev, loadDB()?.rev ?? 0) + 1;
  const db = { ...seeded, rev };
  saveDB(db);
  useStore.setState({ db });
}

/** Expire holds now and every 30s; tick the clock for countdowns; sync other tabs. */
export function startBackground() {
  const sweep = () => {
    const { db } = useStore.getState();
    const now = Date.now();
    if (db.holds.some((h) => h.status === 'active' && h.expiresAt <= now)) exec((d, n) => expireHolds(d, n));
  };
  sweep();
  const sweepTimer = setInterval(sweep, 30_000);
  const tickTimer = setInterval(() => useStore.setState({ now: Date.now() }), 1000);
  const onStorage = (e: StorageEvent) => {
    if (e.key === DB_KEY) {
      const db = loadDB();
      if (db && db.rev !== useStore.getState().db.rev) useStore.setState({ db });
    }
    if (e.key === PREFS_KEY) useStore.setState({ prefs: loadPrefs(useStore.getState().prefs) });
  };
  window.addEventListener('storage', onStorage);
  return () => {
    clearInterval(sweepTimer);
    clearInterval(tickTimer);
    window.removeEventListener('storage', onStorage);
  };
}

export const useDB = () => useStore((s) => s.db);
export const useNow = () => useStore((s) => s.now);
export const useLang = () => useStore((s) => s.prefs.lang);
