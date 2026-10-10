// Read-side helpers. Stall status is always derived from holds, bookings and
// payments, never stored, so the map, ledger and dashboards can't disagree.
import type { Booking, DB, Exhibitor, Hold, Stall, StallStatus, StallType } from '../data/types';
import { stallCode } from './stallcode';

export interface Index {
  stallById: Map<string, Stall>;
  typeById: Map<string, StallType>;
  exhibitorById: Map<string, Exhibitor>;
  activeHoldByStall: Map<string, Hold>;
  activeBookingByStall: Map<string, Booking>;
  paidByBooking: Map<string, number>;
}

const cache = new WeakMap<DB, Index>();

export function indexDB(db: DB): Index {
  const hit = cache.get(db);
  if (hit) return hit;
  const idx: Index = {
    stallById: new Map(db.stalls.map((s) => [s.id, s])),
    typeById: new Map(db.stallTypes.map((t) => [t.id, t])),
    exhibitorById: new Map(db.exhibitors.map((e) => [e.id, e])),
    activeHoldByStall: new Map(),
    activeBookingByStall: new Map(),
    paidByBooking: new Map(),
  };
  for (const h of db.holds) if (h.status === 'active') idx.activeHoldByStall.set(h.stallId, h);
  for (const b of db.bookings) if (b.status === 'active') idx.activeBookingByStall.set(b.stallId, b);
  for (const p of db.payments) idx.paidByBooking.set(p.bookingId, (idx.paidByBooking.get(p.bookingId) ?? 0) + p.amount);
  cache.set(db, idx);
  return idx;
}

export function bookingStatus(total: number, paid: number): Exclude<StallStatus, 'available' | 'on_hold'> {
  if (paid <= 0) return 'booked_unpaid';
  if (paid < total) return 'partly_paid';
  return 'fully_paid';
}

export interface StallState {
  status: StallStatus;
  hold?: Hold;
  booking?: Booking;
  exhibitor?: Exhibitor;
  paid: number;
  due: number;
}

/**
 * Holds are treated as expired the moment `expiresAt` passes, even before the
 * background sweep writes the expiry to the log, so the map is never stale.
 */
export function stallState(db: DB, stallId: string, now = Date.now()): StallState {
  const idx = indexDB(db);
  const booking = idx.activeBookingByStall.get(stallId);
  if (booking) {
    const paid = idx.paidByBooking.get(booking.id) ?? 0;
    return {
      status: bookingStatus(booking.total, paid),
      booking,
      exhibitor: idx.exhibitorById.get(booking.exhibitorId),
      paid,
      due: Math.max(0, booking.total - paid),
    };
  }
  const hold = idx.activeHoldByStall.get(stallId);
  if (hold && hold.expiresAt > now) {
    return { status: 'on_hold', hold, exhibitor: idx.exhibitorById.get(hold.exhibitorId), paid: 0, due: 0 };
  }
  return { status: 'available', paid: 0, due: 0 };
}

export function paidFor(db: DB, bookingId: string) {
  return indexDB(db).paidByBooking.get(bookingId) ?? 0;
}

export function eventStalls(db: DB, eventId: string) {
  return db.stalls.filter((s) => s.eventId === eventId);
}

export interface EventSummary {
  total: number;
  counts: Record<StallStatus, number>;
  expected: number;
  collected: number;
  outstanding: number;
}

export function eventSummary(db: DB, eventId: string, now = Date.now()): EventSummary {
  const counts: Record<StallStatus, number> = { available: 0, on_hold: 0, booked_unpaid: 0, partly_paid: 0, fully_paid: 0 };
  let expected = 0;
  let collected = 0;
  const stalls = eventStalls(db, eventId);
  for (const s of stalls) {
    const st = stallState(db, s.id, now);
    counts[st.status]++;
    if (st.booking) {
      expected += st.booking.total;
      collected += st.paid;
    }
  }
  return { total: stalls.length, counts, expected, collected, outstanding: expected - collected };
}

export function exhibitorBookings(db: DB, exhibitorId: string) {
  return db.bookings.filter((b) => b.exhibitorId === exhibitorId);
}

export function exhibitorTotals(db: DB, exhibitorId: string) {
  let paid = 0;
  let outstanding = 0;
  for (const b of exhibitorBookings(db, exhibitorId)) {
    const p = paidFor(db, b.id);
    paid += p;
    if (b.status === 'active') outstanding += Math.max(0, b.total - p);
  }
  return { paid, outstanding };
}

export function stallLabel(db: DB, stallId: string) {
  const idx = indexDB(db);
  const s = idx.stallById.get(stallId);
  if (!s) return '—';
  const t = idx.typeById.get(s.typeId);
  return t ? `#${stallCode(db, s)} · ${t.name}` : `#${stallCode(db, s)}`;
}

/** For code that mutates a DB in place (tests); the app always replaces the DB object. */
export function invalidateIndex(db: DB) {
  cache.delete(db);
}
