import { useState } from 'react';
import { exec, useStore } from '../data/store';
import { CATEGORIES, DEFAULT_TAGS, LANGS, SOURCES, type Category, type Exhibitor, type Lang, type Source } from '../data/types';
import { createExhibitor, updateExhibitor, type ExhibitorInput } from '../domain/exhibitors';
import { toISODate } from '../domain/format';
import { isValidIndianMobile, normalizePhone } from '../domain/phone';
import { tagLabel, useT } from '../i18n';
import { errorText } from '../lib/hooks';
import { Icon } from './Icon';
import { ChipToggle, Field, Modal, Segmented, toast } from './ui';

const blank = (phone = ''): ExhibitorInput => ({
  ownerName: '',
  businessName: '',
  phone,
  altPhone: '',
  category: 'fashion',
  language: 'mr',
  city: '',
  tags: [],
  source: 'call',
  consent: false,
  consentDate: undefined,
  notes: '',
});

/**
 * Full exhibitor form; `quick` shows only what's needed during a call
 * (name, business, phone, language, category).
 */
export function ExhibitorForm({ existing, quick, initialQuery, onSaved, onClose }: { existing?: Exhibitor; quick?: boolean; initialQuery?: string; onSaved: (ex: Exhibitor) => void; onClose: () => void }) {
  const t = useT();
  const customTags = useStore((s) => s.db.settings.customTags);
  const initial = (): ExhibitorInput => {
    if (existing) {
      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = existing;
      return { ...rest, altPhone: rest.altPhone ?? '' };
    }
    const q = initialQuery?.trim() ?? '';
    const isPhone = /^[\d\s+()-]{6,}$/.test(q);
    return { ...blank(isPhone ? normalizePhone(q) : ''), ownerName: isPhone ? '' : q };
  };
  const [f, setF] = useState<ExhibitorInput>(initial);
  const [touched, setTouched] = useState(false);
  const [serverErr, setServerErr] = useState<string>();
  const [newTag, setNewTag] = useState('');
  const set = <K extends keyof ExhibitorInput>(k: K, v: ExhibitorInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const phoneErr = touched && !isValidIndianMobile(f.phone) ? t.exhibitors.invalidPhone : undefined;
  const altErr = touched && f.altPhone && !isValidIndianMobile(f.altPhone) ? t.exhibitors.invalidPhone : undefined;
  const nameErr = touched && !f.ownerName.trim() && !f.businessName.trim() ? t.exhibitors.nameRequired : undefined;
  const allTags = [...DEFAULT_TAGS, ...customTags];

  const save = () => {
    setTouched(true);
    if (!isValidIndianMobile(f.phone) || (f.altPhone && !isValidIndianMobile(f.altPhone)) || (!f.ownerName.trim() && !f.businessName.trim())) return;
    const input: ExhibitorInput = {
      ...f,
      ownerName: f.ownerName.trim() || f.businessName.trim(),
      businessName: f.businessName.trim() || f.ownerName.trim(),
      altPhone: f.altPhone || undefined,
    };
    if (existing) {
      const r = exec((db, now) => updateExhibitor(db, existing.id, input, now));
      if (!r.ok) return setServerErr(errorText(t, r.error));
      toast(t.exhibitors.saved);
      onSaved({ ...existing, ...input });
    } else {
      const r = exec((db, now) => createExhibitor(db, input, now));
      if (!r.ok) return setServerErr(errorText(t, r.error));
      toast(t.exhibitors.saved);
      onSaved(r.exhibitor);
    }
  };

  return (
    <Modal
      wide={!quick}
      title={existing ? t.exhibitors.edit : quick ? t.exhibitors.quickAdd : t.exhibitors.add}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn btn-primary" onClick={save}>
            <Icon name="check" size={18} /> {t.common.save}
          </button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={`${t.exhibitors.mobile} *`} error={phoneErr} htmlFor="ex-phone">
          <input id="ex-phone" data-autofocus className="input tabular" inputMode="tel" autoComplete="off" value={f.phone} aria-invalid={!!phoneErr} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" />
        </Field>
        <Field label={t.exhibitors.ownerName} error={nameErr} htmlFor="ex-owner">
          <input id="ex-owner" className="input" value={f.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
        </Field>
        <Field label={t.exhibitors.businessName} htmlFor="ex-biz">
          <input id="ex-biz" className="input" value={f.businessName} onChange={(e) => set('businessName', e.target.value)} />
        </Field>
        <Field label={t.exhibitors.category} htmlFor="ex-cat">
          <select id="ex-cat" className="input" value={f.category} onChange={(e) => set('category', e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.category[c]}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <span className="label">{t.exhibitors.language}</span>
          <Segmented<Lang> label={t.exhibitors.language} value={f.language} onChange={(v) => set('language', v)} options={LANGS.map((l) => ({ value: l, label: <span lang={l}>{t.langName[l]}</span> }))} />
        </div>

        {!quick && (
          <>
            <Field label={`${t.exhibitors.altMobile} (${t.common.optional})`} error={altErr} htmlFor="ex-alt">
              <input id="ex-alt" className="input tabular" inputMode="tel" value={f.altPhone ?? ''} aria-invalid={!!altErr} onChange={(e) => set('altPhone', e.target.value)} />
            </Field>
            <Field label={t.exhibitors.city} htmlFor="ex-city">
              <input id="ex-city" className="input" value={f.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label={t.exhibitors.source} htmlFor="ex-src">
              <select id="ex-src" className="input" value={f.source} onChange={(e) => set('source', e.target.value as Source)}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {t.source[s]}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="label">{t.exhibitors.consent}</span>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<'y' | 'n'>
                  label={t.exhibitors.consent}
                  value={f.consent ? 'y' : 'n'}
                  onChange={(v) => setF((x) => ({ ...x, consent: v === 'y', consentDate: v === 'y' ? x.consentDate || toISODate(new Date()) : undefined }))}
                  options={[
                    { value: 'y', label: t.common.yes },
                    { value: 'n', label: t.common.no },
                  ]}
                />
                {f.consent && (
                  <input type="date" className="input w-auto" aria-label={t.exhibitors.consentDate} value={f.consentDate ?? ''} onChange={(e) => set('consentDate', e.target.value)} />
                )}
              </div>
            </div>
            <div className="sm:col-span-2">
              <span className="label">{t.exhibitors.tags}</span>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...allTags, ...f.tags])).map((tag) => (
                  <ChipToggle key={tag} pressed={f.tags.includes(tag)} onClick={() => set('tags', f.tags.includes(tag) ? f.tags.filter((x) => x !== tag) : [...f.tags, tag])}>
                    {tagLabel(t, tag)}
                  </ChipToggle>
                ))}
                <span className="inline-flex gap-1">
                  <input className="input h-9 min-h-0 w-36 py-1 text-sm" placeholder={t.exhibitors.customTag} value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTag.trim()) {
                      e.preventDefault();
                      set('tags', [...f.tags, newTag.trim()]);
                      setNewTag('');
                    }
                  }} />
                </span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Field label={t.exhibitors.notes} htmlFor="ex-notes">
                <textarea id="ex-notes" className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
          </>
        )}
        {serverErr && (
          <p className="text-danger font-semibold sm:col-span-2" role="alert">
            {serverErr}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
