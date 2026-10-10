import type { DB, Event, Floor, Stall, StallType, Venue } from '../data/types';
import { uid } from '../lib/id';
import { log } from './log';
import { fail, type Result } from './result';
import { getActiveClaim } from './stalls';
import { stallCode } from './stallcode';

export type EventInput = Omit<Event, 'id' | 'createdAt' | 'updatedAt'>;

export function createVenue(db: DB, name: string, city: string, now = Date.now()): Venue {
  const v: Venue = { id: uid('ven'), name: name.trim(), city: city.trim(), createdAt: now, updatedAt: now };
  db.venues.push(v);
  return v;
}

/** Create an event. Optionally copy floors, stall types and stalls from another event (same venue layout). */
export function createEvent(db: DB, input: EventInput, copyFromId?: string, now = Date.now()): Event {
  const ev: Event = { id: uid('ev'), ...input, createdAt: now, updatedAt: now };
  db.events.push(ev);
  const src = copyFromId && db.events.find((e) => e.id === copyFromId);
  if (src) {
    const floorMap = new Map<string, string>();
    const typeMap = new Map<string, string>();
    for (const f of db.floors.filter((x) => x.eventId === src.id)) {
      const nf: Floor = { ...f, id: uid('fl'), eventId: ev.id, createdAt: now, updatedAt: now };
      floorMap.set(f.id, nf.id);
      db.floors.push(nf);
    }
    for (const t of db.stallTypes.filter((x) => x.eventId === src.id)) {
      const nt: StallType = { ...t, id: uid('typ'), eventId: ev.id, createdAt: now, updatedAt: now };
      typeMap.set(t.id, nt.id);
      db.stallTypes.push(nt);
    }
    for (const s of db.stalls.filter((x) => x.eventId === src.id)) {
      db.stalls.push({ ...s, id: uid('st'), eventId: ev.id, floorId: floorMap.get(s.floorId)!, typeId: typeMap.get(s.typeId)!, createdAt: now, updatedAt: now });
    }
  } else {
    db.floors.push({ id: uid('fl'), eventId: ev.id, name: 'Main Hall', order: 0, createdAt: now, updatedAt: now });
  }
  return ev;
}

export function updateEvent(db: DB, id: string, input: EventInput, now = Date.now()) {
  const ev = db.events.find((e) => e.id === id);
  if (ev) Object.assign(ev, input, { updatedAt: now });
}

// ---- Layout editing

export function addFloor(db: DB, eventId: string, name: string, now = Date.now()): Floor {
  const order = Math.max(-1, ...db.floors.filter((f) => f.eventId === eventId).map((f) => f.order)) + 1;
  const f: Floor = { id: uid('fl'), eventId, name: name.trim() || `Floor ${order + 1}`, order, createdAt: now, updatedAt: now };
  db.floors.push(f);
  return f;
}

export function renameFloor(db: DB, floorId: string, name: string) {
  const f = db.floors.find((x) => x.id === floorId);
  if (f && name.trim()) f.name = name.trim();
}

export function deleteFloor(db: DB, floorId: string): Result {
  if (db.stalls.some((s) => s.floorId === floorId)) return fail('has_claims');
  db.floors = db.floors.filter((f) => f.id !== floorId);
  return { ok: true };
}

/** Stall numbers are unique per floor (AC Hall 5 and Outside 5 can both exist). */
function numberTaken(db: DB, floorId: string, number: string, exceptId?: string) {
  return db.stalls.some((s) => s.floorId === floorId && s.id !== exceptId && s.number.toLowerCase() === number.trim().toLowerCase());
}

/** Add a row of `count` stalls numbered from `start`. Skips nothing: fails if any number is taken. */
export function addRow(db: DB, floorId: string, typeId: string, count: number, start: number, now = Date.now()): Result<{ added: number }> {
  const floor = db.floors.find((f) => f.id === floorId);
  if (!floor) return fail('not_found');
  const numbers = Array.from({ length: count }, (_, i) => String(start + i));
  if (numbers.some((n) => numberTaken(db, floorId, n))) return fail('duplicate_number');
  const row = Math.max(-1, ...db.stalls.filter((s) => s.floorId === floorId).map((s) => s.row)) + 1;
  numbers.forEach((number, col) => {
    db.stalls.push({ id: uid('st'), eventId: floor.eventId, floorId, number, typeId, row, col, isCorner: false, createdAt: now, updatedAt: now });
  });
  log(db, { at: now, kind: 'stall_added', actor: 'staff', eventId: floor.eventId, data: { stall: `${numbers[0]}–${numbers[numbers.length - 1]}` } });
  return { ok: true, added: count };
}

export function addStallToRow(db: DB, floorId: string, row: number, typeId: string, number: string, now = Date.now()): Result {
  const floor = db.floors.find((f) => f.id === floorId);
  if (!floor) return fail('not_found');
  if (!number.trim() || numberTaken(db, floorId, number)) return fail('duplicate_number');
  const col = Math.max(-1, ...db.stalls.filter((s) => s.floorId === floorId && s.row === row).map((s) => s.col)) + 1;
  db.stalls.push({ id: uid('st'), eventId: floor.eventId, floorId, number: number.trim(), typeId, row, col, isCorner: false, createdAt: now, updatedAt: now });
  log(db, { at: now, kind: 'stall_added', actor: 'staff', eventId: floor.eventId, data: { stall: number.trim() } });
  return { ok: true };
}

/** Add a stall to a floor plan. Placed near the top-left of the plan; staff then set its position. */
export function addPlanStall(db: DB, floorId: string, typeId: string, number: string, now = Date.now()): Result<{ stall: Stall }> {
  const floor = db.floors.find((f) => f.id === floorId);
  if (!floor?.plan) return fail('not_found');
  if (!number.trim() || numberTaken(db, floorId, number)) return fail('duplicate_number');
  const [vx, vy, vw] = floor.plan.viewBox;
  const w = Math.round(vw / 10);
  const stall: Stall = {
    id: uid('st'),
    eventId: floor.eventId,
    floorId,
    number: number.trim(),
    typeId,
    row: 0,
    col: 0,
    isCorner: false,
    pos: { x: vx + 10, y: vy + 10, w, h: Math.round(w * 0.7) },
    createdAt: now,
    updatedAt: now,
  };
  db.stalls.push(stall);
  log(db, { at: now, kind: 'stall_added', actor: 'staff', eventId: floor.eventId, stallId: stall.id, data: { stall: stallCode(db, stall) } });
  return { ok: true, stall };
}

export function updateStall(db: DB, stallId: string, patch: Partial<Pick<Stall, 'number' | 'typeId' | 'isCorner' | 'priceOverride' | 'row' | 'col' | 'pos'>>, now = Date.now()): Result {
  const s = db.stalls.find((x) => x.id === stallId);
  if (!s) return fail('not_found');
  if (patch.number !== undefined && (!patch.number.trim() || numberTaken(db, s.floorId, patch.number, s.id))) return fail('duplicate_number');
  Object.assign(s, patch, { updatedAt: now });
  if (patch.number) s.number = patch.number.trim();
  return { ok: true };
}

/** Swap a stall with its neighbour in the same row. */
export function moveStall(db: DB, stallId: string, dir: -1 | 1) {
  const s = db.stalls.find((x) => x.id === stallId);
  if (!s) return;
  const rowStalls = db.stalls.filter((x) => x.floorId === s.floorId && x.row === s.row).sort((a, b) => a.col - b.col);
  const i = rowStalls.findIndex((x) => x.id === stallId);
  const other = rowStalls[i + dir];
  if (!other) return;
  const c = s.col;
  s.col = other.col;
  other.col = c;
}

export function removeStall(db: DB, stallId: string, now = Date.now()): Result {
  const s = db.stalls.find((x) => x.id === stallId);
  if (!s) return fail('not_found');
  if (getActiveClaim(db, stallId, now)) return fail('taken');
  if (db.bookings.some((b) => b.stallId === stallId)) return fail('taken'); // keep history intact
  db.stalls = db.stalls.filter((x) => x.id !== stallId);
  db.holds = db.holds.filter((h) => h.stallId !== stallId);
  log(db, { at: now, kind: 'stall_removed', actor: 'staff', eventId: s.eventId, data: { stall: stallCode(db, s) } });
  return { ok: true };
}

// ---- Stall types

export function upsertStallType(db: DB, input: Omit<StallType, 'createdAt' | 'updatedAt' | 'id'> & { id?: string }, now = Date.now()) {
  if (input.id) {
    const t = db.stallTypes.find((x) => x.id === input.id);
    if (t) Object.assign(t, input, { updatedAt: now });
    return;
  }
  db.stallTypes.push({ ...input, id: uid('typ'), createdAt: now, updatedAt: now });
}

export function deleteStallType(db: DB, id: string): Result {
  if (db.stalls.some((s) => s.typeId === id)) return fail('has_claims');
  db.stallTypes = db.stallTypes.filter((t) => t.id !== id);
  return { ok: true };
}
