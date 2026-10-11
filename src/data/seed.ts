// Deterministic demo data. All people, businesses and phone numbers are fictional.
// Venues, dates and tariffs are PAHRAVA's real ones for Oct 2026.
import type { Booking, Category, DB, Event, Exhibitor, Floor, Hold, Lang, PayMode, Payment, Source, Stall, StallType, Venue } from './types';
import { DEFAULT_TEMPLATES } from './templates';
import { AGRASEN_AC, AGRASEN_OUTSIDE, LAKSHIKA_MAIN, type PlanSpec } from './floorplans';
import { toISODate } from '../domain/format';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXHIBITORS: [string, string, Category, Lang, string][] = [
  ['Asha Patil', 'Sakhi Sarees', 'fashion', 'mr', 'Nashik'],
  ['Meera Kulkarni', 'Meera Masale', 'food', 'mr', 'Nashik'],
  ['Priya Deshmukh', 'Rangoli Kurtis', 'fashion', 'mr', 'Nashik'],
  ['Sunita Jadhav', 'Sunita Pickles & Papad', 'food', 'mr', 'Sinnar'],
  ['Kavita Agrawal', 'Kavya Jewels', 'jewellery', 'hi', 'Malegaon'],
  ['Neha Sharma', 'Little Bloom Kidswear', 'kids', 'hi', 'Nashik'],
  ['Anjali Shinde', 'Anjali Home Decor', 'home_decor', 'mr', 'Pune'],
  ['Rekha Joshi', 'Paithani Ghar', 'fashion', 'mr', 'Yeola'],
  ['Farah Shaikh', 'Noor Hijab Studio', 'fashion', 'hi', 'Malegaon'],
  ['Pooja Bhosale', 'Pooja Cakes', 'food', 'mr', 'Nashik'],
  ['Swati Pawar', 'Swati Oxidised Jewellery', 'jewellery', 'mr', 'Nashik'],
  ['Ritu Jain', 'Ritu Fashion Hub', 'fashion', 'hi', 'Malegaon'],
  ['Deepa Nair', 'Coastal Spice Co.', 'food', 'en', 'Mumbai'],
  ['Shraddha More', 'Kids Kingdom Toys', 'kids', 'mr', 'Nashik'],
  ['Vaishali Gaikwad', 'Gharguti Chakli', 'food', 'mr', 'Malegaon'],
  ['Komal Mehta', 'Komal Bandhani', 'fashion', 'hi', 'Dhule'],
  ['Snehal Wagh', 'Terracotta Tales', 'home_decor', 'mr', 'Nashik'],
  ['Ayesha Khan', 'Zari Work Studio', 'fashion', 'hi', 'Malegaon'],
  ['Manisha Chavan', 'Manisha Mehendi', 'other', 'mr', 'Nashik'],
  ['Tanvi Desai', 'Tanvi Candles', 'home_decor', 'en', 'Pune'],
  ['Geeta Yadav', 'Geeta Namkeen', 'food', 'hi', 'Malegaon'],
  ['Rupali Sonawane', 'Rupali Bangles', 'jewellery', 'mr', 'Nashik'],
  ['Nisha Gupta', 'Nisha Designer Blouses', 'fashion', 'hi', 'Jalgaon'],
  ['Madhuri Thakre', 'Madhuri Ukadiche Modak', 'food', 'mr', 'Nashik'],
  ['Shweta Rao', 'Shweta Silver', 'jewellery', 'en', 'Mumbai'],
  ['Jyoti Pardeshi', 'Jyoti Cotton Nighties', 'fashion', 'mr', 'Malegaon'],
  ['Harsha Bhamare', 'Bal Gopal Kids Ethnic', 'kids', 'mr', 'Dhule'],
  ['Simran Kaur', 'Phulkari Corner', 'fashion', 'hi', 'Nashik'],
  ['Archana Ghuge', 'Organic Mati', 'home_decor', 'mr', 'Sinnar'],
  ['Lata Sabale', 'Lata Puran Poli', 'food', 'mr', 'Nashik'],
  ['Mansi Trivedi', 'Mansi Handbags', 'fashion', 'en', 'Pune'],
  ['Sapna Borse', 'Sapna Herbal Care', 'other', 'mr', 'Malegaon'],
  ['Heena Ansari', 'Heena Attar House', 'other', 'hi', 'Malegaon'],
  ['Prajakta Kale', 'Kala Paintings', 'home_decor', 'mr', 'Nashik'],
  ['Vandana Ahire', 'Vandana Kids Bows', 'kids', 'mr', 'Nashik'],
  ['Kirti Saxena', 'Kirti Kurti Point', 'fashion', 'hi', 'Malegaon'],
  ['Smita Dhage', 'Smita Chocolates', 'food', 'en', 'Nashik'],
  ['Bhakti Lokhande', 'Bhakti Nath Collection', 'jewellery', 'mr', 'Ahilyanagar'],
  ['Reshma Patel', 'Reshma Leheriya', 'fashion', 'hi', 'Dhule'],
  ['Ujwala Nikam', 'Ujwala Dry Fruits', 'food', 'mr', 'Nashik'],
];

const SOURCES: Source[] = ['call', 'whatsapp', 'walk_in', 'referral', 'instagram'];
const MODES: PayMode[] = ['upi', 'upi', 'upi', 'cash', 'bank', 'cheque'];
const NOTES = [
  'Prefers corner stall near entrance.',
  'Needs a power point for display lights.',
  'Brings 2 helpers; asks for extra chairs.',
  'Asked about installments in 2 parts.',
  '',
  '',
  'Usually confirms after husband checks dates.',
  'Very good sales last time; wants the same stall.',
];

interface TypeSpec {
  key: string;
  name: string;
  size: string;
  price: number;
  accent?: string;
  note?: string;
}

interface RowSpec {
  type: string;
  from: number;
  to: number;
  corners?: boolean;
}

interface FloorSpec {
  name: string;
  code?: string;
  rows?: RowSpec[];
  plan?: PlanSpec;
}

interface Layout {
  types: TypeSpec[];
  floors: FloorSpec[];
  cornerSurcharge: number;
  partnerSurcharge: number;
}

/** Lakshika Banquets, Nashik: main hall from the architect's plan + Lower Hall (no drawing yet). */
const LAKSHIKA: Layout = {
  cornerSurcharge: 0,
  partnerSurcharge: 500,
  types: [
    { key: 'red', name: 'Red Premium Stall', size: '3×2', price: 16000, accent: '#e53935' },
    { key: 'purple', name: 'Purple Premium Stall', size: '3×2', price: 15000, accent: '#9575cd' },
    { key: 'green', name: 'Green Stall', size: '2×2', price: 13000, accent: '#2e9e4f' },
    { key: 'table32', name: 'Table Stall', size: '3×2', price: 9000, accent: '#8d6e63' },
    { key: 'single', name: 'Single Table Stall', size: '1 table', price: 5000, accent: '#78909c', note: 'Only 1 table provided' },
    { key: 'food22', name: 'Food Stall', size: '2×2', price: 5000, accent: '#f29b30' },
  ],
  floors: [
    { name: 'Main Hall', plan: LAKSHIKA_MAIN },
    {
      name: 'Lower Hall',
      code: 'L',
      rows: [
        { type: 'table32', from: 1, to: 10 },
        { type: 'single', from: 11, to: 16 },
        { type: 'food22', from: 17, to: 24 },
        { type: 'table32', from: 25, to: 30 },
      ],
    },
  ],
};

/** Agrasen Bhavan, Malegaon (first floor). Single tables are added as demand comes in. */
const AGRASEN: Layout = {
  cornerSurcharge: 500,
  partnerSurcharge: 0,
  types: [
    { key: 'ac32', name: 'AC Hall Premium', size: '3×2', price: 8000, accent: '#1fa855' },
    { key: 'ac22', name: 'AC Hall Normal', size: '2×2', price: 7000, accent: '#e891a8' },
    { key: 'out32', name: 'Outside Stall', size: '3×2', price: 6500, accent: '#8c7ae6' },
    { key: 'food', name: 'Food Stall', size: '1 table', price: 3000, accent: '#f29b30', note: 'Only 1 table provided' },
    { key: 'single', name: 'Single Table', size: '1 table', price: 4500, accent: '#78909c', note: 'Only 1 table provided' },
  ],
  floors: [
    { name: 'AC Hall', code: 'AC', plan: AGRASEN_AC },
    { name: 'Outside', code: 'O', plan: AGRASEN_OUTSIDE },
    { name: 'Single Tables', code: 'T', rows: [{ type: 'single', from: 1, to: 4 }] },
  ],
};

export function createSeed(now = Date.now()): DB {
  const rand = rng(20261023);
  const r = (n: number) => Math.floor(rand() * n);
  const chance = (p: number) => rand() < p;
  let seq = 0;
  const id = (p: string) => `${p}_s${(++seq).toString(36)}`;
  const T = (daysAgo: number) => now - daysAgo * 86400_000;
  const day = 86400_000;

  const db: DB = {
    schema: 2,
    rev: 1,
    venues: [],
    events: [],
    floors: [],
    stallTypes: [],
    stalls: [],
    exhibitors: [],
    holds: [],
    bookings: [],
    payments: [],
    callLogs: [],
    templates: DEFAULT_TEMPLATES.map((t) => ({ ...t, id: id('tpl'), createdAt: T(120), updatedAt: T(120) })),
    broadcasts: [],
    visitors: [],
    activity: [],
    settings: { defaultHoldHours: 48, customTags: [] },
  };
  const act = (e: Omit<DB['activity'][number], 'id'>) => db.activity.push({ id: id('act'), ...e });

  // ---- Venues
  const lakshika: Venue = { id: id('ven'), name: 'Lakshika Hall', city: 'Nashik', createdAt: T(400), updatedAt: T(400) };
  const agrasen: Venue = { id: id('ven'), name: 'Agrasen Bhavan', city: 'Malegaon', createdAt: T(400), updatedAt: T(400) };
  db.venues.push(lakshika, agrasen);

  // ---- Exhibitors
  const tagPool = ['repeat', 'asked_discount', 'early_bird', 'no_show', 'payment_delay', 'high_priority', 'interested_next'];
  EXHIBITORS.forEach(([ownerName, businessName, category, language, city], i) => {
    const tags = tagPool.filter(() => chance(0.18));
    const consent = i % 6 !== 5; // ~1 in 6 has not given consent
    const created = T(30 + r(500));
    const ex: Exhibitor = {
      id: id('ex'),
      ownerName,
      businessName,
      phone: `900001${String(1001 + i * 37).padStart(4, '0')}`,
      altPhone: chance(0.25) ? `900002${String(2001 + i * 41).padStart(4, '0')}` : undefined,
      category,
      language,
      city,
      tags,
      source: SOURCES[r(SOURCES.length)],
      consent,
      consentDate: consent ? toISODate(new Date(created)) : undefined,
      notes: NOTES[r(NOTES.length)],
      createdAt: created,
      updatedAt: created,
    };
    db.exhibitors.push(ex);
    act({ at: created, kind: 'exhibitor_created', actor: 'staff', exhibitorId: ex.id, data: { source: ex.source } });
  });

  // ---- Events
  function buildEvent(name: string, venue: Venue, start: string, end: string, status: Event['status'], layout: Layout, createdDaysAgo: number) {
    const ev: Event = {
      id: id('ev'),
      name,
      venueId: venue.id,
      startDate: start,
      endDate: end,
      status,
      holdHours: 48,
      dueWarningDays: 7,
      cornerSurcharge: layout.cornerSurcharge,
      partnerSurcharge: layout.partnerSurcharge,
      createdAt: T(createdDaysAgo),
      updatedAt: T(createdDaysAgo),
    };
    db.events.push(ev);
    const typeIds: Record<string, string> = {};
    for (const t of layout.types) {
      const st: StallType = { id: id('typ'), eventId: ev.id, name: t.name, size: t.size, basePrice: t.price, accent: t.accent, note: t.note, createdAt: ev.createdAt, updatedAt: ev.createdAt };
      typeIds[t.key] = st.id;
      db.stallTypes.push(st);
    }
    const stalls: Stall[] = [];
    layout.floors.forEach((f, fi) => {
      const floor: Floor = { id: id('fl'), eventId: ev.id, name: f.name, code: f.code, order: fi, plan: f.plan?.plan, createdAt: ev.createdAt, updatedAt: ev.createdAt };
      db.floors.push(floor);
      const add = (s: Omit<Stall, 'id' | 'eventId' | 'floorId' | 'createdAt' | 'updatedAt'>) => {
        const stall: Stall = { id: id('st'), eventId: ev.id, floorId: floor.id, ...s, createdAt: ev.createdAt, updatedAt: ev.createdAt };
        stalls.push(stall);
        db.stalls.push(stall);
      };
      f.plan?.stalls.forEach((p, i) =>
        add({ number: p.n, typeId: typeIds[p.type], row: 0, col: i, isCorner: !!p.corner, pos: { x: p.x1, y: p.y1, w: p.x2 - p.x1, h: p.y2 - p.y1 } }),
      );
      f.rows?.forEach((row, ri) => {
        for (let n = row.from; n <= row.to; n++) {
          add({ number: String(n), typeId: typeIds[row.type], row: ri, col: n - row.from, isCorner: !!row.corners && (n === row.from || n === row.to) });
        }
      });
    });
    return { ev, stalls };
  }

  const code = (s: Stall) => {
    const f = db.floors.find((x) => x.id === s.floorId);
    return f?.code ? `${f.code}-${s.number}` : s.number;
  };

  const priceOf = (s: Stall, ev: Event) => {
    const t = db.stallTypes.find((x) => x.id === s.typeId)!;
    return t.basePrice + (s.isCorner ? ev.cornerSurcharge : 0);
  };

  function book(ev: Event, s: Stall, ex: Exhibitor, createdAt: number, paidFraction: number, opts: { partners?: number; discount?: number; reason?: string } = {}) {
    const base = priceOf(s, ev);
    const partners = opts.partners ?? 1;
    const partnerAmt = partners > 1 ? partners * ev.partnerSurcharge : 0;
    const discount = opts.discount ?? 0;
    const total = base + partnerAmt - discount;
    const b: Booking = {
      id: id('bk'),
      stallId: s.id,
      eventId: ev.id,
      exhibitorId: ex.id,
      basePrice: db.stallTypes.find((x) => x.id === s.typeId)!.basePrice,
      cornerAmt: s.isCorner ? ev.cornerSurcharge : 0,
      partners,
      partnerName: partners > 1 ? 'Partner (shared stall)' : undefined,
      partnerAmt,
      discount,
      discountReason: discount ? opts.reason : undefined,
      total,
      status: 'active',
      source: chance(0.2) ? 'whatsapp' : 'staff',
      createdAt,
      updatedAt: createdAt,
    };
    db.bookings.push(b);
    act({ at: createdAt - 3600_000, kind: 'hold_created', actor: b.source, exhibitorId: ex.id, eventId: ev.id, stallId: s.id, data: { stall: code(s), until: createdAt + 47 * 3600_000 } });
    act({ at: createdAt, kind: 'booking_confirmed', actor: b.source, exhibitorId: ex.id, eventId: ev.id, stallId: s.id, data: { stall: code(s), total } });
    const target = paidFraction >= 1 ? total : Math.round((total * paidFraction) / 500) * 500;
    if (target > 0) {
      // Pay in 1–2 installments
      const parts = paidFraction >= 1 && chance(0.5) ? [Math.round(total / 2 / 500) * 500, 0] : [target];
      if (parts.length === 2) parts[1] = total - parts[0];
      let at = createdAt + day / 2;
      for (const amount of parts) {
        const mode = MODES[r(MODES.length)];
        const p: Payment = {
          id: id('pay'),
          bookingId: b.id,
          amount,
          date: toISODate(new Date(Math.min(at, now))),
          mode,
          ref: mode === 'upi' ? `UPI${400000 + r(599999)}` : mode === 'cheque' ? `CHQ ${100000 + r(899999)}` : mode === 'bank' ? `NEFT${r(9999999)}` : undefined,
          source: 'staff',
          createdAt: Math.min(at, now),
          updatedAt: Math.min(at, now),
        };
        db.payments.push(p);
        act({ at: p.createdAt, kind: 'payment_recorded', actor: 'staff', exhibitorId: ex.id, eventId: ev.id, stallId: s.id, data: { stall: code(s), amount, mode, due: 0 } });
        at += 4 * day;
      }
    }
    return b;
  }

  // Past (completed) events give exhibitors a history.
  const past1 = buildEvent('PAHRAVA Diwali Exhibition 2025', agrasen, '2025-10-11', '2025-10-12', 'completed', AGRASEN, 420);
  const past2 = buildEvent('PAHRAVA Summer Exhibition 2026', lakshika, '2026-05-09', '2026-05-10', 'completed', LAKSHIKA, 200);
  for (const { ev, stalls } of [past1, past2]) {
    const daysAgo = Math.round((now - new Date(ev.startDate).getTime()) / day);
    const pool = [...db.exhibitors].sort(() => rand() - 0.5).slice(0, 26);
    pool.forEach((ex, i) => {
      const s = stalls[(i * 7) % stalls.length];
      if (db.bookings.some((b) => b.stallId === s.id)) return;
      book(ev, s, ex, T(daysAgo + 20 + r(25)), 1);
    });
  }

  // Upcoming events
  const e1 = buildEvent('PAHRAVA Diwali Exhibition – Nashik', lakshika, '2026-10-23', '2026-10-24', 'booking_open', LAKSHIKA, 45);
  const e2 = buildEvent('PAHRAVA Diwali Exhibition – Malegaon', agrasen, '2026-10-26', '2026-10-27', 'booking_open', AGRASEN, 40);

  const shuffled = [...db.exhibitors].sort(() => rand() - 0.5);
  let cursor = 0;
  const nextEx = () => shuffled[cursor++ % shuffled.length];

  // Plan: [status, count] per event. Food exhibitors are steered to food stalls.
  function populate(ev: Event, stalls: Stall[], plan: { full: number; part: number; unpaid: number; holds: number[] }) {
    const order = [...stalls].sort(() => rand() - 0.5);
    let k = 0;
    const take = () => order[k++];
    const used = new Set<string>();
    const pickEx = () => {
      let ex = nextEx();
      while (used.has(ex.id)) ex = nextEx();
      used.add(ex.id);
      return ex;
    };
    for (let i = 0; i < plan.full; i++) {
      const ex = pickEx();
      book(ev, take(), ex, T(10 + r(25)), 1, i === 0 ? { discount: 500, reason: 'Repeat exhibitor' } : i === 1 && ev.partnerSurcharge ? { partners: 2 } : {});
    }
    for (let i = 0; i < plan.part; i++) {
      const ex = pickEx();
      book(ev, take(), ex, T(4 + r(14)), [0.25, 0.4, 0.5, 0.6][r(4)], i === 0 && ev.partnerSurcharge ? { partners: 2 } : i === 2 ? { discount: 1000, reason: 'Early-bird offer' } : {});
    }
    for (let i = 0; i < plan.unpaid; i++) book(ev, take(), pickEx(), T(1 + r(5)), 0);
    for (const hoursLeft of plan.holds) {
      const s = take();
      const ex = pickEx();
      const created = now - (ev.holdHours - hoursLeft) * 3600_000;
      const h: Hold = { id: id('hold'), stallId: s.id, eventId: ev.id, exhibitorId: ex.id, expiresAt: now + hoursLeft * 3600_000, status: 'active', source: chance(0.4) ? 'whatsapp' : 'staff', createdAt: created, updatedAt: created };
      db.holds.push(h);
      act({ at: created, kind: 'hold_created', actor: h.source, exhibitorId: ex.id, eventId: ev.id, stallId: s.id, data: { stall: code(s), until: h.expiresAt } });
    }
  }
  // Two holds expire within a few hours (one per event); the rest are fresh.
  populate(e1.ev, e1.stalls, { full: 9, part: 8, unpaid: 5, holds: [2.5, 30, 41] });
  populate(e2.ev, e2.stalls, { full: 6, part: 6, unpaid: 4, holds: [1.25, 22, 45] });

  // An expired hold from earlier, already logged.
  {
    const s = e2.stalls.find((x) => !db.bookings.some((b) => b.stallId === x.id) && !db.holds.some((h) => h.stallId === x.id))!;
    const ex = shuffled[3];
    db.holds.push({ id: id('hold'), stallId: s.id, eventId: e2.ev.id, exhibitorId: ex.id, expiresAt: T(2), status: 'expired', source: 'staff', createdAt: T(4), updatedAt: T(2) });
    act({ at: T(4), kind: 'hold_created', actor: 'staff', exhibitorId: ex.id, eventId: e2.ev.id, stallId: s.id, data: { stall: code(s), until: T(2) } });
    act({ at: T(2), kind: 'hold_expired', actor: 'system', exhibitorId: ex.id, eventId: e2.ev.id, stallId: s.id, data: {} });
  }

  // ---- Call logs & follow-ups
  const callNotes = ['Will confirm after checking stock.', 'Wants a stall near the entrance.', 'Asked for ₹1,000 discount.', 'Busy with another exhibition, call next week.', 'Interested in the Malegaon event too.'];
  shuffled.slice(0, 14).forEach((ex, i) => {
    const outcome = (['interested', 'call_back', 'not_now', 'call_back', 'booked'] as const)[i % 5];
    const at = T(1 + r(9));
    const cb = outcome === 'call_back' ? toISODate(new Date(now + (r(5) - 1) * day)) : undefined;
    db.callLogs.push({ id: id('call'), exhibitorId: ex.id, eventId: i % 2 ? e1.ev.id : e2.ev.id, outcome, callbackDate: cb, note: callNotes[i % callNotes.length], done: outcome !== 'call_back', createdAt: at, updatedAt: at });
    act({ at, kind: 'call_logged', actor: 'staff', exhibitorId: ex.id, eventId: e1.ev.id, data: { outcome, callback: cb, note: callNotes[i % callNotes.length] } });
  });

  // ---- An earlier announcement broadcast
  {
    const tpl = db.templates.find((t) => t.key === 'new_event')!;
    const recipients = db.exhibitors.filter((e) => e.consent);
    const at = T(30);
    const counts = { en: 0, mr: 0, hi: 0 } as Record<Lang, number>;
    for (const ex of recipients) {
      counts[ex.language]++;
      act({ at, kind: 'message_sent', actor: 'staff', exhibitorId: ex.id, eventId: e1.ev.id, data: { template: tpl.name[ex.language], lang: ex.language } });
    }
    db.broadcasts.push({ id: id('bc'), templateId: tpl.id, eventId: e1.ev.id, filters: { categories: [], tags: [], languages: [] }, recipientIds: recipients.map((e) => e.id), excludedCount: db.exhibitors.length - recipients.length, countsByLang: counts, createdAt: at, updatedAt: at });
  }

  // ---- Visitors
  const vNames = ['Aarti', 'Bhagyashree', 'Chhaya', 'Dipali', 'Ishita', 'Janhavi', 'Kalyani', 'Mrunal', 'Payal', 'Rutuja', 'Sayali', 'Trupti'];
  const ages = ['under_18', '18_25', '26_35', '36_50', '50_plus'] as const;
  for (let i = 0; i < 36; i++) {
    const ev = i % 3 === 0 ? e2.ev : e1.ev;
    const at = T(r(12));
    db.visitors.push({ id: id('vis'), eventId: ev.id, name: `${vNames[i % vNames.length]} ${String.fromCharCode(65 + (i % 26))}.`, phone: `900003${String(3001 + i * 13).padStart(4, '0')}`, city: i % 3 === 0 ? 'Malegaon' : 'Nashik', ageGroup: ages[r(ages.length)], consent: chance(0.85), createdAt: at, updatedAt: at });
  }

  db.activity.sort((a, b) => a.at - b.at);
  return db;
}

/**
 * A clean start for real use: the upcoming events with their venues, floor plans,
 * stall types and tariffs, plus message templates — and no demo exhibitors,
 * bookings, payments, calls, visitors or activity.
 */
export function startFresh(db: DB) {
  const keep = new Set(db.events.filter((e) => e.status !== 'completed').map((e) => e.id));
  db.events = db.events.filter((e) => keep.has(e.id));
  db.venues = db.venues.filter((v) => db.events.some((e) => e.venueId === v.id));
  db.floors = db.floors.filter((f) => keep.has(f.eventId));
  db.stallTypes = db.stallTypes.filter((x) => keep.has(x.eventId));
  db.stalls = db.stalls.filter((s) => keep.has(s.eventId));
  db.exhibitors = [];
  db.holds = [];
  db.bookings = [];
  db.payments = [];
  db.callLogs = [];
  db.broadcasts = [];
  db.visitors = [];
  db.activity = [];
}

export function createStarter(now = Date.now()): DB {
  const db = createSeed(now);
  startFresh(db);
  return db;
}
