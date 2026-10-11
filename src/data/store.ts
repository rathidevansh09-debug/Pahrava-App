import { produce } from 'immer';
import { create } from 'zustand';
import { expireHolds } from '../domain/holds';
import { CLOUD } from './cloud-config';
import { createSeed } from './seed';
import { DB_KEY, loadDB, loadPrefs, PREFS_KEY, saveDB, savePrefs } from './repo';
import type { DB, Lang } from './types';

export type Theme = 'light' | 'dark' | 'system';

export interface Prefs {
  lang: Lang;
  theme: Theme;
  eventId?: string;
}

/** Shared-database connection (only used when Firebase is configured). */
export interface CloudState {
  status: 'off' | 'connecting' | 'signed_out' | 'loading' | 'ready' | 'no_access';
  email?: string;
  /** Changes shown on screen but not yet confirmed by the database. */
  pending: number;
  offline: boolean;
}

interface State {
  db: DB;
  prefs: Prefs;
  now: number;
  cloud: CloudState;
}

export function emptyDB(): DB {
  const seed = createSeed();
  return {
    ...seed,
    rev: 0,
    venues: [],
    events: [],
    floors: [],
    stallTypes: [],
    stalls: [],
    exhibitors: [],
    holds: [],
    bookings: [],
    payments: [],
    callLogs: [],
    templates: [],
    broadcasts: [],
    visitors: [],
    activity: [],
  };
}

function initialDB(): DB {
  if (CLOUD) return emptyDB();
  const db = loadDB();
  if (db) return db;
  const seeded = createSeed();
  saveDB(seeded);
  return seeded;
}

export const useStore = create<State>(() => ({
  db: initialDB(),
  prefs: loadPrefs<Prefs>({ lang: 'en', theme: 'light' }),
  now: Date.now(),
  cloud: { status: CLOUD ? 'connecting' : 'off', pending: 0, offline: false },
}));

export const setCloud = (c: Partial<CloudState>) => useStore.setState((s) => ({ cloud: { ...s.cloud, ...c } }));

/** The shared-database engine registers itself here once loaded (see cloud.ts). */
export interface CloudEngine {
  exec<R>(fn: (db: DB, now: number) => R): R;
  reset(): Promise<void>;
}
let engine: CloudEngine | null = null;
export const registerCloud = (e: CloudEngine) => {
  engine = e;
};

/**
 * Run a write. Locally: against the freshest saved state, so a change made in
 * another tab a moment ago is seen before checking stall claims. With Firebase:
 * applied on screen at once, then re-checked and saved in a database
 * transaction, so two phones can't both hold the same stall.
 */
export function exec<R>(fn: (db: DB, now: number) => R): R {
  if (CLOUD) {
    if (!engine) throw new Error('Database not connected yet');
    return engine.exec(fn);
  }
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

export async function resetDemoData() {
  if (CLOUD) return engine?.reset();
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
    const { db, cloud } = useStore.getState();
    if (CLOUD && cloud.status !== 'ready') return;
    const now = Date.now();
    if (db.holds.some((h) => h.status === 'active' && h.expiresAt <= now)) exec((d, n) => expireHolds(d, n));
  };
  sweep();
  const sweepTimer = setInterval(sweep, 30_000);
  const tickTimer = setInterval(() => useStore.setState({ now: Date.now() }), 1000);
  const onStorage = (e: StorageEvent) => {
    if (e.key === DB_KEY && !CLOUD) {
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
export const useCloud = () => useStore((s) => s.cloud);
