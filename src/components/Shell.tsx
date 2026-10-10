import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { setPrefs, useStore, type Theme } from '../data/store';
import { LANGS, type Lang } from '../data/types';
import { useT } from '../i18n';
import { useCurrentEventId } from '../lib/hooks';
import { GlobalSearch } from './GlobalSearch';
import { Icon } from './Icon';
import { Sheet, Toasts } from './ui';

function useApplyTheme() {
  const theme = useStore((s) => s.prefs.theme);
  const lang = useStore((s) => s.prefs.lang);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
}

function useNavItems() {
  const t = useT();
  const eventId = useCurrentEventId();
  const ev = eventId ? `/e/${eventId}` : '/';
  return {
    primary: [
      { to: ev, end: true, icon: 'dashboard', label: t.nav.dashboard },
      { to: `${ev}/map`, icon: 'grid', label: t.nav.map },
      { to: '/exhibitors', icon: 'users', label: t.nav.exhibitors },
      { to: `${ev}/ledger`, icon: 'wallet', label: t.nav.ledger },
    ],
    secondary: [
      { to: '/follow-ups', icon: 'followup', label: t.nav.followUps },
      { to: '/broadcasts', icon: 'megaphone', label: t.nav.broadcasts },
      { to: '/whatsapp', icon: 'chat', label: t.nav.whatsapp },
      { to: '/', end: true, icon: 'calendar', label: t.nav.events },
      { to: `${ev}/layout`, icon: 'layout', label: t.nav.layout },
      { to: '/register', icon: 'qr', label: t.nav.visitors },
      { to: '/settings', icon: 'settings', label: t.nav.settings },
    ],
  };
}

export function LangToggle({ compact = false }: { compact?: boolean }) {
  const lang = useStore((s) => s.prefs.lang);
  const t = useT();
  const short: Record<Lang, string> = { en: 'EN', mr: 'मरा', hi: 'हिं' };
  return (
    <div role="radiogroup" aria-label={t.common.language} className="inline-flex rounded-full bg-[var(--divider)] p-0.5">
      {LANGS.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={lang === l}
          lang={l}
          onClick={() => setPrefs({ lang: l })}
          className={`min-h-[34px] min-w-[44px] rounded-full px-2.5 text-sm ${lang === l ? 'bg-surface font-semibold text-text ring-1 ring-[var(--border)]' : 'text-muted'}`}
        >
          {compact ? short[l] : t.langName[l]}
        </button>
      ))}
    </div>
  );
}

function ThemeToggle() {
  const theme = useStore((s) => s.prefs.theme);
  const t = useT();
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const label = { system: t.common.system, light: t.common.light, dark: t.common.dark }[theme];
  return (
    <button className="icon-btn gap-1 px-2" onClick={() => setPrefs({ theme: next[theme] })} aria-label={`${t.common.theme}: ${label}`} title={`${t.common.theme}: ${label}`}>
      <Icon name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'refresh'} />
    </button>
  );
}

function EventSwitcher() {
  const t = useT();
  const db = useStore((s) => s.db);
  const eventId = useCurrentEventId();
  const nav = useNavigate();
  const loc = useLocation();
  const events = [...db.events].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return (
    <select
      className="input w-full truncate font-semibold md:max-w-[300px]"
      aria-label={t.common.selectEvent}
      value={eventId ?? ''}
      onChange={(e) => {
        const id = e.target.value;
        setPrefs({ eventId: id });
        const m = loc.pathname.match(/^\/e\/[^/]+(\/.*)?$/);
        if (m) nav(`/e/${id}${m[1] ?? ''}`);
      }}
    >
      {events.map((e) => {
        const v = db.venues.find((x) => x.id === e.venueId);
        return (
          <option key={e.id} value={e.id}>
            {e.name} · {v?.city} {e.status === 'completed' ? `(${t.eventStatus.completed})` : ''}
          </option>
        );
      })}
    </select>
  );
}

function Brand() {
  const t = useT();
  return (
    <NavLink to="/" className="flex min-h-[44px] items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-text text-lg font-semibold text-bg">P</span>
      <span className="leading-tight">
        <span className="block text-[17px] font-semibold tracking-[0.04em]">{t.app.name}</span>
        <span className="hidden text-xs text-muted sm:block">{t.app.tagline}</span>
      </span>
    </NavLink>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  useApplyTheme();
  const t = useT();
  const { primary, secondary } = useNavItems();
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setMoreOpen(false);
    setSearchOpen(false);
  }, [loc.pathname]);

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-[44px] items-center gap-3 rounded-[11px] px-3 text-[15px] ${isActive ? 'bg-surface font-semibold text-text ring-1 ring-[var(--border)] [&>svg]:text-link' : 'text-text/80 hover:bg-surface/60 hover:text-text'}`;

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="frosted sticky top-0 z-30 border-b border-border">
        <div className="flex items-center gap-3 px-4 py-2">
          <Brand />
          <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
            <EventSwitcher />
            <div className="max-w-md flex-1">
              <GlobalSearch />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button className="icon-btn md:hidden" aria-label={t.common.search} onClick={() => setSearchOpen((v) => !v)}>
              <Icon name="search" />
            </button>
            <div className="hidden sm:block">
              <LangToggle />
            </div>
            <div className="sm:hidden">
              <LangToggle compact />
            </div>
            <ThemeToggle />
          </div>
        </div>
        {searchOpen && (
          <div className="px-4 pb-3 md:hidden">
            <GlobalSearch autoFocus onDone={() => setSearchOpen(false)} />
          </div>
        )}
        <div className="px-4 pb-2 md:hidden">
          <EventSwitcher />
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <nav className="sticky top-[61px] hidden h-[calc(100dvh-61px)] w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3 md:flex" aria-label={t.nav.menu}>
          {[...primary, ...secondary].map((i) => (
            <NavLink key={i.to + i.label} to={i.to} end={i.end} className={linkCls}>
              <Icon name={i.icon} />
              {i.label}
            </NavLink>
          ))}
          <p className="mt-auto px-3 pt-4 text-xs text-muted">
            {t.app.prototype} · v0.1
          </p>
        </nav>

        <main className="min-w-0 flex-1 px-4 pt-4 pb-28 md:px-6 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="frosted fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden" aria-label={t.nav.menu}>
        {primary.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={({ isActive }) => `flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] leading-tight font-semibold ${isActive ? 'text-link' : 'text-muted'}`}
          >
            <Icon name={i.icon} size={22} />
            <span className="max-w-full truncate px-1">{i.label}</span>
          </NavLink>
        ))}
        <button onClick={() => setMoreOpen(true)} className="flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] leading-tight font-semibold text-muted">
          <Icon name="menu" size={22} />
          {t.nav.more}
        </button>
      </nav>

      {moreOpen && (
        <Sheet title={t.nav.more} onClose={() => setMoreOpen(false)}>
          <div className="grid gap-1">
            {secondary.map((i) => (
              <NavLink key={i.to + i.label} to={i.to} end={i.end} className={linkCls}>
                <Icon name={i.icon} />
                {i.label}
              </NavLink>
            ))}
          </div>
        </Sheet>
      )}
      <Toasts />
    </div>
  );
}
