import { Link } from 'react-router-dom';
import { useDB, useLang } from '../data/store';
import type { ActivityLog, CallOutcome, Lang, PayMode } from '../data/types';
import { fmtDateTime, interpolate, money } from '../domain/format';
import { useT, type Dict } from '../i18n';
import { Icon } from './Icon';

const KIND_ICON: Record<ActivityLog['kind'], string> = {
  exhibitor_created: 'user',
  exhibitor_updated: 'edit',
  hold_created: 'clock',
  hold_extended: 'clock',
  hold_expired: 'alert',
  hold_released: 'x',
  booking_confirmed: 'check',
  booking_cancelled: 'x',
  booking_updated: 'edit',
  payment_recorded: 'rupee',
  payment_link: 'link',
  call_logged: 'phone',
  message_sent: 'chat',
  message_received: 'chat',
  stall_added: 'plus',
  stall_removed: 'trash',
};

export function activityText(t: Dict, a: ActivityLog, lang: Lang) {
  const d = a.data;
  return interpolate(t.activity[a.kind], {
    ...d,
    until: typeof d.until === 'number' ? fmtDateTime(d.until, lang) : d.until,
    total: typeof d.total === 'number' ? money(d.total) : d.total,
    amount: typeof d.amount === 'number' ? money(d.amount) : d.amount,
    mode: d.mode ? t.payMode[d.mode as PayMode] : '',
    outcome: d.outcome ? t.callOutcome[d.outcome as CallOutcome] + (d.callback ? ` → ${d.callback}` : '') + (d.note ? ` — “${d.note}”` : '') : '',
    lang: d.lang ? t.langName[d.lang as Lang] : '',
  });
}

/** Activity list. `showExhibitor` adds the exhibitor name (for event-level feeds). */
export function Timeline({ items, showExhibitor }: { items: ActivityLog[]; showExhibitor?: boolean }) {
  const t = useT();
  const lang = useLang();
  const db = useDB();
  return (
    <ol className="space-y-0">
      {items.map((a, i) => {
        const ex = showExhibitor && a.exhibitorId ? db.exhibitors.find((e) => e.id === a.exhibitorId) : undefined;
        return (
          <li key={a.id} className="relative flex gap-3 pb-4">
            {i < items.length - 1 && <span className="absolute top-9 bottom-0 left-[17px] w-0.5 bg-border" aria-hidden />}
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                a.kind === 'payment_recorded' ? 'st st-fully_paid' : a.kind === 'hold_expired' || a.kind.endsWith('cancelled') ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-muted'
              }`}
            >
              <Icon name={KIND_ICON[a.kind]} size={16} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-[15px]">
                {ex && (
                  <Link to={`/exhibitors/${ex.id}`} className="font-semibold underline-offset-2 hover:underline">
                    {ex.ownerName}:{' '}
                  </Link>
                )}
                {activityText(t, a, lang)}
              </p>
              <p className="text-xs text-muted">
                {fmtDateTime(a.at, lang)} · {t.actor[a.actor]}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
