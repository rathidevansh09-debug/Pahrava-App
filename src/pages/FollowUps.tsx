import { Link } from 'react-router-dom';
import { exec, useDB, useLang, useNow } from '../data/store';
import type { CallLog } from '../data/types';
import { setCallDone } from '../domain/exhibitors';
import { fmtDate, toISODate } from '../domain/format';
import { formatPhone } from '../domain/phone';
import { Icon } from '../components/Icon';
import { Avatar, EmptyState, PageHeader } from '../components/ui';
import { useT } from '../i18n';

export function FollowUps() {
  const t = useT();
  const lang = useLang();
  const db = useDB();
  const now = useNow();
  const today = toISODate(new Date(now));
  const open = db.callLogs.filter((c) => !c.done && c.callbackDate).sort((a, b) => a.callbackDate!.localeCompare(b.callbackDate!));
  const groups: [string, CallLog[], string][] = [
    [t.followUps.overdue, open.filter((c) => c.callbackDate! < today), 'text-danger'],
    [t.followUps.today, open.filter((c) => c.callbackDate === today), 'text-warn-text'],
    [t.followUps.upcoming, open.filter((c) => c.callbackDate! > today), 'text-muted'],
  ];

  return (
    <div>
      <PageHeader title={t.followUps.title} subtitle={t.followUps.subtitle} />
      {open.length === 0 ? (
        <EmptyState icon="followup" title={t.followUps.empty} hint={t.followUps.emptyHint} action={<Link to="/exhibitors" className="btn btn-primary">{t.nav.exhibitors}</Link>} />
      ) : (
        <div className="space-y-5">
          {groups.map(([title, list, tone]) =>
            list.length ? (
              <section key={title}>
                <h2 className={`mb-2 font-semibold ${tone}`}>
                  {title} ({list.length})
                </h2>
                <ul className="card divide-y divide-border">
                  {list.map((c) => {
                    const ex = db.exhibitors.find((e) => e.id === c.exhibitorId);
                    if (!ex) return null;
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                        <Link to={`/exhibitors/${ex.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                          <Avatar name={ex.ownerName} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">
                              {ex.ownerName} · <span className="text-muted">{ex.businessName}</span>
                            </span>
                            <span className="block truncate text-sm text-muted">
                              {fmtDate(c.callbackDate!, lang)} · {c.note || '—'}
                            </span>
                          </span>
                        </Link>
                        <a className="btn btn-sm" href={`tel:+91${ex.phone}`}>
                          <Icon name="phone" size={16} /> <span className="tabular">{formatPhone(ex.phone)}</span>
                        </a>
                        <button className="btn btn-sm" onClick={() => exec((d) => setCallDone(d, c.id, true))}>
                          <Icon name="check" size={16} /> {t.followUps.markDone}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
