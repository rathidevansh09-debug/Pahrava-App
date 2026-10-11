import { CLOUD } from '../data/cloud-config';
import { useDataMode, type DataMode } from '../data/store';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { toast } from './ui';

async function switchTo(mode: DataMode, waitText: string) {
  const ok = (await import('../data/cloud')).switchDataMode(mode);
  if (!ok) return toast(waitText, 'error');
  // Demo and live events have different ids: leave event pages for the events list.
  if (window.location.hash.startsWith('#/e/') || window.location.hash.startsWith('#/exhibitors/')) window.location.hash = '#/';
}

/** Demo | Live segmented switch. Only with the shared database. */
export function DataModeSwitch() {
  const t = useT();
  const mode = useDataMode();
  if (!CLOUD) return null;
  return (
    <div role="radiogroup" aria-label={t.mode.label} className="inline-flex rounded-[10px] bg-neutral p-0.5">
      {(['demo', 'live'] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => mode !== m && void switchTo(m, t.mode.wait)}
          className={`min-h-[36px] rounded-lg px-3 text-sm md:min-h-[28px] md:text-[13px] ${mode === m ? `font-semibold shadow-[var(--float)] ${m === 'demo' ? 'bg-warn-soft text-warn-text' : 'bg-surface text-text'}` : 'text-muted hover:text-text'}`}
        >
          {m === 'demo' ? t.mode.demo : t.mode.live}
        </button>
      ))}
    </div>
  );
}

/** Banner under the header while showing demo data. */
export function DemoBanner() {
  const t = useT();
  const mode = useDataMode();
  if (!CLOUD || mode !== 'demo') return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--st-hold-border)] bg-warn-soft px-4 py-2 text-sm font-semibold text-warn-text" role="note">
      <Icon name="info" size={16} />
      <span className="min-w-0 flex-1">{t.mode.banner}</span>
      <button className="underline underline-offset-2" onClick={() => void switchTo('live', t.mode.wait)}>
        {t.mode.switchLive}
      </button>
    </div>
  );
}
