// PAHRAVA WhatsApp server (Firebase Functions, Mumbai region).
//
//  whatsapp            Meta webhook: incoming chats (booking bot) + delivery/template status
//  waSendBroadcast     app → send a broadcast with an approved template
//  waSendTemplate      app → send one template (booking confirmation, payment reminder…)
//  waSyncTemplates     app → submit templates to Meta for approval, refresh status
//  waStatus            app → is WhatsApp connected? which number?
//  waHoldSweep         every 30 min: expire holds, remind holds expiring within 6 h
//  waPaymentReminders  daily 10:00 IST: remind balances due before the event
process.env.TZ = 'Asia/Kolkata'; // dates in messages are Indian time

import { createHmac, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import type { BroadcastFilters } from '../../src/data/types';
import { paidFor } from '../../src/domain/derive';
import { sendBroadcast } from '../../src/domain/broadcast';
import { expireHolds } from '../../src/domain/holds';
import { daysUntil } from '../../src/domain/format';
import { handleInbound, type Inbound } from './bot';
import { graph, type WaConfig } from './graph';
import { fs, readDB, serverExec, WA_COLLECTION } from './store';
import { deliver, logSent, prepare, setTemplateStatus, syncTemplates } from './templates';

initializeApp();
getFirestore().settings({ ignoreUndefinedProperties: true });
setGlobalOptions({ region: 'asia-south1', maxInstances: 5 });

const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');
const WHATSAPP_APP_SECRET = defineSecret('WHATSAPP_APP_SECRET');
const WHATSAPP_VERIFY_TOKEN = defineSecret('WHATSAPP_VERIFY_TOKEN');
const PHONE_NUMBER_ID = defineString('WHATSAPP_PHONE_NUMBER_ID');
const WABA_ID = defineString('WHATSAPP_WABA_ID');
/** Comma-separated staff emails allowed to send. "*" also allows guest (no-login) users — test phase only. */
const SENDERS = defineString('WHATSAPP_SENDERS', { default: '' });

const secrets = [WHATSAPP_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN];
const cfg = (): WaConfig => ({ token: WHATSAPP_TOKEN.value(), phoneNumberId: PHONE_NUMBER_ID.value(), wabaId: WABA_ID.value() });

function requireSender(req: CallableRequest) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const allowed = SENDERS.value()
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = String(req.auth.token.email ?? '').toLowerCase();
  if (allowed.includes('*') || (email && allowed.includes(email))) return;
  throw new HttpsError('permission-denied', 'This account is not allowed to send WhatsApp messages');
}

// ---------- Webhook

function validSignature(raw: Buffer, header: string | undefined, secret: string) {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

async function onStatus(st: { id: string; status: string; errors?: { title?: string }[] }) {
  const ref = fs().collection(WA_COLLECTION).doc(`msg_${st.id}`);
  const prev = await fs().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data() as { status: string; broadcastId: string | null };
    if ((RANK[st.status] ?? 0) <= (RANK[d.status] ?? 0)) return null;
    tx.update(ref, { status: st.status, error: st.errors?.[0]?.title ?? null, updatedAt: FieldValue.serverTimestamp() });
    return d;
  });
  if (!prev?.broadcastId) return;
  // Move the message from its previous bucket to the new one on the broadcast.
  await serverExec((d) => {
    const b = d.broadcasts.find((x) => x.id === prev.broadcastId);
    if (!b) return;
    const del = (b.delivery ??= { sent: 0, delivered: 0, read: 0, failed: 0 });
    const from = prev.status as keyof typeof del;
    const to = st.status as keyof typeof del;
    if (from in del && del[from] > 0) del[from]--;
    if (to in del) del[to]++;
  });
}

export const whatsapp = onRequest({ secrets, invoker: 'public' }, async (req, res) => {
  if (req.method === 'GET') {
    // Meta's one-time webhook verification
    const ok = req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === WHATSAPP_VERIFY_TOKEN.value();
    res.status(ok ? 200 : 403).send(ok ? String(req.query['hub.challenge'] ?? '') : 'Forbidden');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  if (!validSignature(req.rawBody, req.get('x-hub-signature-256'), WHATSAPP_APP_SECRET.value())) {
    logger.warn('Webhook with a bad signature ignored');
    res.status(401).send('Bad signature');
    return;
  }
  type Change = {
    field: string;
    value: {
      contacts?: { wa_id: string; profile?: { name?: string } }[];
      messages?: { id: string; from: string; type: string; text?: { body: string }; button?: { text: string; payload?: string }; interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } } }[];
      statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
      event?: string;
      message_template_name?: string;
      message_template_language?: string;
    };
  };
  const body = req.body as { entry?: { changes?: Change[] }[] };
  try {
    for (const entry of body.entry ?? [])
      for (const ch of entry.changes ?? []) {
        const v = ch.value;
        if (ch.field === 'message_template_status_update' && v.message_template_name && v.message_template_language && v.event) {
          await setTemplateStatus(v.message_template_name, v.message_template_language, v.event);
          continue;
        }
        for (const st of v.statuses ?? []) await onStatus(st);
        for (const msg of v.messages ?? []) {
          const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
          const inbound: Inbound = {
            id: msg.id,
            from: msg.from,
            name: v.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name,
            text: msg.text?.body ?? reply?.title ?? msg.button?.text,
            replyId: reply?.id ?? msg.button?.payload,
          };
          await handleInbound(cfg(), inbound);
        }
      }
  } catch (e) {
    logger.error('Webhook handling failed', e);
  }
  res.status(200).send('OK'); // always 200, or Meta retries the same event
});

// ---------- Called from the app

export const waStatus = onCall({ secrets }, async (req) => {
  requireSender(req);
  const n = await graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(cfg(), 'GET', `${PHONE_NUMBER_ID.value()}?fields=display_phone_number,verified_name,quality_rating`);
  return { number: n.display_phone_number, name: n.verified_name, quality: n.quality_rating };
});

export const waSyncTemplates = onCall({ secrets, timeoutSeconds: 120 }, async (req) => {
  requireSender(req);
  return syncTemplates(cfg(), await readDB());
});

export const waSendBroadcast = onCall({ secrets, timeoutSeconds: 540 }, async (req: CallableRequest<{ templateId: string; eventId?: string; filters: BroadcastFilters }>) => {
  requireSender(req);
  const { templateId, eventId, filters } = req.data;
  // Record the broadcast (and timeline entries) and build each message from the same snapshot.
  const plan = await serverExec((d, now) => {
    const t = d.templates.find((x) => x.id === templateId);
    if (!t) throw new HttpsError('not-found', 'Template not found');
    const b = sendBroadcast(d, { templateId, eventId, filters }, now);
    const out = b.recipientIds.map((id) => d.exhibitors.find((e) => e.id === id)!).map((ex) => ({ ex, msg: prepare(d, t, ex, eventId) }));
    b.delivery = { sent: 0, delivered: 0, read: 0, failed: 0 };
    return { broadcastId: b.id, ready: out.filter((o) => o.msg).map((o) => o.msg!), noTemplate: out.filter((o) => !o.msg).length };
  });
  const r = await deliver(cfg(), plan.ready, { broadcastId: plan.broadcastId, eventId, kind: 'broadcast' });
  await serverExec((d) => {
    const b = d.broadcasts.find((x) => x.id === plan.broadcastId);
    if (b?.delivery) {
      b.delivery.sent += r.sent;
      b.delivery.failed += r.failed.length + plan.noTemplate;
    }
  });
  return { broadcastId: plan.broadcastId, sent: r.sent, failed: r.failed.length, noTemplate: plan.noTemplate, errors: r.failed.slice(0, 5).map((f) => f.error) };
});

export const waSendTemplate = onCall({ secrets }, async (req: CallableRequest<{ templateKey: string; exhibitorId: string; eventId?: string }>) => {
  requireSender(req);
  const db = await readDB();
  const t = db.templates.find((x) => x.key === req.data.templateKey);
  const ex = db.exhibitors.find((e) => e.id === req.data.exhibitorId);
  if (!t || !ex) throw new HttpsError('not-found', 'Template or exhibitor not found');
  const msg = prepare(db, t, ex, req.data.eventId);
  if (!msg) throw new HttpsError('failed-precondition', 'This template is not approved by WhatsApp yet');
  const r = await deliver(cfg(), [msg], { eventId: req.data.eventId, kind: String(t.key) });
  if (r.failed.length) throw new HttpsError('internal', r.failed[0].error);
  await logSent([msg], req.data.eventId, new Set());
  return { sent: 1 };
});

// ---------- Scheduled

/** Send a template once per key (reminder docs in pahrava_wa). */
async function remindOnce(key: string, run: () => Promise<boolean>) {
  const ref = fs().collection(WA_COLLECTION).doc(`remind_${key}`);
  if ((await ref.get()).exists) return;
  if (await run()) await ref.set({ at: FieldValue.serverTimestamp() });
}

export const waHoldSweep = onSchedule({ schedule: 'every 30 minutes', timeZone: 'Asia/Kolkata', secrets }, async () => {
  const now = Date.now();
  const db = await readDB();
  if (db.holds.some((h) => h.status === 'active' && h.expiresAt <= now)) await serverExec((d, n) => expireHolds(d, n));
  const t = db.templates.find((x) => x.key === 'hold_expiring');
  if (!t) return;
  const soon = db.holds.filter((h) => h.status === 'active' && h.expiresAt > now && h.expiresAt - now < 6 * 3600_000);
  for (const h of soon) {
    const ex = db.exhibitors.find((e) => e.id === h.exhibitorId);
    if (!ex) continue;
    await remindOnce(`hold_${h.id}`, async () => {
      const msg = prepare(db, t, ex, h.eventId);
      if (!msg) return false;
      const r = await deliver(cfg(), [msg], { eventId: h.eventId, kind: 'hold_expiring' });
      await logSent([msg], h.eventId, new Set(r.failed.map((f) => f.exhibitorId)));
      return r.sent > 0;
    });
  }
});

export const waPaymentReminders = onSchedule({ schedule: 'every day 10:00', timeZone: 'Asia/Kolkata', secrets }, async () => {
  const now = Date.now();
  const db = await readDB();
  const t = db.templates.find((x) => x.key === 'payment_reminder');
  if (!t) return;
  // Same rule as the ledger highlight: balance due within the event's warning window.
  const day = new Date().toISOString().slice(0, 10);
  for (const b of db.bookings.filter((x) => x.status === 'active')) {
    const ev = db.events.find((e) => e.id === b.eventId);
    if (!ev || ev.status === 'completed') continue;
    const days = daysUntil(ev.startDate, now);
    if (days < 0 || days > ev.dueWarningDays) continue;
    if (b.total - paidFor(db, b.id) <= 0) continue;
    const ex = db.exhibitors.find((e) => e.id === b.exhibitorId);
    if (!ex) continue;
    // At most every 3 days per booking.
    const bucket = Math.floor(Date.parse(day) / (3 * 86400_000));
    await remindOnce(`pay_${b.id}_${bucket}`, async () => {
      const msg = prepare(db, t, ex, b.eventId);
      if (!msg) return false;
      const r = await deliver(cfg(), [msg], { eventId: b.eventId, kind: 'payment_reminder' });
      await logSent([msg], b.eventId, new Set(r.failed.map((f) => f.exhibitorId)));
      return r.sent > 0;
    });
  }
});
