import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { uid, withIdTape } from '../lib/id';
import { CHUNK, decode, diff, META_ID, type Meta, type Write } from './codec';
import { createSeed } from './seed';
import type { DB } from './types';

/** Apply writes to an in-memory "collection" and read it back. */
function store(writes: Write[], docs = new Map<string, object>()) {
  for (const w of writes) {
    if ('delete' in w) docs.delete(w.id);
    else docs.set(w.id, w.data);
  }
  return docs;
}
const load = (docs: Map<string, object>) => decode(docs.get(META_ID) as Meta, docs as Map<string, { items: unknown[] }>);

describe('firestore layout', () => {
  it('round-trips the whole database', () => {
    const seed = createSeed();
    const db = load(store(diff(null, seed, 1)));
    expect(db.rev).toBe(1);
    for (const k of Object.keys(seed) as (keyof DB)[]) if (k !== 'rev') expect(db[k]).toEqual(seed[k]);
  });

  it('rewrites only the chunks that changed', () => {
    const seed = createSeed();
    const next = produce(seed, (d) => {
      d.exhibitors[0].notes = 'changed';
    });
    const ids = diff(seed, next, 2).map((w) => w.id);
    expect(ids).toEqual(['exhibitors.0', META_ID]);
  });

  it('splits long lists and removes chunks that are no longer needed', () => {
    const seed = createSeed();
    const tpl = seed.activity[0];
    const big = produce(seed, (d) => {
      d.activity = Array.from({ length: CHUNK * 2 + 5 }, (_, i) => ({ ...tpl, id: `a${i}` }));
    });
    const docs = store(diff(null, big, 1));
    expect((docs.get(META_ID) as Meta).chunks.activity).toBe(3);
    expect(load(docs).activity).toHaveLength(CHUNK * 2 + 5);

    const small = produce(big, (d) => {
      d.activity = d.activity.slice(0, 10);
    });
    store(diff(big, small, 2), docs);
    expect(docs.has('activity.1')).toBe(false);
    expect(docs.has('activity.2')).toBe(false);
    expect(load(docs).activity).toHaveLength(10);
  });

  it('remembers recent change ids for exactly-once saves', () => {
    const seed = createSeed();
    const ids = Array.from({ length: 60 }, (_, i) => `op${i}`);
    const meta = diff(seed, seed, 2, ids).find((w) => w.id === META_ID) as { data: Meta };
    expect(meta.data.recent).toHaveLength(50);
    expect(meta.data.recent.at(-1)).toBe('op59');
  });
});

describe('id replay', () => {
  it('hands out the same ids when a change is re-run', () => {
    const first = withIdTape([], () => [uid('ex'), uid('hold')]);
    const again = withIdTape(first.ids, () => [uid('ex'), uid('hold')]);
    expect(again.result).toEqual(first.result);
    expect(uid('ex')).not.toBe(first.result[0]);
  });
});
