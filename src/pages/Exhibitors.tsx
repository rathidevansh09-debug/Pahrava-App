import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { exec, useDB } from '../data/store';
import { CATEGORIES, DEFAULT_TAGS, LANGS, type Category, type Lang } from '../data/types';
import { applyImport, buildImport, exportCsv, guessMapping, IMPORT_FIELDS, parseCsv, type ImportField, type ImportRow, type Mapping } from '../domain/csv';
import { interpolate } from '../domain/format';
import { formatPhone } from '../domain/phone';
import { ExhibitorForm } from '../components/ExhibitorForm';
import { Icon } from '../components/Icon';
import { Avatar, EmptyState, Field, Modal, PageHeader, Segmented, toast } from '../components/ui';
import { tagLabel, useT, type Dict } from '../i18n';
import { matchExhibitor } from '../lib/hooks';

function download(name: string, text: string) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Exhibitors() {
  const t = useT();
  const db = useDB();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | ''>('');
  const [lang, setLang] = useState<Lang | ''>('');
  const [tag, setTag] = useState('');
  const [importing, setImporting] = useState(false);
  const newQuery = params.get('new');
  const [adding, setAdding] = useState(newQuery !== null);

  const list = useMemo(
    () =>
      db.exhibitors
        .filter((e) => matchExhibitor(e, q) && (!cat || e.category === cat) && (!lang || e.language === lang) && (!tag || e.tags.includes(tag)))
        .sort((a, b) => a.ownerName.localeCompare(b.ownerName)),
    [db.exhibitors, q, cat, lang, tag],
  );
  const allTags = Array.from(new Set([...DEFAULT_TAGS, ...db.settings.customTags, ...db.exhibitors.flatMap((e) => e.tags)]));
  const filtered = !!(q || cat || lang || tag);

  // Group alphabetically like a phone's contact list
  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const e of list) {
      const k = e.ownerName[0]?.toUpperCase() ?? '#';
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [list]);

  return (
    <div>
      <PageHeader
        title={t.exhibitors.title}
        subtitle={interpolate(t.exhibitors.count, { n: list.length })}
        actions={
          <>
            <button className="btn btn-sm" onClick={() => setImporting(true)}>
              <Icon name="upload" size={16} /> {t.common.import}
            </button>
            <button className="btn btn-sm" onClick={() => download(`pahrava-exhibitors-${new Date().toISOString().slice(0, 10)}.csv`, exportCsv(list))} disabled={!list.length}>
              <Icon name="download" size={16} /> {t.common.export}
            </button>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Icon name="plus" /> {t.exhibitors.add}
            </button>
          </>
        }
      />

      <div className="sticky top-[118px] z-10 -mx-4 mb-3 space-y-2 bg-bg px-4 py-2 md:top-[61px] md:-mx-6 md:px-6">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input className="input pl-10 text-lg" type="search" inputMode="search" placeholder={t.exhibitors.searchPlaceholder} aria-label={t.exhibitors.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <select className="input w-auto shrink-0" aria-label={t.exhibitors.category} value={cat} onChange={(e) => setCat(e.target.value as Category | '')}>
            <option value="">
              {t.exhibitors.category}: {t.common.all}
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.category[c]}
              </option>
            ))}
          </select>
          <select className="input w-auto shrink-0" aria-label={t.exhibitors.language} value={lang} onChange={(e) => setLang(e.target.value as Lang | '')}>
            <option value="">
              {t.common.language}: {t.common.all}
            </option>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t.langName[l]}
              </option>
            ))}
          </select>
          <select className="input w-auto shrink-0" aria-label={t.exhibitors.tags} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">
              {t.exhibitors.tags}: {t.common.all}
            </option>
            {allTags.map((x) => (
              <option key={x} value={x}>
                {tagLabel(t, x)}
              </option>
            ))}
          </select>
          {filtered && (
            <button
              className="btn btn-sm btn-ghost shrink-0"
              onClick={() => {
                setQ('');
                setCat('');
                setLang('');
                setTag('');
              }}
            >
              <Icon name="x" size={16} /> {t.common.clear}
            </button>
          )}
        </div>
      </div>

      {db.exhibitors.length === 0 ? (
        <EmptyState icon="users" title={t.exhibitors.empty} hint={t.exhibitors.emptyHint} action={<button className="btn btn-primary" onClick={() => setAdding(true)}>{t.exhibitors.add}</button>} />
      ) : list.length === 0 ? (
        <EmptyState icon="search" title={t.exhibitors.noMatch} hint={t.exhibitors.noMatchHint} action={<button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> {t.exhibitors.add}</button>} />
      ) : (
        <div className="card overflow-hidden">
          {groups.map(([letter, items]) => (
            <section key={letter}>
              <h2 className="sticky top-0 bg-surface-2 px-4 py-1 text-sm font-bold text-muted">{letter}</h2>
              <ul className="divide-y divide-border">
                {items.map((e) => (
                  <li key={e.id}>
                    <Link to={`/exhibitors/${e.id}`} className="flex min-h-[64px] items-center gap-3 px-4 py-2 hover:bg-surface-2">
                      <Avatar name={e.ownerName} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{e.ownerName}</span>
                        <span className="block truncate text-sm text-muted">
                          {e.businessName} · {t.category[e.category]}
                        </span>
                      </span>
                      <span className="hidden flex-wrap justify-end gap-1 sm:flex">
                        {e.tags.slice(0, 2).map((x) => (
                          <span key={x} className="tag">
                            {tagLabel(t, x)}
                          </span>
                        ))}
                      </span>
                      <span className="text-right">
                        <span className="tabular block text-sm font-semibold">{formatPhone(e.phone)}</span>
                        <span className="block text-xs text-muted" lang={e.language}>
                          {t.langName[e.language]}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {adding && (
        <ExhibitorForm
          initialQuery={newQuery ?? ''}
          onClose={() => {
            setAdding(false);
            if (newQuery !== null) setParams({}, { replace: true });
          }}
          onSaved={(ex) => {
            setAdding(false);
            nav(`/exhibitors/${ex.id}`);
          }}
        />
      )}
      {importing && <CsvImport onClose={() => setImporting(false)} />}
    </div>
  );
}

const FIELD_LABEL = (t: Dict, f: ImportField) =>
  ({
    ownerName: t.exhibitors.ownerName,
    businessName: t.exhibitors.businessName,
    phone: `${t.exhibitors.mobile} *`,
    altPhone: t.exhibitors.altMobile,
    category: t.exhibitors.category,
    language: t.exhibitors.language,
    city: t.exhibitors.city,
    tags: t.exhibitors.tags,
    source: t.exhibitors.source,
    consent: t.exhibitors.consent,
    notes: t.exhibitors.notes,
  })[f];

const SAMPLE = `Owner name,Business name,Mobile,City,Category,Language,Tags,Consent,Notes
Sample Person,Sample Sarees,98220 12345,Nashik,Fashion,Marathi,Repeat exhibitor,Yes,Met at Diwali 2025
`;

function CsvImport({ onClose }: { onClose: () => void }) {
  const t = useT();
  const db = useDB();
  const [file, setFile] = useState<{ headers: string[]; rows: Record<string, string>[] }>();
  const [mapping, setMapping] = useState<Mapping>({});
  const [dupMode, setDupMode] = useState<'merge' | 'skip'>('merge');
  const plan: ImportRow[] = useMemo(() => (file ? buildImport(db, file.rows, mapping) : []), [db, file, mapping]);
  const dup = plan.filter((r) => r.duplicateOf).length;
  const bad = plan.filter((r) => r.error).length;

  const onFile = async (f: File) => {
    const parsed = parseCsv(await f.text());
    setFile(parsed);
    setMapping(guessMapping(parsed.headers));
  };

  const run = () => {
    const r = exec((d, now) => applyImport(d, buildImport(d, file!.rows, mapping), dupMode, now));
    toast(interpolate(t.csv.result, r));
    onClose();
  };

  return (
    <Modal
      wide
      title={t.csv.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn btn-primary" disabled={!file || !mapping.phone} onClick={run}>
            <Icon name="upload" size={18} /> {t.csv.run}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-muted">{t.csv.hint}</p>
        <div className="flex flex-wrap gap-2">
          <label className="btn btn-primary cursor-pointer">
            <Icon name="upload" size={18} /> {t.csv.choose}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <button className="btn" onClick={() => download('pahrava-sample.csv', SAMPLE)}>
            <Icon name="download" size={18} /> {t.csv.sample}
          </button>
        </div>
        {file && (
          <>
            <div>
              <h3 className="mb-2 font-bold">{t.csv.mapping}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {IMPORT_FIELDS.map((f) => (
                  <Field key={f} label={FIELD_LABEL(t, f)}>
                    <select className="input" value={mapping[f] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))}>
                      <option value="">{t.csv.skipColumn}</option>
                      {file.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </div>
            <p className="rounded-xl bg-surface-2 p-3 font-semibold">{interpolate(t.csv.preview, { n: plan.length, ok: plan.length - dup - bad, dup, bad })}</p>
            {dup > 0 && (
              <div>
                <span className="label">{t.csv.duplicates}</span>
                <Segmented
                  value={dupMode}
                  onChange={setDupMode}
                  options={[
                    { value: 'merge', label: t.csv.merge },
                    { value: 'skip', label: t.csv.skip },
                  ]}
                />
              </div>
            )}
            {(bad > 0 || dup > 0) && (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                {plan
                  .filter((r) => r.error || r.duplicateOf)
                  .map((r) => (
                    <li key={r.line} className={r.error ? 'text-danger' : 'text-muted'}>
                      {interpolate(t.csv.rowError, {
                        line: r.line,
                        error: r.error === 'invalid_phone' ? `${t.csv.badPhone} (${r.data.phone || '—'})` : r.error === 'missing_name' ? t.csv.missingName : `${t.csv.duplicate} — ${db.exhibitors.find((e) => e.id === r.duplicateOf)?.ownerName ?? r.duplicateOf}`,
                      })}
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
