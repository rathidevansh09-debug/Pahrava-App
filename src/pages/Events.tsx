import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { exec, setPrefs, useDB, useLang, useNow } from '../data/store';
import { EVENT_STATUSES, STALL_STATUSES, type Event, type EventStatus } from '../data/types';
import { eventSummary } from '../domain/derive';
import { createEvent, createVenue, updateEvent, type EventInput } from '../domain/events';
import { fmtRange, interpolate, money } from '../domain/format';
import { Icon } from '../components/Icon';
import { EmptyState, Field, Modal, PageHeader, toast } from '../components/ui';
import { useT } from '../i18n';

export function Events() {
  const t = useT();
  const lang = useLang();
  const db = useDB();
  const now = useNow();
  const [form, setForm] = useState<{ existing?: Event } | null>(null);
  const upcoming = db.events.filter((e) => e.status !== 'completed').sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = db.events.filter((e) => e.status === 'completed').sort((a, b) => b.startDate.localeCompare(a.startDate));

  const card = (e: Event) => {
    const v = db.venues.find((x) => x.id === e.venueId);
    const s = eventSummary(db, e.id, now);
    return (
      <li key={e.id} className="card overflow-hidden">
        <Link to={`/e/${e.id}`} onClick={() => setPrefs({ eventId: e.id })} className="block p-4 hover:bg-surface-2">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">{e.name}</p>
              <p className="text-muted">
                {v?.name}, {v?.city} · {fmtRange(e.startDate, e.endDate, lang)}
              </p>
            </div>
            <span className="tag">{t.eventStatus[e.status]}</span>
          </div>
          {/* Stacked bar of stall statuses */}
          {s.total > 0 && (
            <div className="mt-3 flex h-3 overflow-hidden rounded-full" aria-hidden>
              {STALL_STATUSES.map((st) => (s.counts[st] ? <div key={st} className={`st st-${st}`} style={{ width: `${(s.counts[st] / s.total) * 100}%` }} /> : null))}
            </div>
          )}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              {s.total} {t.common.stalls}
            </span>
            <span>
              {t.status.available}: <b className="tabular">{s.counts.available}</b>
            </span>
            <span>
              {t.dashboard.collected}: <b className="tabular">{money(s.collected)}</b> / {money(s.expected)}
            </span>
          </p>
        </Link>
      </li>
    );
  };

  return (
    <div>
      <PageHeader
        title={t.events.title}
        actions={
          <button className="btn btn-primary" onClick={() => setForm({})}>
            <Icon name="plus" /> {t.events.new}
          </button>
        }
      />
      {db.events.length === 0 ? (
        <EmptyState icon="calendar" title={t.events.empty} hint={t.events.emptyHint} action={<button className="btn btn-primary" onClick={() => setForm({})}>{t.events.new}</button>} />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-bold text-muted">{t.events.upcoming}</h2>
            <ul className="grid gap-3 lg:grid-cols-2">{upcoming.map(card)}</ul>
          </section>
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 font-bold text-muted">{t.events.past}</h2>
              <ul className="grid gap-3 lg:grid-cols-2">{past.map(card)}</ul>
            </section>
          )}
        </div>
      )}
      {form && <EventForm existing={form.existing} onClose={() => setForm(null)} />}
    </div>
  );
}

export function EventForm({ existing, onClose }: { existing?: Event; onClose: () => void }) {
  const t = useT();
  const db = useDB();
  const nav = useNavigate();
  const [f, setF] = useState<EventInput>(() =>
    existing
      ? { ...existing }
      : {
          name: '',
          venueId: db.venues[0]?.id ?? '',
          startDate: '',
          endDate: '',
          status: 'planning',
          holdHours: db.settings.defaultHoldHours,
          dueWarningDays: 7,
          cornerSurcharge: 0,
          partnerSurcharge: 0,
        },
  );
  const [newVenue, setNewVenue] = useState({ name: '', city: '' });
  const [copyFrom, setCopyFrom] = useState('');
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const isNewVenue = f.venueId === '__new';
  const dateErr = touched && f.startDate && f.endDate && f.endDate < f.startDate ? t.events.endBeforeStart : undefined;
  const invalid = !f.name.trim() || !f.startDate || !f.endDate || f.endDate < f.startDate || (isNewVenue ? !newVenue.name.trim() : !f.venueId);

  const save = () => {
    setTouched(true);
    if (invalid) return;
    const id = exec((d, now) => {
      const venueId = isNewVenue ? createVenue(d, newVenue.name, newVenue.city, now).id : f.venueId;
      const input = { ...f, name: f.name.trim(), venueId };
      if (existing) {
        updateEvent(d, existing.id, input, now);
        return existing.id;
      }
      return createEvent(d, input, copyFrom || undefined, now).id;
    });
    toast(t.events.saved);
    onClose();
    if (!existing) {
      setPrefs({ eventId: id });
      nav(`/e/${id}`);
    }
  };

  const num = (k: 'holdHours' | 'dueWarningDays' | 'cornerSurcharge' | 'partnerSurcharge') => (
    <input className="input tabular" inputMode="numeric" value={String(f[k])} onChange={(e) => set(k, Number(e.target.value.replace(/\D/g, '')) || 0)} />
  );

  return (
    <Modal
      wide
      title={existing ? t.events.edit : t.events.new}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn btn-primary" onClick={save}>
            <Icon name="check" size={18} /> {t.common.save}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={`${t.events.name} *`} error={touched && !f.name.trim() ? t.common.required : undefined}>
            <input className="input" data-autofocus value={f.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
        </div>
        <Field label={t.events.venue}>
          <select className="input" value={f.venueId} onChange={(e) => set('venueId', e.target.value)}>
            {db.venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}, {v.city}
              </option>
            ))}
            <option value="__new">+ {t.events.newVenue}</option>
          </select>
        </Field>
        <Field label={t.events.status}>
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as EventStatus)}>
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.eventStatus[s]}
              </option>
            ))}
          </select>
        </Field>
        {isNewVenue && (
          <>
            <Field label={`${t.events.venueName} *`} error={touched && !newVenue.name.trim() ? t.common.required : undefined}>
              <input className="input" value={newVenue.name} onChange={(e) => setNewVenue((v) => ({ ...v, name: e.target.value }))} />
            </Field>
            <Field label={t.events.venueCity}>
              <input className="input" value={newVenue.city} onChange={(e) => setNewVenue((v) => ({ ...v, city: e.target.value }))} />
            </Field>
          </>
        )}
        <Field label={`${t.events.start} *`} error={touched && !f.startDate ? t.common.required : undefined}>
          <input type="date" className="input" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label={`${t.events.end} *`} error={dateErr ?? (touched && !f.endDate ? t.common.required : undefined)}>
          <input type="date" className="input" value={f.endDate} min={f.startDate} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
        <Field label={t.events.holdHours}>{num('holdHours')}</Field>
        <Field label={t.events.dueWarningDays}>{num('dueWarningDays')}</Field>
        <Field label={t.events.cornerSurcharge}>{num('cornerSurcharge')}</Field>
        <Field label={t.events.partnerSurcharge}>{num('partnerSurcharge')}</Field>
        {!existing && (
          <div className="sm:col-span-2">
            <Field label={`${t.events.copyLayout} (${t.common.optional})`} hint={copyFrom ? undefined : t.events.newEventFloors}>
              <select className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                <option value="">—</option>
                {db.events.map((e) => {
                  const v = db.venues.find((x) => x.id === e.venueId);
                  const n = db.stalls.filter((s) => s.eventId === e.id).length;
                  return (
                    <option key={e.id} value={e.id}>
                      {e.name} · {v?.name} ({interpolate('{n}', { n })} {t.common.stalls})
                    </option>
                  );
                })}
              </select>
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}
