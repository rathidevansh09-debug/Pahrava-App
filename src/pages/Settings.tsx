import { useState } from 'react';
import { CLOUD, REQUIRE_LOGIN } from '../data/cloud-config';
import { exec, resetDemoData, useCloud, useDataMode, useDB } from '../data/store';
import { ChangePassword, signOutStaff } from '../components/CloudGate';
import { WaConnection } from '../components/WhatsApp';
import { DataModeSwitch } from '../components/DataMode';
import type { StallType } from '../data/types';
import { deleteStallType, upsertStallType } from '../domain/events';
import { interpolate } from '../domain/format';
import { Icon } from '../components/Icon';
import { ConfirmDialog, Field, PageHeader, toast } from '../components/ui';
import { tagLabel, useT } from '../i18n';
import { useCurrentEventId } from '../lib/hooks';
import { TemplateEditor } from './Broadcasts';
import { DEFAULT_TAGS } from '../data/types';

export function Settings() {
  const t = useT();
  const db = useDB();
  const cloud = useCloud();
  const mode = useDataMode();
  const live = CLOUD && mode === 'live';
  const current = useCurrentEventId();
  const [eventId, setEventId] = useState(current ?? '');
  const [resetting, setResetting] = useState(false);
  const [templates, setTemplates] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [newTag, setNewTag] = useState('');
  const event = db.events.find((e) => e.id === eventId);
  const types = db.stallTypes.filter((x) => x.eventId === eventId);

  return (
    <div className="space-y-5">
      <PageHeader title={t.settings.title} />

      <section className="card space-y-3 p-4">
        <h2 className="text-lg font-semibold">{t.settings.general}</h2>
        <Field label={t.settings.defaultHold}>
          <input
            className="input tabular w-32"
            inputMode="numeric"
            value={db.settings.defaultHoldHours}
            onChange={(e) => {
              const v = Number(e.target.value.replace(/\D/g, '')) || 0;
              exec((d) => {
                d.settings.defaultHoldHours = v;
              });
            }}
          />
        </Field>
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-semibold">{t.settings.stallTypes}</h2>
          <select className="input w-auto" value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label={t.common.selectEvent}>
            {db.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        {event && <p className="text-sm text-muted">{interpolate(t.settings.stallTypesFor, { event: event.name })}</p>}
        <div className="space-y-2">
          {types.map((ty) => (
            <TypeRow key={ty.id} type={ty} inUse={db.stalls.filter((s) => s.typeId === ty.id).length} />
          ))}
        </div>
        {event && (
          <button className="btn btn-sm" onClick={() => exec((d, n) => upsertStallType(d, { eventId, name: 'New stall type', size: '3×2', basePrice: 5000 }, n))}>
            <Icon name="plus" size={16} /> {t.settings.addType}
          </button>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-lg font-semibold">{t.settings.tags}</h2>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_TAGS.map((x) => (
            <span key={x} className="tag text-sm">
              {tagLabel(t, x)}
            </span>
          ))}
          {db.settings.customTags.map((x) => (
            <span key={x} className="chip">
              {x}
              <button
                className="-mr-2 flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface-2"
                aria-label={`${t.common.delete} ${x}`}
                onClick={() =>
                  exec((d) => {
                    d.settings.customTags = d.settings.customTags.filter((y) => y !== x);
                  })
                }
              >
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = newTag.trim();
            if (!v) return;
            exec((d) => {
              if (!d.settings.customTags.includes(v)) d.settings.customTags.push(v);
            });
            setNewTag('');
          }}
        >
          <input className="input max-w-xs" placeholder={t.settings.addTag} aria-label={t.settings.addTag} value={newTag} onChange={(e) => setNewTag(e.target.value)} />
          <button className="btn" type="submit">
            <Icon name="plus" size={16} /> {t.common.add}
          </button>
        </form>
      </section>

      <section className="card flex flex-wrap items-center gap-3 p-4">
        <h2 className="flex-1 text-lg font-semibold">{t.settings.templates}</h2>
        <button className="btn" onClick={() => setTemplates(true)}>
          <Icon name="edit" size={16} /> {t.broadcasts.editTemplates}
        </button>
      </section>

      <section className="card space-y-2 border-[color-mix(in_srgb,var(--danger)_40%,transparent)] p-4">
        <h2 className="text-lg font-semibold">{live ? t.settings.clear : t.settings.reset}</h2>
        <p className="text-muted">{live ? t.settings.clearHint : t.settings.resetHint}</p>
        <button className="btn btn-danger" onClick={() => setResetting(true)}>
          <Icon name={live ? 'trash' : 'refresh'} /> {live ? t.settings.clear : t.settings.reset}
        </button>
      </section>

      {CLOUD && REQUIRE_LOGIN && (
        <section className="card flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{t.settings.account}</h2>
            <p className="truncate text-muted">{interpolate(t.auth.signedInAs, { email: cloud.email ?? '' })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => setChangingPw(true)}>
              {t.auth.changePassword}
            </button>
            <button className="btn" onClick={() => void signOutStaff()}>
              {t.auth.signOut}
            </button>
          </div>
        </section>
      )}

      {CLOUD && (
        <section className="card space-y-2 p-4">
          <h2 className="text-lg font-semibold">{t.mode.label}</h2>
          <p className="text-muted">{t.mode.hint}</p>
          <DataModeSwitch />
        </section>
      )}

      <WaConnection />

      <section className="card p-4">
        <h2 className="text-lg font-semibold">{t.settings.about}</h2>
        <p className="text-muted">{CLOUD ? t.settings.aboutCloud : t.settings.aboutBody}</p>
      </section>

      {resetting && (
        <ConfirmDialog
          title={live ? `${t.settings.clear}?` : t.settings.resetTitle}
          body={<p>{live ? t.settings.clearBody : t.settings.resetBody}</p>}
          confirmLabel={live ? t.settings.clear : t.settings.reset}
          onClose={() => setResetting(false)}
          onConfirm={() => {
            resetDemoData().then(
              () => toast(live ? t.settings.clearDone : t.settings.resetDone),
              () => toast(t.sync.failed, 'error'),
            );
          }}
        />
      )}
      {templates && <TemplateEditor onClose={() => setTemplates(false)} />}
      {changingPw && <ChangePassword onClose={() => setChangingPw(false)} />}
    </div>
  );
}

function TypeRow({ type, inUse }: { type: StallType; inUse: number }) {
  const t = useT();
  const [d, setD] = useState(type);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = d.name !== type.name || d.size !== type.size || d.basePrice !== type.basePrice || (d.accent ?? '') !== (type.accent ?? '');
  return (
    <div className="grid grid-cols-2 items-end gap-2 rounded-xl border border-border p-2 sm:grid-cols-[2fr_1fr_1fr_auto_auto]">
      <Field label={t.settings.typeName}>
        <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>
      <Field label={t.map.size}>
        <input className="input" value={d.size} onChange={(e) => setD({ ...d, size: e.target.value })} />
      </Field>
      <Field label={t.settings.basePrice}>
        <input className="input tabular" inputMode="numeric" value={d.basePrice} onChange={(e) => setD({ ...d, basePrice: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
      </Field>
      <Field label={t.settings.accent}>
        <input type="color" className="input h-11 w-16 p-1" value={d.accent ?? '#9e9e9e'} onChange={(e) => setD({ ...d, accent: e.target.value })} />
      </Field>
      <div className="flex gap-1">
        <button
          className="btn btn-primary btn-sm"
          disabled={!dirty}
          onClick={() => {
            exec((db, n) => upsertStallType(db, d, n));
            toast(t.settings.saved);
          }}
        >
          <Icon name="check" size={16} /> <span className="sr-only">{t.common.save}</span>
        </button>
        <button
          className="btn btn-danger btn-sm"
          disabled={inUse > 0}
          title={inUse ? t.settings.typeInUse : t.common.delete}
          aria-label={t.common.delete}
          onClick={() => setConfirmDelete(true)}
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
      {inUse > 0 && <p className="col-span-full text-xs text-muted">{inUse} {t.common.stalls}</p>}
      {confirmDelete && (
        <ConfirmDialog
          title={`${t.common.delete}: ${type.name} (${type.size})?`}
          body={<p>{type.name} · {type.size}</p>}
          confirmLabel={t.common.delete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => exec((db) => deleteStallType(db, type.id))}
        />
      )}
    </div>
  );
}
