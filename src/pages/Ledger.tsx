import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { setPrefs, useDB, useLang, useNow } from '../data/store';
import type { StallStatus } from '../data/types';
import { bookingStatus, indexDB, paidFor } from '../domain/derive';
import { daysUntil, fmtRange, interpolate, money } from '../domain/format';
import { Icon } from '../components/Icon';
import { PaymentForm } from '../components/PaymentForm';
import { EmptyState, Modal, PageHeader, Segmented, StatusBadge } from '../components/ui';
import { useT } from '../i18n';
import { stallCode } from '../domain/stallcode';

type PayStatus = Exclude<StallStatus, 'available' | 'on_hold'>;

export function Ledger() {
  const { eventId = '' } = useParams();
  const t = useT();
  const lang = useLang();
  const db = useDB();
  const now = useNow();
  const [filter, setFilter] = useState<PayStatus | ''>('');
  const [sort, setSort] = useState<'due' | 'stall'>('due');
  const [paying, setPaying] = useState<string>();
  useEffect(() => {
    if (eventId) setPrefs({ eventId });
  }, [eventId]);

  const event = db.events.find((e) => e.id === eventId);
  const idx = indexDB(db);
  const rows = useMemo(() => {
    return db.bookings
      .filter((b) => b.eventId === eventId && b.status === 'active')
      .map((b) => {
        const paid = paidFor(db, b.id);
        const stall = idx.stallById.get(b.stallId)!;
        return { b, paid, due: b.total - paid, status: bookingStatus(b.total, paid), stall, code: stallCode(db, stall), type: idx.typeById.get(stall?.typeId), ex: idx.exhibitorById.get(b.exhibitorId) };
      });
  }, [db, eventId, idx]);

  if (!event) return <EmptyState title={t.common.noEvent} action={<Link className="btn btn-primary" to="/">{t.nav.events}</Link>} />;

  const daysLeft = daysUntil(event.startDate, now);
  const urgentWindow = event.status !== 'completed' && daysLeft <= event.dueWarningDays;
  const shown = rows
    .filter((r) => !filter || r.status === filter)
    .sort((a, b) => (sort === 'due' ? b.due - a.due : a.code.localeCompare(b.code, undefined, { numeric: true })));
  const totals = shown.reduce((s, r) => ({ total: s.total + r.b.total, paid: s.paid + r.paid, due: s.due + r.due }), { total: 0, paid: 0, due: 0 });
  const counts = { booked_unpaid: 0, partly_paid: 0, fully_paid: 0 } as Record<PayStatus, number>;
  rows.forEach((r) => counts[r.status]++);
  const payingRow = rows.find((r) => r.b.id === paying);

  return (
    <div>
      <PageHeader title={t.ledger.title} subtitle={`${event.name} · ${fmtRange(event.startDate, event.endDate, lang)} · ${interpolate(t.ledger.bookings, { n: rows.length })}`} />

      {urgentWindow && totals.due > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-warn-soft p-3 font-semibold text-warn-text">
          <Icon name="alert" /> {interpolate(t.ledger.dueSoon, { n: event.dueWarningDays })} · {interpolate(t.dashboard.daysToGo, { n: Math.max(0, daysLeft) })}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button className="chip" aria-pressed={!filter} onClick={() => setFilter('')}>
            {t.common.all} <span className="tabular text-muted">{rows.length}</span>
          </button>
          {(['booked_unpaid', 'partly_paid', 'fully_paid'] as PayStatus[]).map((s) => (
            <button key={s} className="chip" aria-pressed={filter === s} onClick={() => setFilter(filter === s ? '' : s)}>
              <Icon name={`st-${s}`} size={14} /> {t.status[s]} <span className="tabular text-muted">{counts[s]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'due', label: t.ledger.sortDue },
              { value: 'stall', label: t.ledger.sortStall },
            ]}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="wallet" title={t.ledger.empty} hint={t.ledger.emptyHint} action={<Link to={`/e/${eventId}/map`} className="btn btn-primary">{t.dashboard.openMap}</Link>} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead className="border-b border-border text-sm text-muted">
                <tr>
                  <th className="p-3">{t.ledger.stall}</th>
                  <th className="p-3">{t.ledger.exhibitor}</th>
                  <th className="p-3">{t.ledger.status}</th>
                  <th className="p-3 text-right">{t.ledger.total}</th>
                  <th className="p-3 text-right">{t.ledger.paid}</th>
                  <th className="p-3 text-right">{t.ledger.due}</th>
                  <th className="p-3">
                    <span className="sr-only">{t.common.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r) => {
                  const urgent = urgentWindow && r.due > 0;
                  return (
                    <tr key={r.b.id} className={urgent ? 'bg-warn-soft' : ''}>
                      <td className="p-3">
                        <Link to={`/e/${eventId}/map?stall=${r.stall.id}`} className="font-semibold underline-offset-2 hover:underline">
                          #{r.code}
                        </Link>
                        <span className="block text-xs text-muted">
                          {r.type?.name} {r.type?.size}
                        </span>
                      </td>
                      <td className="p-3">
                        <Link to={`/exhibitors/${r.ex?.id}`} className="font-semibold underline-offset-2 hover:underline">
                          {r.ex?.ownerName}
                        </Link>
                        <span className="block text-sm text-muted">{r.ex?.businessName}</span>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="tabular p-3 text-right">
                        {money(r.b.total)}
                        {r.b.discount > 0 && <span className="block text-xs text-muted">{interpolate(t.ledger.discountNote, { amount: money(r.b.discount), reason: r.b.discountReason ?? '' })}</span>}
                      </td>
                      <td className="tabular p-3 text-right">{money(r.paid)}</td>
                      <td className={`tabular p-3 text-right font-semibold ${r.due > 0 ? 'text-warn-text' : ''}`}>
                        {urgent && <Icon name="alert" size={14} className="mr-1 inline" label={interpolate(t.ledger.dueSoon, { n: event.dueWarningDays })} />}
                        {money(r.due)}
                      </td>
                      <td className="p-3 text-right">
                        {r.due > 0 && event.status !== 'completed' && (
                          <button className="btn btn-sm" onClick={() => setPaying(r.b.id)}>
                            <Icon name="rupee" size={16} /> {t.stall.recordPayment}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold">
                <tr>
                  <td className="p-3" colSpan={3}>
                    {t.ledger.totals} ({shown.length})
                  </td>
                  <td className="tabular p-3 text-right">{money(totals.total)}</td>
                  <td className="tabular p-3 text-right">{money(totals.paid)}</td>
                  <td className="tabular p-3 text-right">{money(totals.due)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            <div className="card grid grid-cols-3 gap-2 p-3 text-center">
              <div>
                <p className="text-xs text-muted">{t.ledger.total}</p>
                <p className="tabular font-semibold">{money(totals.total)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">{t.ledger.paid}</p>
                <p className="tabular font-semibold">{money(totals.paid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">{t.ledger.due}</p>
                <p className="tabular font-semibold text-warn-text">{money(totals.due)}</p>
              </div>
            </div>
            {shown.map((r) => {
              const urgent = urgentWindow && r.due > 0;
              return (
                <div key={r.b.id} className={`card p-3 ${urgent ? 'bg-warn-soft' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className={`st st-${r.status} flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 text-sm font-semibold`}>{r.code}</span>
                    <div className="min-w-0 flex-1">
                      <Link to={`/exhibitors/${r.ex?.id}`} className="block truncate font-semibold">
                        {r.ex?.ownerName}
                      </Link>
                      <p className="truncate text-sm text-muted">{r.ex?.businessName}</p>
                      <StatusBadge status={r.status} short className="mt-1 text-xs" />
                    </div>
                    <div className="text-right">
                      <p className="tabular text-sm text-muted">
                        {money(r.paid)} / {money(r.b.total)}
                      </p>
                      <p className={`tabular text-lg font-semibold ${r.due > 0 ? 'text-warn-text' : ''}`}>{money(r.due)}</p>
                    </div>
                  </div>
                  {r.due > 0 && event.status !== 'completed' && (
                    <button className="btn btn-sm mt-2 w-full" onClick={() => setPaying(r.b.id)}>
                      <Icon name="rupee" size={16} /> {t.stall.recordPayment}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {payingRow && (
        <Modal title={`${t.payment.title} · #${payingRow.code} · ${payingRow.ex?.ownerName}`} onClose={() => setPaying(undefined)}>
          <PaymentForm bookingId={payingRow.b.id} due={payingRow.due} onDone={() => setPaying(undefined)} onCancel={() => setPaying(undefined)} />
        </Modal>
      )}
    </div>
  );
}
