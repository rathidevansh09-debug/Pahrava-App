let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}
