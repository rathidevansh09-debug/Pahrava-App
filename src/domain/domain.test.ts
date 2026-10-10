import { describe, expect, it } from 'vitest';
import { createSeed } from '../data/seed';
import type { DB, Stall } from '../data/types';
import { applyImport, buildImport, guessMapping, parseCsv } from './csv';
import { eventSummary, invalidateIndex, stallState as rawState } from './derive';

const stallState: typeof rawState = (db, id, now) => {
  invalidateIndex(db);
  return rawState(db, id, now);
};
import { resolveAudience, renderMessage, sendBroadcast } from './broadcast';
import { createExhibitor, deleteExhibitor } from './exhibitors';
import { money } from './format';
import { expireHolds } from './holds';
import { recordPayment } from './payments';
import { isValidIndianMobile, normalizePhone } from './phone';
import { quote } from './pricing';
import { confirmBooking, holdStall, releaseStall } from './stalls';

const NOW = new Date('2026-10-10T10:00:00').getTime();
const fresh = (): DB => structuredClone(createSeed(NOW));
const upcoming = (db: DB, city: string) => db.events.find((e) => e.status === 'booking_open' && db.venues.find((v) => v.id === e.venueId)!.city === city)!;
const freeStall = (db: DB, eventId: string): Stall => db.stalls.find((s) => s.eventId === eventId && stallState(db, s.id, NOW).status === 'available')!;

describe('seed', () => {
  it('has 2 upcoming events laid out from the architect plans, with every status', () => {
    const db = fresh();
    const open = db.events.filter((e) => e.status === 'booking_open');
    expect(open).toHaveLength(2);
    expect(db.exhibitors).toHaveLength(40);
    for (const ev of open) {
      const s = eventSummary(db, ev.id, NOW);
      expect(s.total).toBe(ev.name.includes('Nashik') ? 48 + 30 : 26 + 37 + 4);
      for (const k of Object.keys(s.counts) as (keyof typeof s.counts)[]) expect(s.counts[k]).toBeGreaterThan(0);
    }
    // Plan floors: every plan stall has a position; numbers repeat across floors but not within one.
    for (const f of db.floors.filter((x) => x.plan)) {
      const nums = db.stalls.filter((s) => s.floorId === f.id).map((s) => s.number);
      expect(new Set(nums).size).toBe(nums.length);
      expect(db.stalls.filter((s) => s.floorId === f.id).every((s) => s.pos)).toBe(true);
    }
    const soon = db.holds.filter((h) => h.status === 'active' && h.expiresAt - NOW < 3 * 3600_000);
    expect(soon).toHaveLength(2);
  });
});

describe('holds and double-booking', () => {
  it('blocks a second exhibitor from holding or booking a held stall and returns the holder', () => {
    const db = fresh();
    const ev = upcoming(db, 'Nashik');
    const s = freeStall(db, ev.id);
    const [a, b] = db.exhibitors;
    expect(holdStall(db, { stallId: s.id, exhibitorId: a.id }, NOW).ok).toBe(true);
    const r = holdStall(db, { stallId: s.id, exhibitorId: b.id }, NOW);
    expect(r).toMatchObject({ ok: false, error: 'taken', claim: { kind: 'hold', exhibitorId: a.id } });
    expect(confirmBooking(db, { stallId: s.id, exhibitorId: b.id }, NOW)).toMatchObject({ ok: false, error: 'taken' });
    // Holder can confirm; then nobody else can hold.
    expect(confirmBooking(db, { stallId: s.id, exhibitorId: a.id }, NOW).ok).toBe(true);
    expect(holdStall(db, { stallId: s.id, exhibitorId: b.id }, NOW)).toMatchObject({ ok: false, claim: { kind: 'booking' } });
    expect(db.bookings.filter((x) => x.stallId === s.id && x.status === 'active')).toHaveLength(1);
  });

  it('expires holds back to available and logs it', () => {
    const db = fresh();
    const ev = upcoming(db, 'Malegaon');
    const s = freeStall(db, ev.id);
    holdStall(db, { stallId: s.id, exhibitorId: db.exhibitors[0].id, hours: 1 }, NOW);
    expect(stallState(db, s.id, NOW).status).toBe('on_hold');
    const later = NOW + 3600_000 + 1;
    expect(stallState(db, s.id, later).status).toBe('available');
    const before = db.activity.length;
    expect(expireHolds(db, later)).toBeGreaterThanOrEqual(1);
    expect(db.activity.slice(before).some((a) => a.kind === 'hold_expired' && a.stallId === s.id)).toBe(true);
    // A new exhibitor can now take it.
    expect(holdStall(db, { stallId: s.id, exhibitorId: db.exhibitors[1].id }, later).ok).toBe(true);
  });

  it('release frees the stall', () => {
    const db = fresh();
    const s = freeStall(db, upcoming(db, 'Nashik').id);
    holdStall(db, { stallId: s.id, exhibitorId: db.exhibitors[0].id }, NOW);
    expect(releaseStall(db, s.id, NOW).ok).toBe(true);
    expect(stallState(db, s.id, NOW).status).toBe('available');
  });
});

describe('pricing and payments', () => {
  it('applies corner, partnership and discount', () => {
    const db = fresh();
    const mal = upcoming(db, 'Malegaon');
    const corner = db.stalls.find((s) => s.eventId === mal.id && s.isCorner)!;
    const type = db.stallTypes.find((t) => t.id === corner.typeId)!;
    expect(quote(db, corner).total).toBe(type.basePrice + 500);
    const nsk = upcoming(db, 'Nashik');
    const main = db.floors.find((f) => f.eventId === nsk.id && f.plan)!;
    const s = db.stalls.find((x) => x.floorId === main.id && x.number === '31')!; // Red premium on the plan
    expect(quote(db, s, { partners: 2, discount: 1000 })).toMatchObject({ basePrice: 16000, partnerAmt: 1000, discount: 1000, total: 16000 });
  });

  it('moves booked → partly paid → fully paid and blocks overpayment', () => {
    const db = fresh();
    const s = freeStall(db, upcoming(db, 'Nashik').id);
    const ex = db.exhibitors[2];
    const r = confirmBooking(db, { stallId: s.id, exhibitorId: ex.id }, NOW);
    if (!r.ok) throw new Error();
    const total = r.booking.total;
    expect(stallState(db, s.id, NOW).status).toBe('booked_unpaid');
    expect(recordPayment(db, { bookingId: r.booking.id, amount: 1000, mode: 'upi' }, NOW).ok).toBe(true);
    expect(stallState(db, s.id, NOW).status).toBe('partly_paid');
    expect(recordPayment(db, { bookingId: r.booking.id, amount: total, mode: 'cash' }, NOW)).toMatchObject({ ok: false, error: 'exceeds_due' });
    expect(recordPayment(db, { bookingId: r.booking.id, amount: total - 1000, mode: 'cash' }, NOW).ok).toBe(true);
    expect(stallState(db, s.id, NOW).status).toBe('fully_paid');
    expect(db.activity.filter((a) => a.exhibitorId === ex.id && a.kind === 'payment_recorded').length).toBeGreaterThanOrEqual(2);
  });
});

describe('broadcasts', () => {
  it('excludes non-consented contacts and renders each recipient in their language', () => {
    const db = fresh();
    const aud = resolveAudience(db, { categories: [], tags: [], languages: [] });
    expect(aud.excludedNoConsent.length).toBeGreaterThan(0);
    expect(aud.included.every((e) => e.consent)).toBe(true);
    const tpl = db.templates.find((t) => t.key === 'new_event')!;
    const ev = upcoming(db, 'Nashik');
    const mr = aud.included.find((e) => e.language === 'mr')!;
    const hi = aud.included.find((e) => e.language === 'hi')!;
    expect(renderMessage(db, tpl, mr, ev.id).text).toContain('नमस्कार');
    expect(renderMessage(db, tpl, hi, ev.id).text).toContain('नमस्ते');
    expect(renderMessage(db, tpl, mr, ev.id).text).toContain(money(5000)); // cheapest Nashik stall
    const bc = sendBroadcast(db, { templateId: tpl.id, eventId: ev.id, filters: { categories: [], tags: [], languages: [] } }, NOW);
    expect(bc.recipientIds).toHaveLength(aud.included.length);
    expect(bc.countsByLang.en + bc.countsByLang.mr + bc.countsByLang.hi).toBe(aud.included.length);
  });
});

describe('exhibitors, phone & CSV', () => {
  it('validates Indian mobile numbers', () => {
    expect(isValidIndianMobile('+91 98765-43210')).toBe(true);
    expect(normalizePhone('09876543210')).toBe('9876543210');
    expect(isValidIndianMobile('12345')).toBe(false);
    expect(isValidIndianMobile('5876543210')).toBe(false);
  });

  it('rejects duplicate phone and blocks deleting exhibitors with active stalls', () => {
    const db = fresh();
    const base = { ownerName: 'Test', businessName: 'T', category: 'food', language: 'en', city: 'Nashik', tags: [], source: 'call', consent: false, notes: '' } as const;
    expect(createExhibitor(db, { ...base, tags: [], phone: db.exhibitors[0].phone }, NOW)).toMatchObject({ ok: false, error: 'duplicate_phone' });
    expect(createExhibitor(db, { ...base, tags: [], phone: '9123456780' }, NOW).ok).toBe(true);
    const holder = db.bookings.find((b) => b.status === 'active' && db.events.find((e) => e.id === b.eventId)!.status === 'booking_open')!.exhibitorId;
    expect(deleteExhibitor(db, holder, NOW)).toMatchObject({ ok: false, error: 'has_claims' });
  });

  it('maps columns and merges or skips duplicates by phone', () => {
    const db = fresh();
    const existing = db.exhibitors[0];
    const csv = `Name,Business Name,Mobile,City,Tags,Consent\nNew Person,New Biz,98220 11111,Pune,VIP,yes\nDup,Dup Biz,+91${existing.phone},Nashik,VIP,no\nBad,Bad,123,Pune,,no`;
    const { headers, rows } = parseCsv(csv);
    const m = guessMapping(headers);
    expect(m).toMatchObject({ ownerName: 'Name', businessName: 'Business Name', phone: 'Mobile' });
    const plan = buildImport(db, rows, m);
    expect(plan[1].duplicateOf).toBe(existing.id);
    expect(plan[2].error).toBe('invalid_phone');
    const skip = structuredClone(db);
    expect(applyImport(skip, buildImport(skip, rows, m), 'skip', NOW)).toEqual({ added: 1, merged: 0, skipped: 2 });
    expect(applyImport(db, plan, 'merge', NOW)).toEqual({ added: 1, merged: 1, skipped: 1 });
    expect(db.exhibitors.find((e) => e.id === existing.id)!.tags).toContain('VIP');
  });
});

describe('stall codes', () => {
  it('prefixes floor codes where numbers repeat (Malegaon AC vs Outside)', async () => {
    const { stallCode } = await import('./stallcode');
    const db = fresh();
    const mal = upcoming(db, 'Malegaon');
    const ac = db.floors.find((f) => f.eventId === mal.id && f.name === 'AC Hall')!;
    const out = db.floors.find((f) => f.eventId === mal.id && f.name === 'Outside')!;
    const a5 = db.stalls.find((s) => s.floorId === ac.id && s.number === '5')!;
    const o5 = db.stalls.find((s) => s.floorId === out.id && s.number === '5')!;
    expect(stallCode(db, a5)).toBe('AC-5');
    expect(stallCode(db, o5)).toBe('O-5');
    // Outside 29–37 are food stalls at ₹3,000
    const o30 = db.stalls.find((s) => s.floorId === out.id && s.number === '30')!;
    expect(db.stallTypes.find((t) => t.id === o30.typeId)!.basePrice).toBe(3000);
  });
});
