import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { exec, useDB, useNow } from '../data/store';
import { LANGS, type DB, type Lang } from '../data/types';
import { indexDB, stallState } from '../domain/derive';
import { fmtDateTime, fmtRange, fmtTime, interpolate, money } from '../domain/format';
import { createPaymentLink, recordPayment } from '../domain/payments';
import { listPrice } from '../domain/pricing';
import { confirmBooking, holdStall } from '../domain/stalls';
import { Icon } from '../components/Icon';
import { Legend } from './StallMap';
import { FloorPlanView } from '../components/FloorPlanView';
import { LOGO_MARK } from '../components/Shell';
import { PageHeader } from '../components/ui';
import { dictionaries, useT } from '../i18n';
import { stallCode } from '../domain/stallcode';

interface Msg {
  id: number;
  from: 'bot' | 'me';
  text: string;
  at: number;
}

type Step = 'lang' | 'event' | 'type' | 'held' | 'paid';

/** Stall types with live free counts for an event (cheapest free stall price per type). */
function typeOptions(db: DB, eventId: string, now: number) {
  return db.stallTypes
    .filter((t) => t.eventId === eventId)
    .map((type) => {
      const free = db.stalls.filter((s) => s.typeId === type.id && stallState(db, s.id, now).status === 'available');
      return { type, free: free.length, price: free.length ? Math.min(...free.map((s) => listPrice(db, s))) : type.basePrice };
    });
}

export function WhatsAppDemo() {
  const t = useT();
  const db = useDB();
  const now = useNow();
  const idx = indexDB(db);
  const consenting = db.exhibitors.filter((e) => e.consent);
  const [personaId, setPersonaId] = useState(() => consenting.find((e) => !db.holds.some((h) => h.exhibitorId === e.id && h.status === 'active'))?.id ?? db.exhibitors[0]?.id);
  const persona = idx.exhibitorById.get(personaId);
  const [chatLang, setChatLang] = useState<Lang>('mr');
  const [step, setStep] = useState<Step>('lang');
  const [eventId, setEventId] = useState<string>();
  const [stallId, setStallId] = useState<string>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const seq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const b = dictionaries[chatLang].bot;
  const openEvents = db.events.filter((e) => e.status === 'booking_open').sort((a, c) => a.startDate.localeCompare(c.startDate));

  const push = (from: Msg['from'], ...texts: string[]) => setMsgs((m) => [...m, ...texts.map((text) => ({ id: ++seq.current, from, text, at: Date.now() }))]);

  const restart = () => {
    setMsgs([{ id: ++seq.current, from: 'bot', text: dictionaries.en.bot.chooseLang, at: Date.now() }]);
    setStep('lang');
    setEventId(undefined);
    setStallId(undefined);
  };
  useEffect(restart, [personaId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, step]);

  const chooseLang = (l: Lang) => {
    setChatLang(l);
    const bb = dictionaries[l].bot;
    push('me', dictionaries[l].langName[l]);
    push('bot', openEvents.length ? interpolate(bb.welcome, { name: persona?.ownerName.split(' ')[0] ?? '' }) : bb.noEvents);
    setStep('event');
  };

  const chooseEvent = (id: string) => {
    const ev = db.events.find((e) => e.id === id)!;
    setEventId(id);
    push('me', ev.name);
    // Already holding something here? Continue with it instead of double-holding.
    const existing = db.holds.find((h) => h.eventId === id && h.exhibitorId === personaId && h.status === 'active' && h.expiresAt > now);
    if (existing) {
      const s = idx.stallById.get(existing.stallId)!;
      setStallId(s.id);
      push('bot', interpolate(b.alreadyHolding, { stall: stallCode(db, s) }));
      setStep('held');
      return;
    }
    push('bot', interpolate(b.pickType, { event: ev.name, dates: fmtRange(ev.startDate, ev.endDate, chatLang) }));
    setStep('type');
  };

  const chooseType = (typeId: string) => {
    const type = idx.typeById.get(typeId)!;
    push('me', `${type.name} ${type.size}`);
    let stallNo = '';
    let price = 0;
    let until = 0;
    let url = '';
    const r = exec((d, n) => {
      // Lowest-numbered free stall of this type, non-corner first (cheapest).
      const candidates = d.stalls
        .filter((s) => s.typeId === typeId && !d.bookings.some((x) => x.stallId === s.id && x.status === 'active') && !d.holds.some((h) => h.stallId === s.id && h.status === 'active' && h.expiresAt > n))
        .sort((a, c) => Number(a.isCorner) - Number(c.isCorner) || Number(a.number) - Number(c.number));
      const s = candidates[0];
      if (!s) return { ok: false as const };
      const res = holdStall(d, { stallId: s.id, exhibitorId: personaId, actor: 'whatsapp' }, n);
      if (!res.ok) return res;
      price = listPrice(d, s);
      stallNo = stallCode(d, s);
      until = res.hold.expiresAt;
      url = createPaymentLink(d, { stallId: s.id, exhibitorId: personaId, amount: price }, n);
      return { ok: true as const, stallId: s.id };
    });
    if (!r.ok || !('stallId' in r)) {
      push('bot', b.taken);
      return;
    }
    setStallId(r.stallId);
    push('bot', interpolate(b.held, { stall: stallNo, type: `${type.name} ${type.size}`, time: fmtDateTime(until, chatLang) }), interpolate(b.payLink, { amount: money(price), url }));
    setStep('held');
  };

  const simulatePayment = () => {
    if (!stallId) return;
    const ev = db.events.find((e) => e.id === eventId)!;
    const venue = db.venues.find((v) => v.id === ev.venueId);
    const s = idx.stallById.get(stallId)!;
    let paid = 0;
    const ok = exec((d, n) => {
      const c = confirmBooking(d, { stallId, exhibitorId: personaId, actor: 'whatsapp' }, n);
      if (!c.ok) return false;
      paid = c.booking.total;
      return recordPayment(d, { bookingId: c.booking.id, amount: c.booking.total, mode: 'upi', ref: `SIM-${n.toString(36).toUpperCase()}`, note: 'Simulated WhatsApp payment', actor: 'whatsapp' }, n).ok;
    });
    if (!ok) {
      push('bot', b.taken);
      setStep('type');
      return;
    }
    push('me', `✅ ${money(paid)} UPI`);
    push('bot', interpolate(b.paid, { amount: money(paid), stall: stallCode(db, s), event: ev.name, venue: `${venue?.name}, ${venue?.city}`, dates: fmtRange(ev.startDate, ev.endDate, chatLang) }));
    setStep('paid');
  };

  const options = useMemo(() => (eventId ? typeOptions(db, eventId, now) : []), [db, eventId, now]);
  const mapEventId = eventId ?? openEvents[0]?.id;

  return (
    <div>
      <PageHeader title={t.wa.title} subtitle={t.wa.intro} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1 sm:flex-none">
          <span className="label">{t.wa.persona}</span>
          <select className="input" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
            {consenting.map((e) => (
              <option key={e.id} value={e.id}>
                {e.ownerName} · {e.businessName}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={restart}>
          <Icon name="refresh" /> {t.wa.restart}
        </button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
        {/* Phone frame */}
        <div className="mx-auto w-full max-w-[380px] rounded-[2.5rem] border-[10px] border-black bg-black shadow-[var(--overlay-shadow)]">
          <div className="overflow-hidden rounded-[1.8rem]">
            <div className="flex items-center gap-3 bg-tile px-4 py-3 text-white">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white p-1"><img src={LOGO_MARK} alt="" className="h-full w-auto" /></span>
              <div className="leading-tight">
                <p className="font-semibold">PAHRAVA Exhibitions</p>
                <p className="text-xs opacity-80">{t.wa.online}</p>
              </div>
            </div>
            <div ref={scroller} className="h-[520px] space-y-2 overflow-y-auto bg-[var(--chat-bg)] p-3" lang={chatLang} aria-live="polite">
              {msgs.map((m) => (
                <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] whitespace-pre-line ${m.from === 'me' ? 'rounded-tr-sm bg-[var(--chat-out)]' : 'rounded-tl-sm bg-[var(--chat-in)]'}`}>
                    {m.text.split(/(https:\/\/\S+)/).map((part, i) =>
                      part.startsWith('https://') ? (
                        <span key={i} className="break-all text-[#1a73e8] underline">
                          {part}
                        </span>
                      ) : (
                        part
                      ),
                    )}
                    <span className="mt-0.5 block text-right text-[10px] text-muted">{fmtTime(m.at, chatLang)}</span>
                  </div>
                </div>
              ))}

              {/* Quick-reply options for the current step */}
              <div className="flex flex-col items-start gap-1.5 pt-1">
                {step === 'lang' &&
                  LANGS.map((l) => (
                    <button key={l} lang={l} className="min-h-[44px] rounded-full border border-[var(--border)] bg-surface px-4 text-link" onClick={() => chooseLang(l)}>
                      {dictionaries[l].langName[l]}
                    </button>
                  ))}
                {step === 'event' &&
                  openEvents.map((e) => {
                    const v = db.venues.find((x) => x.id === e.venueId);
                    return (
                      <button key={e.id} className="min-h-[44px] w-full rounded-[18px] border border-[var(--border)] bg-surface px-4 py-2 text-left text-link" onClick={() => chooseEvent(e.id)}>
                        {e.name}
                        <span className="block text-sm font-normal text-muted">
                          {v?.name}, {v?.city} · {fmtRange(e.startDate, e.endDate, chatLang)}
                        </span>
                      </button>
                    );
                  })}
                {step === 'type' &&
                  (options.every((o) => o.free === 0) ? (
                    <p className="rounded-2xl bg-[var(--chat-in)] px-3 py-2">{b.soldOut}</p>
                  ) : (
                    options.map((o) => (
                      <button
                        key={o.type.id}
                        disabled={o.free === 0}
                        className="min-h-[44px] w-full rounded-[18px] border border-[var(--border)] bg-surface px-4 py-2 text-left text-link  disabled:text-muted"
                        onClick={() => chooseType(o.type.id)}
                      >
                        {interpolate(b.typeLine, { type: o.type.name, size: o.type.size, price: money(o.price), n: o.free })}
                      </button>
                    ))
                  ))}
                {step === 'held' && (
                  <button className="btn btn-primary w-full" onClick={simulatePayment}>
                    <Icon name="rupee" /> {t.wa.simulatePayment}
                  </button>
                )}
                {step === 'paid' && (
                  <button className="btn w-full" onClick={restart}>
                    <Icon name="refresh" /> {t.wa.restart}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 bg-surface px-3 py-2 text-sm text-muted">
              <span className="flex-1 rounded-full bg-surface-2 px-3 py-2">{t.wa.typeHint}</span>
              <Icon name="send" />
            </div>
          </div>
        </div>

        {/* Live map */}
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn-text">
            <Icon name="info" /> {t.wa.demoNote}
          </p>
          {mapEventId && <MiniMap eventId={mapEventId} highlight={stallId} />}
          <Legend />
          {mapEventId && (
            <Link className="btn" to={`/e/${mapEventId}/map${stallId ? `?stall=${stallId}` : ''}`}>
              <Icon name="grid" /> {t.dashboard.openMap}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniMap({ eventId, highlight }: { eventId: string; highlight?: string }) {
  const t = useT();
  const db = useDB();
  const now = useNow();
  const idx = indexDB(db);
  const ev = db.events.find((e) => e.id === eventId);
  const floors = db.floors.filter((f) => f.eventId === eventId).sort((a, b) => a.order - b.order);
  const [floorId, setFloorId] = useState(floors[0]?.id);
  // Follow the stall the bot just held.
  useEffect(() => {
    const s = highlight && idx.stallById.get(highlight);
    if (s) setFloorId(s.floorId);
  }, [highlight]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!floors.some((f) => f.id === floorId)) setFloorId(floors[0]?.id);
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps
  const floor = floors.find((f) => f.id === floorId) ?? floors[0];
  if (!floor) return null;
  const stalls = db.stalls.filter((s) => s.floorId === floor.id).sort((a, b) => a.row - b.row || a.col - b.col);
  const states = new Map(stalls.map((s) => [s.id, stallState(db, s.id, now)]));
  const rows = Array.from(new Set(stalls.map((s) => s.row)));
  return (
    <section className="card p-3">
      <h2 className="mb-2 px-1 font-semibold">
        {t.wa.liveMap} · {ev?.name}
      </h2>
      <div role="tablist" className="mb-2 flex gap-1 overflow-x-auto">
        {floors.map((f) => (
          <button key={f.id} role="tab" aria-selected={f.id === floor.id} className="chip" aria-pressed={f.id === floor.id} onClick={() => setFloorId(f.id)}>
            {f.name}
          </button>
        ))}
      </div>
      {floor.plan ? (
        <FloorPlanView floor={floor} stalls={stalls} states={states} typeById={idx.typeById} now={now} highlightId={highlight} compact />
      ) : (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r} className="flex flex-wrap gap-1">
              {stalls
                .filter((s) => s.row === r)
                .map((s) => {
                  const st = states.get(s.id)!.status;
                  return (
                    <span
                      key={s.id}
                      title={`#${s.number} · ${t.status[st]}`}
                      className={`st st-${st} tabular flex h-8 w-8 items-center justify-center rounded-md border text-[11px] font-semibold ${s.id === highlight ? 'scale-125 ring-4 ring-primary' : ''} transition`}
                    >
                      {s.number}
                    </span>
                  );
                })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
