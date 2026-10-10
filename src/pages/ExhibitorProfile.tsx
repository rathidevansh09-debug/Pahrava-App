import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { exec, useDB, useLang, useNow } from '../data/store';
import { CALL_OUTCOMES, type CallOutcome } from '../data/types';
import { exhibitorTotals, paidFor, stallState } from '../domain/derive';
import { deleteExhibitor, logCall } from '../domain/exhibitors';
import { fmtDate, fmtRange, interpolate, money, toISODate } from '../domain/format';
import { formatPhone } from '../domain/phone';
import { ExhibitorForm } from '../components/ExhibitorForm';
import { Icon } from '../components/Icon';
import { Timeline } from '../components/Timeline';
import { Avatar, ConfirmDialog, EmptyState, Field, Modal, Segmented, StatusBadge, toast } from '../components/ui';
import { tagLabel, useT } from '../i18n';
import { errorText, useCurrentEventId } from '../lib/hooks';
import { stallCode } from '../domain/stallcode';

export function ExhibitorProfile() {
  const { id = '' } = useParams();
  const t = useT();
  const lang = useLang();
  const db = useDB();
  const now = useNow();
  const nav = useNavigate();
  const currentEventId = useCurrentEventId();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [calling, setCalling] = useState(false);
  const ex = db.exhibitors.find((e) => e.id === id);
  if (!ex) return <EmptyState icon="users" title={t.search.noResults} action={<Link className="btn btn-primary" to="/exhibitors">{t.nav.exhibitors}</Link>} />;

  const totals = exhibitorTotals(db, ex.id);
  const bookings = db.bookings.filter((b) => b.exhibitorId === ex.id).sort((a, b) => b.createdAt - a.createdAt);
  const activeHolds = db.holds.filter((h) => h.exhibitorId === ex.id && h.status === 'active' && h.expiresAt > now);
  const timeline = db.activity.filter((a) => a.exhibitorId === ex.id).slice().reverse();
  const openCallback = db.callLogs.find((c) => c.exhibitorId === ex.id && !c.done);
  const waNumber = `91${ex.phone}`;

  return (
    <div className="space-y-4">
      <button className="btn btn-sm btn-ghost -ml-2" onClick={() => nav(-1)}>
        <Icon name="chevronLeft" size={18} /> {t.common.back}
      </button>

      {/* Contact card */}
      <section className="card min-w-0 p-4">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={ex.ownerName} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">{ex.ownerName}</h1>
            <p className="text-lg text-muted">{ex.businessName}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              <span className="tabular font-semibold">{formatPhone(ex.phone)}</span>
              {ex.altPhone && <span className="tabular text-muted">{formatPhone(ex.altPhone)}</span>}
              <span>{t.category[ex.category]}</span>
              {ex.city && <span>{ex.city}</span>}
              <span lang={ex.language}>{t.langName[ex.language]}</span>
              <span className="text-muted">
                {t.exhibitors.source}: {t.source[ex.source]}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {ex.consent ? (
                <span className="tag">
                  <Icon name="check" size={12} className="mr-1" /> {t.exhibitors.consent} · {ex.consentDate && fmtDate(ex.consentDate, lang)}
                </span>
              ) : (
                <span className="tag bg-danger-soft text-danger">{t.exhibitors.noConsent}</span>
              )}
              {ex.tags.map((x) => (
                <span key={x} className="tag">
                  {tagLabel(t, x)}
                </span>
              ))}
            </div>
          </div>
        </div>
        {ex.notes && <p className="mt-3 rounded-xl bg-surface-2 p-3 whitespace-pre-line">{ex.notes}</p>}
        {openCallback && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-warn-soft p-3 font-semibold text-warn-text">
            <Icon name="followup" /> {t.callOutcome.call_back}: {openCallback.callbackDate && fmtDate(openCallback.callbackDate, lang)} — {openCallback.note}
          </p>
        )}

        {/* Quick actions */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <a className="btn" href={`tel:+${waNumber}`}>
            <Icon name="phone" /> {t.exhibitors.call}
          </a>
          <a className="btn" href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer">
            <Icon name="chat" /> {t.exhibitors.whatsapp}
          </a>
          <button className="btn btn-primary" onClick={() => setCalling(true)}>
            <Icon name="phone" /> {t.exhibitors.logCall}
          </button>
          {currentEventId && (
            <Link className="btn" to={`/e/${currentEventId}/map?status=available&for=${ex.id}`}>
              <Icon name="grid" /> {t.exhibitors.holdStall}
            </Link>
          )}
          <button className="btn" onClick={() => setEditing(true)}>
            <Icon name="edit" /> {t.common.edit}
          </button>
          <button className="btn btn-danger" onClick={() => setDeleting(true)}>
            <Icon name="trash" /> {t.common.delete}
          </button>
        </div>
      </section>

      {/* Money */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-sm font-semibold text-muted">{t.exhibitors.lifetimePaid}</p>
          <p className="tabular mt-1 text-2xl font-semibold">{money(totals.paid)}</p>
        </div>
        <div className={`card p-4 ${totals.outstanding > 0 ? 'bg-warn-soft' : ''}`}>
          <p className="text-sm font-semibold text-muted">{t.exhibitors.outstanding}</p>
          <p className={`tabular mt-1 text-2xl font-semibold ${totals.outstanding > 0 ? 'text-warn-text' : ''}`}>{money(totals.outstanding)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Events & stalls */}
        <section className="card min-w-0 p-4">
          <h2 className="mb-3 text-lg font-semibold">{t.exhibitors.pastEvents}</h2>
          {bookings.length === 0 && activeHolds.length === 0 ? (
            <p className="text-muted">{t.exhibitors.noBookings}</p>
          ) : (
            <ul className="divide-y divide-border">
              {activeHolds.map((h) => {
                const ev = db.events.find((e) => e.id === h.eventId)!;
                const s = db.stalls.find((x) => x.id === h.stallId);
                const ty = db.stallTypes.find((x) => x.id === s?.typeId);
                return (
                  <li key={h.id}>
                    <Link to={`/e/${ev.id}/map?stall=${h.stallId}`} className="flex items-center gap-3 py-2">
                      <span className="st st-on_hold flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 text-sm font-semibold">{stallCode(db, s)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{ev.name}</span>
                        <span className="block text-sm text-muted">
                          {ty?.name} {ty?.size}
                        </span>
                      </span>
                      <StatusBadge status="on_hold" short />
                    </Link>
                  </li>
                );
              })}
              {bookings.map((b) => {
                const ev = db.events.find((e) => e.id === b.eventId)!;
                const s = db.stalls.find((x) => x.id === b.stallId);
                const ty = db.stallTypes.find((x) => x.id === s?.typeId);
                const paid = paidFor(db, b.id);
                const status = b.status === 'active' ? stallState(db, b.stallId, now).status : undefined;
                return (
                  <li key={b.id}>
                    <Link to={`/e/${ev.id}/map?stall=${b.stallId}`} className={`flex items-center gap-3 py-2 ${b.status === 'cancelled' ? 'opacity-60' : ''}`}>
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 font-semibold ${status ? `st st-${status}` : 'border-border'}`}>{stallCode(db, s)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{ev.name}</span>
                        <span className="block text-sm text-muted">
                          {fmtRange(ev.startDate, ev.endDate, lang)} · {ty?.name} {ty?.size}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="tabular block text-sm font-semibold">
                          {money(paid)} / {money(b.total)}
                        </span>
                        {status ? <StatusBadge status={status} short className="mt-0.5 text-xs" /> : <span className="tag">{t.exhibitors.cancelled}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Timeline */}
        <section className="card min-w-0 p-4">
          <h2 className="mb-3 text-lg font-semibold">{t.exhibitors.timeline}</h2>
          {timeline.length === 0 ? <p className="text-muted">{t.exhibitors.noActivity}</p> : <Timeline items={timeline} />}
        </section>
      </div>

      {editing && <ExhibitorForm existing={ex} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      {calling && <LogCall exhibitorId={ex.id} eventId={currentEventId} onClose={() => setCalling(false)} />}
      {deleting && (
        <ConfirmDialog
          title={t.exhibitors.deleteTitle}
          body={<p>{interpolate(t.exhibitors.deleteBody, { name: ex.ownerName })}</p>}
          confirmLabel={t.common.delete}
          onClose={() => setDeleting(false)}
          onConfirm={() => {
            const r = exec((d, n) => deleteExhibitor(d, ex.id, n));
            if (!r.ok) return toast(r.error === 'has_claims' ? t.exhibitors.hasClaims : errorText(t, r.error), 'error');
            toast(t.exhibitors.deleted);
            nav('/exhibitors');
          }}
        />
      )}
    </div>
  );
}

export function LogCall({ exhibitorId, eventId, onClose }: { exhibitorId: string; eventId?: string; onClose: () => void }) {
  const t = useT();
  const [outcome, setOutcome] = useState<CallOutcome>('interested');
  const tomorrow = toISODate(new Date(Date.now() + 86400_000));
  const [date, setDate] = useState(tomorrow);
  const [note, setNote] = useState('');
  const save = () => {
    exec((d, n) => logCall(d, { exhibitorId, eventId, outcome, callbackDate: outcome === 'call_back' ? date : undefined, note }, n));
    toast(t.exhibitors.callLogged);
    onClose();
  };
  return (
    <Modal
      title={t.exhibitors.logCall}
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
      <div className="space-y-4">
        <div>
          <span className="label">{t.exhibitors.outcome}</span>
          <Segmented<CallOutcome> label={t.exhibitors.outcome} value={outcome} onChange={setOutcome} options={CALL_OUTCOMES.map((o) => ({ value: o, label: t.callOutcome[o] }))} />
        </div>
        {outcome === 'call_back' && (
          <Field label={t.exhibitors.callbackOn}>
            <input type="date" className="input" value={date} min={toISODate(new Date())} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        <Field label={t.common.notes}>
          <textarea className="input" data-autofocus value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
