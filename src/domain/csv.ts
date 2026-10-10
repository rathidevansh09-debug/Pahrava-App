import Papa from 'papaparse';
import { CATEGORIES, LANGS, SOURCES, type Category, type DB, type Exhibitor, type Lang, type Source } from '../data/types';
import { uid } from '../lib/id';
import { toISODate } from './format';
import { log } from './log';
import { isValidIndianMobile, normalizePhone } from './phone';

export const IMPORT_FIELDS = ['ownerName', 'businessName', 'phone', 'altPhone', 'category', 'language', 'city', 'tags', 'source', 'consent', 'notes'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Partial<Record<ImportField, string>>;

const HINTS: Record<ImportField, string[]> = {
  ownerName: ['owner', 'name', 'contact', 'नाव', 'नाम'],
  businessName: ['business', 'brand', 'company', 'shop', 'firm', 'व्यवसाय'],
  phone: ['phone', 'mobile', 'whatsapp', 'number', 'contact no', 'मोबाईल', 'मोबाइल'],
  altPhone: ['alternate', 'alt', 'other phone', 'phone 2'],
  category: ['category', 'type', 'segment'],
  language: ['language', 'lang', 'भाषा'],
  city: ['city', 'town', 'location', 'शहर'],
  tags: ['tags', 'labels'],
  source: ['source', 'lead source', 'channel'],
  consent: ['consent', 'opt in', 'optin', 'marketing'],
  notes: ['notes', 'remarks', 'comment'],
};

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  return { headers: res.meta.fields ?? [], rows: res.data };
}

/** Best-guess column mapping from header names. Staff can adjust it in the UI. */
export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  // Specific fields first so "Alternate phone" doesn't land on phone, "Business name" not on owner.
  const order: ImportField[] = ['altPhone', 'businessName', 'phone', 'ownerName', 'category', 'language', 'city', 'tags', 'source', 'consent', 'notes'];
  for (const f of order) {
    const h = headers.find((x) => !used.has(x) && HINTS[f].some((hint) => x.toLowerCase().includes(hint)));
    if (h) {
      m[f] = h;
      used.add(h);
    }
  }
  return m;
}

function pick<T extends string>(raw: string | undefined, options: readonly T[], fallback: T, aliases: Record<string, T> = {}): T {
  const v = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!v) return fallback;
  if (aliases[v]) return aliases[v];
  return options.find((o) => o === v || o.startsWith(v) || v.startsWith(o)) ?? fallback;
}

export interface ImportRow {
  line: number;
  data: Omit<Exhibitor, 'id' | 'createdAt' | 'updatedAt'>;
  error?: 'invalid_phone' | 'missing_name';
  duplicateOf?: string; // existing exhibitor id
}

export function buildImport(db: DB, rows: Record<string, string>[], m: Mapping, today = toISODate(new Date())): ImportRow[] {
  const seen = new Map<string, number>();
  return rows.map((r, i) => {
    const get = (f: ImportField) => (m[f] ? r[m[f]!] ?? '' : '');
    const phone = normalizePhone(get('phone'));
    const consentRaw = get('consent').trim().toLowerCase();
    const consent = ['yes', 'y', 'true', '1', 'हो', 'हाँ', 'हां'].includes(consentRaw);
    const data: ImportRow['data'] = {
      ownerName: get('ownerName').trim(),
      businessName: get('businessName').trim(),
      phone,
      altPhone: isValidIndianMobile(get('altPhone')) ? normalizePhone(get('altPhone')) : undefined,
      category: pick<Category>(get('category'), CATEGORIES, 'other', { jewelry: 'jewellery', home: 'home_decor', decor: 'home_decor', clothing: 'fashion', apparel: 'fashion' }),
      language: pick<Lang>(get('language'), LANGS, 'mr', { marathi: 'mr', मराठी: 'mr', hindi: 'hi', हिंदी: 'hi', english: 'en' }),
      city: get('city').trim(),
      tags: get('tags').split(/[;,|]/).map((t) => t.trim()).filter(Boolean),
      source: pick<Source>(get('source'), SOURCES, 'call', { walkin: 'walk_in', insta: 'instagram', wa: 'whatsapp' }),
      consent,
      consentDate: consent ? today : undefined,
      notes: get('notes').trim(),
    };
    const row: ImportRow = { line: i + 2, data };
    if (!data.ownerName && !data.businessName) row.error = 'missing_name';
    else if (!isValidIndianMobile(phone)) row.error = 'invalid_phone';
    else {
      const existing = db.exhibitors.find((e) => e.phone === phone || e.altPhone === phone);
      if (existing) row.duplicateOf = existing.id;
      else if (seen.has(phone)) row.duplicateOf = `row:${seen.get(phone)}`;
      seen.set(phone, row.line);
    }
    return row;
  });
}

/**
 * Apply an import. Duplicates (by phone) are either merged into the existing
 * record (blank fields filled, tags unioned, notes appended) or skipped.
 */
export function applyImport(db: DB, rows: ImportRow[], dupMode: 'merge' | 'skip', now = Date.now()) {
  let added = 0;
  let merged = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.error) {
      skipped++;
      continue;
    }
    const existing = db.exhibitors.find((e) => e.phone === r.data.phone || e.altPhone === r.data.phone);
    if (existing) {
      if (dupMode === 'skip') {
        skipped++;
        continue;
      }
      existing.ownerName ||= r.data.ownerName;
      existing.businessName ||= r.data.businessName;
      existing.city ||= r.data.city;
      existing.altPhone ||= r.data.altPhone;
      existing.tags = Array.from(new Set([...existing.tags, ...r.data.tags]));
      if (r.data.notes && !existing.notes.includes(r.data.notes)) existing.notes = [existing.notes, r.data.notes].filter(Boolean).join('\n');
      if (r.data.consent && !existing.consent) {
        existing.consent = true;
        existing.consentDate = r.data.consentDate;
      }
      existing.updatedAt = now;
      merged++;
      continue;
    }
    const ex: Exhibitor = { id: uid('ex'), ...r.data, ownerName: r.data.ownerName || r.data.businessName, businessName: r.data.businessName || r.data.ownerName, createdAt: now, updatedAt: now };
    db.exhibitors.push(ex);
    log(db, { at: now, kind: 'exhibitor_created', actor: 'staff', exhibitorId: ex.id, data: { source: 'csv' } });
    added++;
  }
  return { added, merged, skipped };
}

export function exportCsv(list: Exhibitor[]): string {
  return Papa.unparse(
    list.map((e) => ({
      'Owner name': e.ownerName,
      'Business name': e.businessName,
      Phone: e.phone,
      'Alternate phone': e.altPhone ?? '',
      Category: e.category,
      Language: e.language,
      City: e.city,
      Tags: e.tags.join('; '),
      Source: e.source,
      Consent: e.consent ? 'Yes' : 'No',
      'Consent date': e.consentDate ?? '',
      Notes: e.notes,
    })),
  );
}
