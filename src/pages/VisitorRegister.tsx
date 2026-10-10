import { useState } from 'react';
import { Link } from 'react-router-dom';
import { exec, useDB, useLang } from '../data/store';
import { AGE_GROUPS, type AgeGroup } from '../data/types';
import { fmtRange, interpolate } from '../domain/format';
import { isValidIndianMobile, normalizePhone } from '../domain/phone';
import { uid } from '../lib/id';
import { Icon } from '../components/Icon';
import { LangToggle } from '../components/Shell';
import { Field, Toasts } from '../components/ui';
import { useT } from '../i18n';

/** Public-style QR registration page (no staff navigation). */
export function VisitorRegister() {
  const t = useT();
  const lang = useLang();
  const db = useDB();
  const events = db.events.filter((e) => e.status !== 'completed').sort((a, b) => a.startDate.localeCompare(b.startDate));
  const [f, setF] = useState({ name: '', phone: '', city: '', ageGroup: '' as AgeGroup | '', eventId: events[0]?.id ?? '', consent: false });
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string>();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const phoneErr = touched && !isValidIndianMobile(f.phone) ? t.exhibitors.invalidPhone : undefined;
  const nameErr = touched && !f.name.trim() ? t.common.required : undefined;
  const ageErr = touched && !f.ageGroup ? t.common.required : undefined;

  const submit = () => {
    setTouched(true);
    if (!f.name.trim() || !isValidIndianMobile(f.phone) || !f.ageGroup || !f.eventId) return;
    exec((d, now) => {
      d.visitors.push({ id: uid('vis'), eventId: f.eventId, name: f.name.trim(), phone: normalizePhone(f.phone), city: f.city.trim(), ageGroup: f.ageGroup as AgeGroup, consent: f.consent, createdAt: now, updatedAt: now });
    });
    setDone(f.name.trim());
  };

  const ev = db.events.find((e) => e.id === f.eventId);
  const count = db.visitors.filter((v) => v.eventId === f.eventId).length;

  return (
    <div className="min-h-dvh bg-bg">
      <div className="bg-tile px-4 pt-8 pb-16 text-white">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-white text-xl font-semibold text-black">P</span>
          <div className="flex-1">
            <p className="text-xl font-semibold">PAHRAVA</p>
            <p className="text-sm opacity-90">Exhibition & Lifestyle</p>
          </div>
          <div className="rounded-xl bg-surface p-0.5">
            <LangToggle compact />
          </div>
        </div>
      </div>
      <div className="mx-auto -mt-10 max-w-lg px-4 pb-10">
        <div className="card p-5">
          {done ? (
            <div className="space-y-4 py-6 text-center">
              <span className="st st-fully_paid mx-auto flex h-16 w-16 items-center justify-center rounded-full">
                <Icon name="check" size={32} />
              </span>
              <p className="text-xl font-semibold">{interpolate(t.visitors.thanks, { name: done, event: ev?.name ?? '' })}</p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setDone(undefined);
                  setTouched(false);
                  setF((x) => ({ ...x, name: '', phone: '', city: '', ageGroup: '', consent: false }));
                }}
              >
                {t.visitors.another}
              </button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div>
                <h1 className="text-2xl font-semibold">{t.visitors.title}</h1>
                <p className="text-muted">{t.visitors.subtitle}</p>
              </div>
              <Field label={t.visitors.event}>
                <select className="input" value={f.eventId} onChange={(e) => set('eventId', e.target.value)}>
                  {events.map((e) => {
                    const v = db.venues.find((x) => x.id === e.venueId);
                    return (
                      <option key={e.id} value={e.id}>
                        {v?.city} · {fmtRange(e.startDate, e.endDate, lang)} — {e.name}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label={`${t.visitors.name} *`} error={nameErr} htmlFor="v-name">
                <input id="v-name" className="input" autoComplete="name" value={f.name} aria-invalid={!!nameErr} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label={`${t.visitors.phone} *`} error={phoneErr} htmlFor="v-phone">
                <input id="v-phone" className="input tabular" inputMode="tel" autoComplete="tel" value={f.phone} aria-invalid={!!phoneErr} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label={t.visitors.city} htmlFor="v-city">
                <input id="v-city" className="input" value={f.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <div>
                <span className="label">{t.visitors.ageGroup} *</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.visitors.ageGroup}>
                  {AGE_GROUPS.map((a) => (
                    <button key={a} type="button" role="radio" aria-checked={f.ageGroup === a} className="chip min-h-[44px]" aria-pressed={f.ageGroup === a} onClick={() => set('ageGroup', a)}>
                      {t.ageGroup[a]}
                    </button>
                  ))}
                </div>
                {ageErr && <p className="mt-1 text-sm font-semibold text-danger">{ageErr}</p>}
              </div>
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl bg-surface-2 p-3">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--primary)]" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} />
                <span>{t.visitors.consent}</span>
              </label>
              <button type="submit" className="btn btn-primary w-full text-lg">
                {t.visitors.submit}
              </button>
            </form>
          )}
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-border p-3 text-sm text-muted">
          <p>
            {t.visitors.staffNote} <b className="tabular">{interpolate(t.visitors.count, { n: count })}</b>
          </p>
          <Link to={ev ? `/e/${ev.id}` : '/'} className="mt-2 inline-flex min-h-[44px] items-center gap-1 font-semibold text-text">
            <Icon name="chevronLeft" size={16} /> {t.nav.dashboard}
          </Link>
        </div>
      </div>
      <Toasts />
    </div>
  );
}
