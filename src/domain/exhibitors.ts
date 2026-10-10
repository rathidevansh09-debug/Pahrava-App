import type { CallLog, CallOutcome, DB, Exhibitor } from '../data/types';
import { uid } from '../lib/id';
import { toISODate } from './format';
import { log } from './log';
import { isValidIndianMobile, normalizePhone } from './phone';
import { fail, type Result } from './result';

export type ExhibitorInput = Omit<Exhibitor, 'id' | 'createdAt' | 'updatedAt'>;

export function findByPhone(db: DB, phone: string, exceptId?: string) {
  const p = normalizePhone(phone);
  return db.exhibitors.find((e) => e.id !== exceptId && (e.phone === p || e.altPhone === p));
}

function clean(input: ExhibitorInput, now: number): ExhibitorInput {
  return {
    ...input,
    ownerName: input.ownerName.trim(),
    businessName: input.businessName.trim(),
    phone: normalizePhone(input.phone),
    altPhone: input.altPhone ? normalizePhone(input.altPhone) : undefined,
    city: input.city.trim(),
    notes: input.notes ?? '',
    consentDate: input.consent ? input.consentDate || toISODate(new Date(now)) : undefined,
  };
}

export function createExhibitor(db: DB, input: ExhibitorInput, now = Date.now()): Result<{ exhibitor: Exhibitor }> {
  if (!isValidIndianMobile(input.phone) || (input.altPhone && !isValidIndianMobile(input.altPhone))) return fail('invalid_phone');
  if (findByPhone(db, input.phone)) return fail('duplicate_phone');
  const exhibitor: Exhibitor = { id: uid('ex'), ...clean(input, now), createdAt: now, updatedAt: now };
  db.exhibitors.push(exhibitor);
  log(db, { at: now, kind: 'exhibitor_created', actor: 'staff', exhibitorId: exhibitor.id, data: { source: exhibitor.source } });
  return { ok: true, exhibitor };
}

export function updateExhibitor(db: DB, id: string, input: ExhibitorInput, now = Date.now()): Result {
  const ex = db.exhibitors.find((e) => e.id === id);
  if (!ex) return fail('not_found');
  if (!isValidIndianMobile(input.phone) || (input.altPhone && !isValidIndianMobile(input.altPhone))) return fail('invalid_phone');
  if (findByPhone(db, input.phone, id)) return fail('duplicate_phone');
  Object.assign(ex, clean(input, now), { updatedAt: now });
  log(db, { at: now, kind: 'exhibitor_updated', actor: 'staff', exhibitorId: id, data: {} });
  return { ok: true };
}

/** Blocked while the exhibitor holds or has booked a stall, so nothing is orphaned. */
export function deleteExhibitor(db: DB, id: string, now = Date.now()): Result {
  const active =
    db.bookings.some((b) => b.exhibitorId === id && b.status === 'active') ||
    db.holds.some((h) => h.exhibitorId === id && h.status === 'active' && h.expiresAt > now);
  if (active) return fail('has_claims');
  db.exhibitors = db.exhibitors.filter((e) => e.id !== id);
  db.callLogs = db.callLogs.filter((c) => c.exhibitorId !== id);
  return { ok: true };
}

export interface CallInput {
  exhibitorId: string;
  eventId?: string;
  outcome: CallOutcome;
  callbackDate?: string;
  note: string;
}

export function logCall(db: DB, input: CallInput, now = Date.now()): Result<{ call: CallLog }> {
  if (!db.exhibitors.some((e) => e.id === input.exhibitorId)) return fail('not_found');
  const call: CallLog = {
    id: uid('call'),
    ...input,
    callbackDate: input.outcome === 'call_back' ? input.callbackDate : undefined,
    note: input.note.trim(),
    done: input.outcome !== 'call_back',
    createdAt: now,
    updatedAt: now,
  };
  // A new call closes any open call-backs for this exhibitor.
  for (const c of db.callLogs) if (c.exhibitorId === input.exhibitorId && !c.done) c.done = true;
  db.callLogs.push(call);
  log(db, { at: now, kind: 'call_logged', actor: 'staff', exhibitorId: input.exhibitorId, eventId: input.eventId, data: { outcome: input.outcome, callback: call.callbackDate, note: call.note } });
  return { ok: true, call };
}

export function setCallDone(db: DB, callId: string, done: boolean) {
  const c = db.callLogs.find((x) => x.id === callId);
  if (c) c.done = done;
}
