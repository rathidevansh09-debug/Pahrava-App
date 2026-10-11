import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { setPrefs, useDB, useLang, useNow } from '../data/store';
import { STALL_STATUSES } from '../data/types';
import { eventSummary, indexDB } from '../domain/derive';
import { daysUntil, fmtCountdown, fmtDateTime, fmtRange, interpolate, money, toISODate } from '../domain/format';
import { EventForm } from './Events';
import { Icon } from '../components/Icon';
import { Timeline } from '../components/Timeline';
import { EmptyState, PageHeader, Stat } from '../components/ui';
import { useT } from '../i18n';
import { stallCode } from '../domain/stallcode';

export function Dashboard() {
  const { eventId = '' } = useParams();
  const t = useT();
  const lang = useLang();
  const db = useDB();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (eventId) setPrefs({ eventId });
  }, [eventId]);
  const event = db.events.find((e) => e.id === eventId);
  if (!event) return <EmptyState title={t.common.noEvent} action={<Link className="btn btn-primary" to="/">{t.nav.events}</Link>} />;

  const idx = indexDB(db);
  const venue = db.venues.find((v) => v.id === event.venueId);
  const s = eventSummary(db, eventId, now);
  const pct = s.expected ? Math.round((s.collected / s.expected) * 100) : 0;
  const days = daysUntil(event.startDate, now);
  const expiring = db.holds
    .filter((h) => h.eventId === eventId && h.status === 'active' && h.expiresAt > now && h.expiresAt - now < 24 * 3600_000)
    .sort((a, b) => a.expiresAt - b.expiresAt);
  const visitors = db.visitors.filter((v) => v.eventId === eventId).length;
  const today = toISODate(new Date(now));
  const callbacks = db.callLogs.filter((c) => !c.done && c.callbackDate && c.callbackDate <= today).length;
  const recent = db.activity.filter((a) => a.eventId === eventId).slice(-8).reverse();

  return (
    <div className="space-y-5">
      <PageHeader
        title={event.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>
              {venue?.name}, {venue?.city}
            </span>
            · <span>{fmtRange(event.startDate, event.endDate, lang)}</span>·<span className="tag">{t.eventStatus[event.status]}</span>
            {days > 0 && event.status !== 'completed' && <span className="font-semibold text-text">· {interpolate(t.dashboard.daysToGo, { n: days })}</span>}
            {days === 0 && <span className="font-semibold text-text">· {t.dashboard.today}</span>}
          </span>
        }
        actions={
          <>
            <button className="btn btn-sm" onClick={() => setEditing(true)}>
              <Icon name="edit" size={16} /> {t.common.edit}
            </button>
            <Link to={`/e/${eventId}/map`} className="btn btn-sm btn-primary">
              <Icon name="grid" size={16} /> {t.dashboard.openMap}
            </Link>
          </>
        }
      />

      {/* Stall status counts — tap to open the filtered map */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t.dashboard.totalStalls} value={s.total} />
        {STALL_STATUSES.map((st) => (
          <Link key={st} to={`/e/${eventId}/map?status=${st}`} className="card block p-4">
            <span className={`st st-${st} inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold`}>
              <Icon name={`st-${st}`} size={14} /> {t.status[st]}
            </span>
            <p className="tabular mt-2 text-2xl leading-tight font-semibold">{s.counts[st]}</p>
          </Link>
        ))}
      </div>

      {/* Money — one loud number (collected %), the rest stays quiet ink */}
      <section className="card grid gap-6 p-6 sm:p-8 lg:grid-cols-[auto_1fr] lg:items-center">
        <div className="text-center lg:border-r lg:border-border lg:pr-10">
          <p className="tabular text-[42px] leading-[1.1] font-normal">{pct}%</p>
          <p className="mt-1 text-sm font-semibold">{t.dashboard.collected}</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted">{t.dashboard.expected}</p>
            <p className="tabular mt-1 text-2xl leading-tight font-semibold">{money(s.expected)}</p>
          </div>
          <div>
            <p className="text-sm text-muted">{t.dashboard.collected}</p>
            <p className="tabular mt-1 text-2xl leading-tight font-semibold">{money(s.collected)}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t.dashboard.collected}>
              <div className="h-full rounded-full bg-text" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-sm text-muted">{interpolate(t.dashboard.collectedOf, { pct })}</p>
          </div>
          <div>
            <p className="text-sm text-muted">{t.dashboard.outstanding}</p>
            <p className="tabular mt-1 text-2xl leading-tight font-semibold text-danger">{money(s.outstanding)}</p>
            <Link to={`/e/${eventId}/ledger`} className="link mt-2 inline-flex min-h-[44px] items-center gap-1">
              {t.dashboard.openLedger} <Icon name="chevronRight" size={16} />
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Expiring holds */}
        <section className="card min-w-0 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Icon name="clock" /> {t.dashboard.expiringSoon}
            {expiring.length > 0 && <span className="st st-on_hold rounded-full border px-2 text-sm">{expiring.length}</span>}
          </h2>
          {expiring.length === 0 ? (
            <p className="text-muted">{t.dashboard.noExpiring}</p>
          ) : (
            <ul className="divide-y divide-border">
              {expiring.map((h) => {
                const ex = idx.exhibitorById.get(h.exhibitorId);
                const stall = idx.stallById.get(h.stallId);
                const type = stall && idx.typeById.get(stall.typeId);
                return (
                  <li key={h.id}>
                    <Link to={`/e/${eventId}/map?stall=${h.stallId}`} className="flex items-center gap-3 py-2">
                      <span className="st st-on_hold flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 text-base font-semibold">{stallCode(db, stall)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{ex?.ownerName} · {ex?.businessName}</span>
                        <span className="block text-sm text-muted">
                          {type?.name} {type?.size} · {fmtDateTime(h.expiresAt, lang)}
                        </span>
                      </span>
                      <span className="tabular rounded-lg bg-warn-soft px-2 py-1 font-semibold text-warn-text">{fmtCountdown(h.expiresAt - now)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Side stats */}
        <section className="grid min-w-0 content-start gap-3 sm:grid-cols-2">
          <Link to="/follow-ups" className="card block p-4">
            <p className="text-sm font-semibold text-muted">{t.dashboard.followUpsDue}</p>
            <p className="tabular mt-1 text-2xl leading-tight font-semibold">{callbacks}</p>
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold underline underline-offset-2">
              {t.nav.followUps} <Icon name="chevronRight" size={16} />
            </p>
          </Link>
          <Link to="/register" className="card block p-4">
            <p className="text-sm font-semibold text-muted">{t.dashboard.visitors}</p>
            <p className="tabular mt-1 text-2xl leading-tight font-semibold">{visitors}</p>
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
              <Icon name="qr" size={16} /> {t.nav.visitors}
            </p>
          </Link>
        </section>
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-lg font-semibold">{t.dashboard.recentActivity}</h2>
        {recent.length === 0 ? <p className="text-muted">{t.dashboard.noActivity}</p> : <Timeline items={recent} showExhibitor />}
      </section>

      {editing && <EventForm existing={event} onClose={() => setEditing(false)} />}
    </div>
  );
}
