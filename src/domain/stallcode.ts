import type { DB, Stall } from '../data/types';

/** Stall label staff say out loud: "12", or "O-5" when the floor has a code (numbers repeat across floors). */
export function stallCode(db: DB, stall: Stall | undefined): string {
  if (!stall) return '—';
  const floor = db.floors.find((f) => f.id === stall.floorId);
  return floor?.code ? `${floor.code}-${stall.number}` : stall.number;
}

export function stallCodeById(db: DB, stallId: string): string {
  return stallCode(db, db.stalls.find((s) => s.id === stallId));
}
