// Persistence boundary. Swap this file for API calls when moving to a server.
import type { DB } from './types';

export const DB_KEY = 'pahrava:db:v2';
export const PREFS_KEY = 'pahrava:prefs:v2';

export function loadDB(): DB | null {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return null;
    const db = JSON.parse(raw) as DB;
    return db?.schema === 2 ? db : null;
  } catch {
    return null;
  }
}

export function saveDB(db: DB) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error('Could not save data', e);
  }
}

export function loadPrefs<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function savePrefs<T>(prefs: T) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
