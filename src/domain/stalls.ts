// Write-side stall operations. Each function mutates a DB draft and is called
// inside a single synchronous store update, after re-reading the latest saved
// state, so two claims on one stall can never both succeed.
import type { Actor, Booking, DB, Hold } from '../data/types';
import { uid } from '../lib/id';
import { expireHolds } from './holds';
import { log } from './log';
import { quote } from './pricing';
import { fail, type Claim, type Result } from './result';
import { stallCode } from './stallcode';

export function getActiveClaim(db: DB, stallId: string, now = Date.now()): Claim | undefined {
  const b = db.bookings.find((x) => x.stallId === stallId && x.status === 'active');
  if (b) return { kind: 'booking', exhibitorId: b.exhibitorId };
  const h = db.holds.find((x) => x.stallId === stallId && x.status === 'active' && x.expiresAt > now);
  if (h) return { kind: 'hold', exhibitorId: h.exhibitorId, until: h.expiresAt };
  return undefined;
}

export interface HoldInput {
  stallId: string;
  exhibitorId: string;
  hours?: number;
  actor?: Actor;
}

export function holdStall(db: DB, input: HoldInput, now = Date.now()): Result<{ hold: Hold }> {
  expireHolds(db, now);
  const stall = db.stalls.find((s) => s.id === input.stallId);
  if (!stall || !db.exhibitors.some((e) => e.id === input.exhibitorId)) return fail('not_found');
  const event = db.events.find((e) => e.id === stall.eventId);
  if (!event || event.status === 'completed') return fail('event_closed');
  const claim = getActiveClaim(db, stall.id, now);
  if (claim) return fail(claim.exhibitorId === input.exhibitorId ? 'already_yours' : 'taken', claim);

  const hours = input.hours ?? event.holdHours ?? db.settings.defaultHoldHours;
  const hold: Hold = {
    id: uid('hold'),
    stallId: stall.id,
    eventId: stall.eventId,
    exhibitorId: input.exhibitorId,
    expiresAt: now + hours * 3600_000,
    status: 'active',
    source: input.actor ?? 'staff',
    createdAt: now,
    updatedAt: now,
  };
  db.holds.push(hold);
  log(db, {
    at: now,
    kind: 'hold_created',
    actor: hold.source,
    exhibitorId: hold.exhibitorId,
    eventId: hold.eventId,
    stallId: stall.id,
    data: { stall: stallCode(db, stall), until: hold.expiresAt },
  });
  return { ok: true, hold };
}

export function extendHold(db: DB, stallId: string, hours: number, now = Date.now()): Result {
  expireHolds(db, now);
  const h = db.holds.find((x) => x.stallId === stallId && x.status === 'active');
  if (!h) return fail('not_held');
  h.expiresAt = Math.max(h.expiresAt, now) + hours * 3600_000;
  h.updatedAt = now;
  const stall = db.stalls.find((s) => s.id === stallId);
  log(db, { at: now, kind: 'hold_extended', actor: 'staff', exhibitorId: h.exhibitorId, eventId: h.eventId, stallId, data: { stall: stallCode(db, stall), until: h.expiresAt } });
  return { ok: true };
}

export interface ConfirmInput {
  stallId: string;
  exhibitorId: string;
  partners?: number;
  partnerName?: string;
  discount?: number;
  discountReason?: string;
  actor?: Actor;
}

/** Confirm a booking. Converts the exhibitor's own hold; blocked if anyone else has the stall. */
export function confirmBooking(db: DB, input: ConfirmInput, now = Date.now()): Result<{ booking: Booking }> {
  expireHolds(db, now);
  const stall = db.stalls.find((s) => s.id === input.stallId);
  if (!stall || !db.exhibitors.some((e) => e.id === input.exhibitorId)) return fail('not_found');
  const event = db.events.find((e) => e.id === stall.eventId);
  if (!event || event.status === 'completed') return fail('event_closed');
  const claim = getActiveClaim(db, stall.id, now);
  if (claim && (claim.kind === 'booking' || claim.exhibitorId !== input.exhibitorId)) {
    return fail(claim.exhibitorId === input.exhibitorId ? 'already_yours' : 'taken', claim);
  }
  const hold = db.holds.find((h) => h.stallId === stall.id && h.status === 'active');
  if (hold) {
    hold.status = 'converted';
    hold.updatedAt = now;
  }
  const q = quote(db, stall, { partners: input.partners, discount: input.discount });
  const booking: Booking = {
    id: uid('bk'),
    stallId: stall.id,
    eventId: stall.eventId,
    exhibitorId: input.exhibitorId,
    holdId: hold?.id,
    ...q,
    partners: Math.max(1, input.partners ?? 1),
    partnerName: input.partnerName?.trim() || undefined,
    discountReason: q.discount > 0 ? input.discountReason?.trim() || undefined : undefined,
    status: 'active',
    source: input.actor ?? 'staff',
    createdAt: now,
    updatedAt: now,
  };
  db.bookings.push(booking);
  log(db, {
    at: now,
    kind: 'booking_confirmed',
    actor: booking.source,
    exhibitorId: booking.exhibitorId,
    eventId: booking.eventId,
    stallId: stall.id,
    data: { stall: stallCode(db, stall), total: booking.total },
  });
  return { ok: true, booking };
}

export interface BookingEdit {
  partners?: number;
  partnerName?: string;
  discount?: number;
  discountReason?: string;
}

export function updateBooking(db: DB, bookingId: string, edit: BookingEdit, now = Date.now()): Result {
  const b = db.bookings.find((x) => x.id === bookingId && x.status === 'active');
  const stall = b && db.stalls.find((s) => s.id === b.stallId);
  if (!b || !stall) return fail('no_booking');
  const partners = edit.partners ?? b.partners;
  const q = quote(db, stall, { partners, discount: edit.discount ?? b.discount });
  Object.assign(b, q, {
    partners,
    partnerName: (edit.partnerName ?? b.partnerName)?.trim() || undefined,
    discountReason: q.discount > 0 ? (edit.discountReason ?? b.discountReason)?.trim() || undefined : undefined,
    updatedAt: now,
  });
  log(db, { at: now, kind: 'booking_updated', actor: 'staff', exhibitorId: b.exhibitorId, eventId: b.eventId, stallId: stall.id, data: { stall: stallCode(db, stall), total: b.total } });
  return { ok: true };
}

/** Release a hold or cancel a booking. Payments already recorded stay on the cancelled booking. */
export function releaseStall(db: DB, stallId: string, now = Date.now()): Result {
  expireHolds(db, now);
  const stall = db.stalls.find((s) => s.id === stallId);
  if (!stall) return fail('not_found');
  const booking = db.bookings.find((b) => b.stallId === stallId && b.status === 'active');
  if (booking) {
    booking.status = 'cancelled';
    booking.updatedAt = now;
    log(db, { at: now, kind: 'booking_cancelled', actor: 'staff', exhibitorId: booking.exhibitorId, eventId: booking.eventId, stallId, data: { stall: stallCode(db, stall) } });
    return { ok: true };
  }
  const hold = db.holds.find((h) => h.stallId === stallId && h.status === 'active');
  if (hold) {
    hold.status = 'released';
    hold.updatedAt = now;
    log(db, { at: now, kind: 'hold_released', actor: 'staff', exhibitorId: hold.exhibitorId, eventId: hold.eventId, stallId, data: { stall: stallCode(db, stall) } });
    return { ok: true };
  }
  return fail('not_held');
}
