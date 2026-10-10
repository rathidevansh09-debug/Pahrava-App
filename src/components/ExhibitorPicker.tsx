import { useState } from 'react';
import type { Exhibitor } from '../data/types';
import { formatPhone } from '../domain/phone';
import { tagLabel, useT } from '../i18n';
import { useExhibitorSearch } from '../lib/hooks';
import { ExhibitorForm } from './ExhibitorForm';
import { Icon } from './Icon';
import { Avatar } from './ui';

/** Search-as-you-type exhibitor chooser with a quick-add escape hatch. */
export function ExhibitorPicker({ onPick, autoFocus = true }: { onPick: (ex: Exhibitor) => void; autoFocus?: boolean }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const results = useExhibitorSearch(q, 6);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          className="input pl-10"
          type="search"
          data-autofocus={autoFocus || undefined}
          placeholder={t.exhibitors.searchPlaceholder}
          aria-label={t.exhibitors.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && results[0] && onPick(results[0])}
        />
      </div>
      {q.trim() && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {results.map((e) => (
            <li key={e.id}>
              <button className="flex w-full items-center gap-3 p-2 text-left hover:bg-surface-2" onClick={() => onPick(e)}>
                <Avatar name={e.ownerName} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.ownerName}</span>
                  <span className="block truncate text-sm text-muted">
                    {e.businessName}
                    {e.tags.includes('high_priority') && <span className="tag ml-2">{tagLabel(t, 'high_priority')}</span>}
                  </span>
                </span>
                <span className="tabular text-sm text-muted">{formatPhone(e.phone)}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="p-3 text-muted">{t.search.noResults}</li>}
        </ul>
      )}
      <button className="btn btn-sm w-full" onClick={() => setAdding(true)}>
        <Icon name="plus" size={16} /> {t.exhibitors.quickAdd}
      </button>
      {adding && (
        <ExhibitorForm
          quick
          initialQuery={q}
          onClose={() => setAdding(false)}
          onSaved={(ex) => {
            setAdding(false);
            onPick(ex);
          }}
        />
      )}
    </div>
  );
}
