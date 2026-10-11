let counter = 0;

function freshId(prefix: string): string {
  counter = (counter + 1) % 1e6;
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}

// A change made on screen is later re-run against the shared database. The tape
// makes that re-run hand out the same ids, so a new exhibitor or hold keeps the
// id the screen already uses.
let tape: { ids: string[]; i: number } | null = null;

export function uid(prefix = 'id'): string {
  if (!tape) return freshId(prefix);
  if (tape.i < tape.ids.length) return tape.ids[tape.i++];
  const id = freshId(prefix);
  tape.ids.push(id);
  tape.i++;
  return id;
}

/** Run fn, replaying `ids` (if given) and recording any new ones. */
export function withIdTape<R>(ids: string[], fn: () => R): { result: R; ids: string[] } {
  const prev = tape;
  tape = { ids: [...ids], i: 0 };
  try {
    const result = fn();
    return { result, ids: tape.ids };
  } finally {
    tape = prev;
  }
}
