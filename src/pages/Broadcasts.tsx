import { useMemo, useState } from 'react';
import { exec, useDB, useLang } from '../data/store';
import { CATEGORIES, DEFAULT_TAGS, LANGS, type Broadcast, type BroadcastFilters, type Lang, type Template } from '../data/types';
import { renderMessage, resolveAudience, sendBroadcast } from '../domain/broadcast';
import { fmtDateTime, interpolate } from '../domain/format';
import { Icon } from '../components/Icon';
import { Avatar, ChipToggle, ConfirmDialog, EmptyState, Field, Modal, PageHeader, toast } from '../components/ui';
import { tagLabel, useT } from '../i18n';
import { useCurrentEventId } from '../lib/hooks';

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function PrototypeBanner() {
  const t = useT();
  return (
    <p className="mb-4 flex items-start gap-2 rounded-xl border border-[var(--st-hold-border)] bg-warn-soft p-3 font-semibold text-warn-text" role="note">
      <Icon name="info" className="mt-0.5" /> {t.broadcasts.banner}
    </p>
  );
}

export function Broadcasts() {
  const t = useT();
  const lang = useLang();
  const db = useDB();
  const currentEventId = useCurrentEventId();
  const [filters, setFilters] = useState<BroadcastFilters>({ categories: [], tags: [], languages: [] });
  const [templateId, setTemplateId] = useState(db.templates[0]?.id ?? '');
  const [eventId, setEventId] = useState(currentEventId ?? '');
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [last, setLast] = useState<Broadcast>();
  const [editing, setEditing] = useState(false);

  const audience = useMemo(() => resolveAudience(db, filters), [db, filters]);
  const template = db.templates.find((x) => x.id === templateId);
  const byLang = LANGS.map((l) => [l, audience.included.filter((e) => e.language === l).length] as const);
  const previewList = showAll ? audience.included : audience.included.slice(0, 6);
  const allTags = Array.from(new Set([...DEFAULT_TAGS, ...db.settings.customTags]));
  const history = [...db.broadcasts].sort((a, b) => b.createdAt - a.createdAt);

  const send = () => {
    const b = exec((d, now) => sendBroadcast(d, { templateId, eventId: eventId || undefined, filters }, now));
    setLast(b);
    toast(interpolate(t.broadcasts.sent, { n: b.recipientIds.length }));
  };

  return (
    <div>
      <PageHeader
        title={t.broadcasts.title}
        actions={
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> {t.broadcasts.editTemplates}
          </button>
        }
      />
      <PrototypeBanner />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* Composer */}
        <section className="card space-y-4 p-4">
          <h2 className="text-lg font-bold">{t.broadcasts.audience}</h2>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="check" size={16} /> {t.broadcasts.consentOnly}
          </p>
          <div>
            <span className="label">{t.exhibitors.category}</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <ChipToggle key={c} pressed={filters.categories.includes(c)} onClick={() => setFilters((f) => ({ ...f, categories: toggle(f.categories, c) }))}>
                  {t.category[c]}
                </ChipToggle>
              ))}
            </div>
          </div>
          <div>
            <span className="label">{t.common.language}</span>
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map((l) => (
                <ChipToggle key={l} pressed={filters.languages.includes(l)} onClick={() => setFilters((f) => ({ ...f, languages: toggle(f.languages, l) }))}>
                  <span lang={l}>{t.langName[l]}</span>
                </ChipToggle>
              ))}
            </div>
          </div>
          <div>
            <span className="label">{t.exhibitors.tags}</span>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((x) => (
                <ChipToggle key={x} pressed={filters.tags.includes(x)} onClick={() => setFilters((f) => ({ ...f, tags: toggle(f.tags, x) }))}>
                  {tagLabel(t, x)}
                </ChipToggle>
              ))}
            </div>
          </div>
          <Field label={t.broadcasts.pastEvent}>
            <select className="input" value={filters.pastEventId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, pastEventId: e.target.value || undefined }))}>
              <option value="">{t.broadcasts.anyEvent}</option>
              {db.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <hr className="border-border" />
          <Field label={t.broadcasts.template}>
            <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {db.templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name[lang] || x.name.en}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.broadcasts.eventVars}>
            <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {db.events
                .filter((e) => e.status !== 'completed')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </Field>
        </section>

        {/* Summary + preview */}
        <section className="space-y-4">
          <div className="card p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <p className="text-sm font-semibold text-muted">{t.broadcasts.recipients}</p>
                <p className="tabular text-3xl font-bold">{audience.included.length}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {byLang.map(([l, n]) => (
                  <span key={l} className="tag text-sm" lang={l}>
                    {t.langName[l]}: {n}
                  </span>
                ))}
              </div>
            </div>
            {audience.excludedNoConsent.length > 0 && (
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-danger">
                <Icon name="x" size={16} /> {interpolate(t.broadcasts.excluded, { n: audience.excludedNoConsent.length })}
              </p>
            )}
            <button className="btn btn-primary mt-3 w-full" disabled={!audience.included.length || !template} onClick={() => setConfirming(true)}>
              <Icon name="send" /> {interpolate(t.broadcasts.send, { n: audience.included.length })}
            </button>
          </div>

          <div className="card p-4">
            <h2 className="text-lg font-bold">{t.broadcasts.preview}</h2>
            <p className="mb-3 text-sm text-muted">{t.broadcasts.previewHint}</p>
            {audience.included.length === 0 || !template ? (
              <EmptyState icon="users" title={t.broadcasts.noRecipients} />
            ) : (
              <div className="space-y-3 rounded-2xl bg-[var(--chat-bg)] p-3">
                {previewList.map((ex) => {
                  const m = renderMessage(db, template, ex, eventId || undefined);
                  return (
                    <div key={ex.id} className="flex items-start gap-2">
                      <Avatar name={ex.ownerName} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="mb-1 text-xs font-semibold">
                          {ex.ownerName} · <span className="tag" lang={m.lang}>{t.langName[m.lang]}</span>
                        </p>
                        <p lang={m.lang} className="rounded-2xl rounded-tl-sm bg-[var(--chat-in)] p-3 text-[15px] whitespace-pre-line shadow-sm">
                          {m.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {!showAll && audience.included.length > previewList.length && (
                  <button className="btn btn-sm w-full" onClick={() => setShowAll(true)}>
                    {interpolate(t.broadcasts.showAll, { n: audience.included.length })}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {last && (
        <section className="card mt-4 border-[var(--st-paid-border)] p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Icon name="check" /> {interpolate(t.broadcasts.sent, { n: last.recipientIds.length })}
          </h2>
          <p className="mt-1 flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <span key={l} className="tag text-sm" lang={l}>
                {t.langName[l]}: {last.countsByLang[l]}
              </span>
            ))}
            {last.excludedCount > 0 && <span className="tag text-sm text-danger">{interpolate(t.broadcasts.excluded, { n: last.excludedCount })}</span>}
          </p>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold">{t.broadcasts.history}</h2>
        {history.length === 0 ? (
          <EmptyState icon="megaphone" title={t.broadcasts.empty} hint={t.broadcasts.emptyHint} />
        ) : (
          <ul className="card divide-y divide-border">
            {history.map((b) => {
              const tpl = db.templates.find((x) => x.id === b.templateId);
              const ev = db.events.find((e) => e.id === b.eventId);
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Icon name="megaphone" className="text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{tpl ? tpl.name[lang] || tpl.name.en : '—'}</span>
                    <span className="block text-sm text-muted">
                      {fmtDateTime(b.createdAt, lang)} {ev && `· ${ev.name}`}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1 text-sm">
                    <span className="tag">
                      {t.broadcasts.recipients}: {b.recipientIds.length}
                    </span>
                    {LANGS.map((l) => (
                      <span key={l} className="tag" lang={l}>
                        {t.langName[l]} {b.countsByLang[l]}
                      </span>
                    ))}
                    {b.excludedCount > 0 && <span className="tag text-danger">−{b.excludedCount}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {confirming && (
        <ConfirmDialog
          danger={false}
          title={t.broadcasts.sendTitle}
          body={
            <>
              <p>{interpolate(t.broadcasts.sendBody, { n: audience.included.length, x: audience.excludedNoConsent.length })}</p>
              <p className="text-sm text-warn-text">{t.broadcasts.banner}</p>
            </>
          }
          confirmLabel={interpolate(t.broadcasts.send, { n: audience.included.length })}
          onConfirm={send}
          onClose={() => setConfirming(false)}
        />
      )}
      {editing && <TemplateEditor onClose={() => setEditing(false)} />}
    </div>
  );
}

const VARS = ['{name}', '{business}', '{event_name}', '{venue}', '{dates}', '{stall_type}', '{price}', '{stall_number}', '{amount_due}'];

export function TemplateEditor({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const db = useDB();
  const [id, setId] = useState(db.templates[0]?.id);
  const tpl = db.templates.find((x) => x.id === id);
  const [draft, setDraft] = useState<Template | undefined>(tpl);
  const pick = (newId: string) => {
    setId(newId);
    setDraft(db.templates.find((x) => x.id === newId));
  };
  const save = () => {
    if (!draft) return;
    exec((d, now) => {
      const x = d.templates.find((y) => y.id === draft.id);
      if (x) Object.assign(x, { name: draft.name, body: draft.body, updatedAt: now });
    });
    toast(t.templates.saved);
  };
  return (
    <Modal
      wide
      title={t.templates.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
          <button className="btn btn-primary" onClick={save}>
            <Icon name="check" size={18} /> {t.common.save}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <select className="input" value={id} onChange={(e) => pick(e.target.value)} aria-label={t.broadcasts.template}>
          {db.templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name[lang] || x.name.en}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted">
          {t.templates.variables}: <span className="tabular">{VARS.join(' ')}</span>
        </p>
        {draft &&
          LANGS.map((l: Lang) => (
            <fieldset key={l} className="space-y-2 rounded-xl border border-border p-3" lang={l}>
              <legend className="px-1 font-bold">{t.langName[l]}</legend>
              <input className="input" aria-label={`${t.templates.name} (${t.langName[l]})`} value={draft.name[l]} onChange={(e) => setDraft({ ...draft, name: { ...draft.name, [l]: e.target.value } })} />
              <textarea className="input min-h-[110px]" aria-label={`${t.templates.body} (${t.langName[l]})`} value={draft.body[l]} onChange={(e) => setDraft({ ...draft, body: { ...draft.body, [l]: e.target.value } })} />
            </fieldset>
          ))}
      </div>
    </Modal>
  );
}
