import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatPhone } from '../domain/phone';
import { useT } from '../i18n';
import { useExhibitorSearch } from '../lib/hooks';
import { Icon } from './Icon';
import { Avatar } from './ui';

/** Header search: type a phone number or name, tap the result to open the profile. */
export function GlobalSearch({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const t = useT();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useExhibitorSearch(q, 8);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // "/" focuses search from anywhere (desktop)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        e.preventDefault();
        ref.current?.querySelector('input')?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const go = (id: string) => {
    nav(`/exhibitors/${id}`);
    setQ('');
    setOpen(false);
    onDone?.();
  };

  const show = open && q.trim().length > 0;

  return (
    <div ref={ref} className="relative w-full">
      {/* Pill search terminated by the Rausch search orb */}
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-white">
        <Icon name="search" size={18} />
      </span>
      <input
        className="input pr-12 [&::-webkit-search-cancel-button]:hidden"
        type="search"
        inputMode="search"
        autoFocus={autoFocus}
        placeholder={t.search.placeholder}
        aria-label={t.search.placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          if (e.key === 'Enter' && results[active]) go(results[active].id);
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {show && (
        <div className="card absolute inset-x-0 top-full z-30 mt-2 max-h-[60vh] overflow-y-auto p-1 shadow-[var(--float)]">
          {results.length === 0 ? (
            <div className="p-3">
              <p className="text-muted">{t.search.noResults}</p>
              <button
                className="btn btn-sm mt-2"
                onClick={() => {
                  nav(`/exhibitors?new=${encodeURIComponent(q)}`);
                  setQ('');
                  setOpen(false);
                  onDone?.();
                }}
              >
                <Icon name="plus" size={16} /> {t.search.addNew}
              </button>
            </div>
          ) : (
            results.map((e, i) => (
              <button
                key={e.id}
                onClick={() => go(e.id)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 rounded-lg p-2 text-left ${i === active ? 'bg-surface-2' : ''}`}
              >
                <Avatar name={e.ownerName} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.ownerName}</span>
                  <span className="block truncate text-sm text-muted">{e.businessName}</span>
                </span>
                <span className="tabular text-sm text-muted">{formatPhone(e.phone)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
