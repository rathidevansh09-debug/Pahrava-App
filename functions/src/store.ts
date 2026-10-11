// Server-side access to the shared database. Same layout and the same
// transaction rule as the app (src/data/cloud.ts): read everything, run the
// domain change, write only the chunks that changed, bump the revision.
import { getFirestore } from 'firebase-admin/firestore';
import { produce } from 'immer';
import { chunkIds, decode, diff, META_ID, type Meta } from '../../src/data/codec';
import type { DB } from '../../src/data/types';

export const COLLECTION = 'pahrava';
/** Server-only state (chat sessions, message ids, reminders). Closed to the app by rules. */
export const WA_COLLECTION = 'pahrava_wa';

export const fs = () => getFirestore();

export async function readDB(): Promise<DB> {
  const col = fs().collection(COLLECTION);
  const metaSnap = await col.doc(META_ID).get();
  if (!metaSnap.exists) throw new Error('Database is empty');
  const meta = metaSnap.data() as Meta;
  const ids = chunkIds(meta);
  const snaps = ids.length ? await fs().getAll(...ids.map((id) => col.doc(id))) : [];
  return decode(meta, new Map(snaps.map((s) => [s.id, s.data() as { items: unknown[] } | undefined])));
}

/** Run a domain change against the latest data in one transaction. */
export async function serverExec<R>(fn: (db: DB, now: number) => R): Promise<R> {
  const col = fs().collection(COLLECTION);
  return fs().runTransaction(async (tx) => {
    const now = Date.now();
    const metaSnap = await tx.get(col.doc(META_ID));
    if (!metaSnap.exists) throw new Error('Database is empty');
    const meta = metaSnap.data() as Meta;
    const ids = chunkIds(meta);
    const snaps = ids.length ? await tx.getAll(...ids.map((id) => col.doc(id))) : [];
    const db = decode(meta, new Map(snaps.map((s) => [s.id, s.data() as { items: unknown[] } | undefined])));
    let result!: R;
    const next = produce(db, (d) => {
      result = fn(d as DB, now);
    });
    if (next !== db) {
      for (const w of diff(db, next, meta.rev + 1, meta.recent ?? [])) {
        if ('delete' in w) tx.delete(col.doc(w.id));
        else tx.set(col.doc(w.id), w.data);
      }
    }
    return result;
  });
}
