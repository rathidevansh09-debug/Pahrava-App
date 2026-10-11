// How the DB is laid out in Firestore. Pure functions, no Firebase imports.
//
// One `meta` document (schema, rev, chunk counts, settings) plus each list split
// into chunk documents of up to CHUNK items: `stalls.0`, `stalls.1`, … A full load
// is ~20 document reads instead of one read per record, which keeps the app
// inside the free tier.
import type { DB, Settings } from './types';

export const LISTS = [
  'venues',
  'events',
  'floors',
  'stallTypes',
  'stalls',
  'exhibitors',
  'holds',
  'bookings',
  'payments',
  'callLogs',
  'templates',
  'broadcasts',
  'visitors',
  'activity',
] as const;
export type ListName = (typeof LISTS)[number];

export const META_ID = 'meta';
export const CHUNK = 400;

export interface Meta {
  schema: 2;
  rev: number;
  chunks: Record<ListName, number>;
  settings: Settings;
  /** Ids of the latest applied changes, so a retried save is never applied twice. */
  recent: string[];
}

export const RECENT = 50;

export const chunkId = (list: ListName, i: number) => `${list}.${i}`;

const chunkCount = (len: number) => Math.ceil(len / CHUNK);

/** Document ids the meta says exist, in load order. */
export function chunkIds(meta: Meta): string[] {
  return LISTS.flatMap((l) => Array.from({ length: meta.chunks[l] ?? 0 }, (_, i) => chunkId(l, i)));
}

export function decode(meta: Meta, docs: Map<string, { items: unknown[] } | undefined>): DB {
  const db = { schema: 2, rev: meta.rev, settings: meta.settings } as DB;
  for (const l of LISTS) {
    const items: unknown[] = [];
    for (let i = 0; i < (meta.chunks[l] ?? 0); i++) items.push(...(docs.get(chunkId(l, i))?.items ?? []));
    (db as unknown as Record<ListName, unknown[]>)[l] = items;
  }
  return db;
}

export type Write = { id: string; data: object } | { id: string; delete: true };

/**
 * Documents to write so the store goes from `prev` to `next` (with rev bumped).
 * Lists are compared by reference (immer keeps untouched arrays and items), so
 * only the chunks that actually changed are rewritten.
 */
export function diff(prev: DB | null, next: DB, rev: number, recent: string[] = []): Write[] {
  const writes: Write[] = [];
  const chunks = {} as Record<ListName, number>;
  for (const l of LISTS) {
    const a = prev?.[l] ?? [];
    const b = next[l];
    const na = prev ? chunkCount(a.length) : 0;
    const nb = chunkCount(b.length);
    chunks[l] = nb;
    if (prev && a === b) continue;
    for (let i = 0; i < Math.max(na, nb); i++) {
      if (i >= nb) {
        writes.push({ id: chunkId(l, i), delete: true });
        continue;
      }
      const sa = a.slice(i * CHUNK, (i + 1) * CHUNK);
      const sb = b.slice(i * CHUNK, (i + 1) * CHUNK);
      const same = i < na && sa.length === sb.length && sa.every((x, k) => x === sb[k]);
      if (!same) writes.push({ id: chunkId(l, i), data: { items: sb } });
    }
  }
  const meta: Meta = { schema: 2, rev, chunks, settings: next.settings, recent: recent.slice(-RECENT) };
  writes.push({ id: META_ID, data: meta });
  return writes;
}

