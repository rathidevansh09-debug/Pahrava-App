// WhatsApp booking chat — the real version of the in-app demo (WhatsAppDemo.tsx).
// language → exhibition → stall type → a real hold on the shared stall map.
// Session state lives in `pahrava_wa/chat_<number>`; bookings in the main DB.
import { LANGS, type DB, type Exhibitor, type Lang } from '../../src/data/types';
import { stallState } from '../../src/domain/derive';
import { createExhibitor, findByPhone } from '../../src/domain/exhibitors';
import { fmtDateTime, fmtRange, interpolate, money } from '../../src/domain/format';
import { log } from '../../src/domain/log';
import { normalizePhone } from '../../src/domain/phone';
import { listPrice } from '../../src/domain/pricing';
import { holdStall } from '../../src/domain/stalls';
import { stallCode } from '../../src/domain/stallcode';
import { en } from '../../src/i18n/en';
import { hi } from '../../src/i18n/hi';
import { mr } from '../../src/i18n/mr';
import { markRead, sendButtons, sendList, sendText, type WaConfig } from './graph';
import { fs, readDB, serverExec, WA_COLLECTION } from './store';

const DICT = { en, mr, hi };
const HELP_EVERY = 6 * 3600_000;

interface Session {
  step: 'lang' | 'event' | 'type' | 'done';
  lang: Lang;
  eventId?: string;
  lastHelpAt?: number;
  updatedAt: number;
}

export interface Inbound {
  id: string;
  from: string; // 9198…
  name?: string; // WhatsApp profile name
  text?: string; // typed text or tapped title
  replyId?: string; // id of a tapped button / list row
}

const START = /^(hi|hii+|hello|hey|book|booking|menu|yes|namaste|namaskar|stall|start booking|नमस्कार|नमस्ते)\b/i;

const sessionRef = (waId: string) => fs().collection(WA_COLLECTION).doc(`chat_${waId}`);

function openEvents(db: DB) {
  return db.events.filter((e) => e.status === 'booking_open').sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function typeRows(db: DB, eventId: string, now: number, lang: Lang) {
  const b = DICT[lang].bot;
  return db.stallTypes
    .filter((t) => t.eventId === eventId)
    .map((type) => {
      const free = db.stalls.filter((s) => s.typeId === type.id && stallState(db, s.id, now).status === 'available');
      const price = free.length ? Math.min(...free.map((s) => listPrice(db, s))) : type.basePrice;
      return { id: `type:${type.id}`, title: type.name, description: interpolate(b.stallsLeft, { size: type.size, price: money(price), n: free.length }), free: free.length };
    })
    .filter((r) => r.free > 0);
}

export async function handleInbound(cfg: WaConfig, m: Inbound) {
  void markRead(cfg, m.id);
  const phone = normalizePhone(m.from);
  const ref = sessionRef(m.from);
  const snap = await ref.get();
  const now = Date.now();
  let s: Session = (snap.data() as Session | undefined) ?? { step: 'lang', lang: 'en', updatedAt: 0 };
  const save = (patch: Partial<Session>) => {
    s = { ...s, ...patch, updatedAt: now };
    return ref.set(s);
  };
  const say = (text: string) => sendText(cfg, m.from, text);
  const raw = (m.text ?? '').trim();
  const word = raw.toUpperCase();

  // Keep a record on the exhibitor's timeline when we know them.
  if (raw && !m.replyId) {
    await serverExec((d, n) => {
      const ex = findByPhone(d, phone);
      if (ex) log(d, { at: n, kind: 'message_received', actor: 'whatsapp', exhibitorId: ex.id, data: { text: raw.slice(0, 300) } });
    });
  }

  // Marketing opt-out / opt-in
  if (word === 'STOP' || word === 'UNSUBSCRIBE' || word === 'START') {
    const on = word === 'START';
    await serverExec((d, n) => {
      const ex = findByPhone(d, phone);
      if (ex) {
        ex.consent = on;
        ex.consentDate = on ? new Date(n).toISOString().slice(0, 10) : undefined;
        ex.updatedAt = n;
      }
    });
    await say(on ? DICT[s.lang].bot.start : DICT[s.lang].bot.stop);
    return;
  }

  const db = await readDB();
  const known = findByPhone(db, phone);

  const askLanguage = async () => {
    await save({ step: 'lang', eventId: undefined });
    await sendButtons(
      cfg,
      m.from,
      en.bot.chooseLang,
      LANGS.map((l) => ({ id: `lang:${l}`, title: DICT[l].langName[l] })),
    );
  };

  const askEvent = async (lang: Lang) => {
    const b = DICT[lang].bot;
    const events = openEvents(db);
    if (!events.length) {
      await save({ step: 'done', lang });
      return say(b.noEvents);
    }
    await save({ step: 'event', lang });
    const first = (known?.ownerName ?? m.name ?? '').split(' ')[0];
    await sendList(
      cfg,
      m.from,
      interpolate(b.welcome, { name: first }),
      b.viewEvents,
      events.map((e) => {
        const v = db.venues.find((x) => x.id === e.venueId);
        return { id: `ev:${e.id}`, title: v ? `${v.city}` : e.name, description: `${e.name} · ${fmtRange(e.startDate, e.endDate, lang)}` };
      }),
    );
  };

  const askType = async (lang: Lang, eventId: string) => {
    const b = DICT[lang].bot;
    const ev = db.events.find((e) => e.id === eventId);
    if (!ev) return askEvent(lang);
    // Already holding a stall here? Don't hold a second one.
    const existing = known && db.holds.find((h) => h.eventId === eventId && h.exhibitorId === known.id && h.status === 'active' && h.expiresAt > now);
    if (existing) {
      await save({ step: 'done', lang, eventId });
      const st = db.stalls.find((x) => x.id === existing.stallId);
      return say(`${interpolate(b.alreadyHolding, { stall: stallCode(db, st) })}\n\n${b.payStaff}`);
    }
    const rows = typeRows(db, eventId, now, lang);
    if (!rows.length) {
      await save({ step: 'done', lang, eventId });
      return say(b.soldOut);
    }
    await save({ step: 'type', lang, eventId });
    await sendList(cfg, m.from, interpolate(b.pickType, { event: ev.name, dates: fmtRange(ev.startDate, ev.endDate, lang) }), b.viewStalls, rows);
  };

  const hold = async (lang: Lang, typeId: string) => {
    const b = DICT[lang].bot;
    const r = await serverExec((d, n) => {
      let ex: Exhibitor | undefined = findByPhone(d, phone);
      if (!ex) {
        const name = (m.name ?? '').trim() || `WhatsApp ${phone.slice(-4)}`;
        const c = createExhibitor(
          d,
          { ownerName: name, businessName: name, phone, category: 'other', language: lang, city: '', tags: [], source: 'whatsapp', consent: false, notes: 'Added from a WhatsApp booking chat.' },
          n,
        );
        if (!c.ok) return { ok: false as const };
        ex = c.exhibitor;
        const entry = d.activity[d.activity.length - 1];
        if (entry?.exhibitorId === ex.id) entry.actor = 'whatsapp';
      }
      // Lowest-numbered free stall of this type, non-corner first (cheapest).
      const candidates = d.stalls
        .filter((st) => st.typeId === typeId && stallState(d, st.id, n).status === 'available')
        .sort((a, c) => Number(a.isCorner) - Number(c.isCorner) || Number(a.number) - Number(c.number));
      const st = candidates[0];
      if (!st) return { ok: false as const };
      const h = holdStall(d, { stallId: st.id, exhibitorId: ex.id, actor: 'whatsapp' }, n);
      if (!h.ok) return { ok: false as const };
      const type = d.stallTypes.find((t) => t.id === typeId);
      return { ok: true as const, stall: stallCode(d, st), type: type ? `${type.name} ${type.size}` : '', until: h.hold.expiresAt };
    });
    if (!r.ok) return say(b.taken);
    await save({ step: 'done', lang });
    await say(`${interpolate(b.held, { stall: r.stall, type: r.type, time: fmtDateTime(r.until, lang) })}\n\n${b.payStaff}`);
  };

  // Tapped replies
  const id = m.replyId ?? '';
  if (id.startsWith('lang:')) return askEvent(id.slice(5) as Lang);
  if (id.startsWith('ev:')) return askType(s.lang, id.slice(3));
  if (id.startsWith('type:')) return hold(s.lang, id.slice(5));

  // Typed text
  if (START.test(raw) || !snap.exists) return askLanguage();
  if (now - (s.lastHelpAt ?? 0) > HELP_EVERY) {
    await save({ lastHelpAt: now });
    await say(DICT[s.lang].bot.help);
  }
}
