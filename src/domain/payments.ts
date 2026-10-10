import type { Actor, DB, PayMode, Payment } from '../data/types';
import { uid } from '../lib/id';
import { toISODate } from './format';
import { log } from './log';
import { fail, type Result } from './result';
import { stallCode } from './stallcode';

export interface PaymentInput {
  bookingId: string;
  amount: number;
  date?: string;
  mode: PayMode;
  ref?: string;
  note?: string;
  actor?: Actor;
}

export function recordPayment(db: DB, input: PaymentInput, now = Date.now()): Result<{ payment: Payment; due: number }> {
  const b = db.bookings.find((x) => x.id === input.bookingId && x.status === 'active');
  if (!b) return fail('no_booking');
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return fail('invalid_amount');
  const paid = db.payments.filter((p) => p.bookingId === b.id).reduce((s, p) => s + p.amount, 0);
  const due = b.total - paid;
  if (amount > due) return fail('exceeds_due');
  const payment: Payment = {
    id: uid('pay'),
    bookingId: b.id,
    amount,
    date: input.date || toISODate(new Date(now)),
    mode: input.mode,
    ref: input.ref?.trim() || undefined,
    note: input.note?.trim() || undefined,
    source: input.actor ?? 'staff',
    createdAt: now,
    updatedAt: now,
  };
  db.payments.push(payment);
  const stall = db.stalls.find((s) => s.id === b.stallId);
  log(db, {
    at: now,
    kind: 'payment_recorded',
    actor: payment.source,
    exhibitorId: b.exhibitorId,
    eventId: b.eventId,
    stallId: b.stallId,
    data: { stall: stallCode(db, stall), amount, mode: input.mode, due: due - amount },
  });
  return { ok: true, payment, due: due - amount };
}

/**
 * Placeholder payment link. A real integration would call the gateway here
 * (e.g. Razorpay Payment Links API: POST /v1/payment_links with amount, customer
 * phone and a callback URL) and store the returned id on the booking; a webhook
 * would then call recordPayment().
 */
export function createPaymentLink(db: DB, opts: { bookingId?: string; stallId: string; exhibitorId: string; amount: number }, now = Date.now()) {
  const linkId = `plink_${now.toString(36)}`;
  const url = `https://pay.example.in/pahrava/${linkId}`;
  if (opts.bookingId) {
    const b = db.bookings.find((x) => x.id === opts.bookingId);
    if (b) b.paymentLinkId = linkId;
  }
  const stall = db.stalls.find((s) => s.id === opts.stallId);
  log(db, { at: now, kind: 'payment_link', actor: 'staff', exhibitorId: opts.exhibitorId, eventId: stall?.eventId, stallId: opts.stallId, data: { stall: stallCode(db, stall), amount: opts.amount, url } });
  return url;
}
