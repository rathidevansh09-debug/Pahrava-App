// Meta message templates, generated from the app's own templates (Settings →
// Message templates). `{name}` in the app becomes the named parameter `{{name}}`.
import { FieldValue } from 'firebase-admin/firestore';
import { LANGS, type DB, type Exhibitor, type Lang, type Template } from '../../src/data/types';
import { templateVars } from '../../src/domain/broadcast';
import { log } from '../../src/domain/log';
import { graph, sendTemplate, type WaConfig } from './graph';
import { fs, serverExec, WA_COLLECTION } from './store';

const UTILITY = new Set(['booking_confirmation', 'payment_reminder', 'hold_expiring']);

export const metaName = (t: Template) => `pahrava_${String(t.key).toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

const varsIn = (body: string) => [...new Set([...body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];

const toMetaText = (body: string) => body.replace(/\{([a-z_]+)\}/g, '{{$1}}');

const EXAMPLES: Record<string, string> = {
  name: 'Asha',
  business: 'Sakhi Sarees',
  event_name: 'PAHRAVA Diwali Exhibition',
  venue: 'Lakshika Hall, Nashik',
  dates: '23–24 Oct 2026',
  stall_type: 'Green Stall (2×2)',
  price: '₹13,000',
  stall_number: 'L-9',
  amount_due: '₹6,500',
};

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  components?: { type: string; text?: string }[];
}

async function listMeta(cfg: WaConfig): Promise<MetaTemplate[]> {
  const out: MetaTemplate[] = [];
  let path = `${cfg.wabaId}/message_templates?fields=id,name,language,status,components&limit=100`;
  for (let i = 0; i < 20 && path; i++) {
    const r = await graph<{ data: MetaTemplate[]; paging?: { next?: string } }>(cfg, 'GET', path);
    out.push(...r.data);
    path = r.paging?.next ? r.paging.next.replace(/^https:\/\/[^/]+\/v[\d.]+\//, '') : '';
  }
  return out;
}

/**
 * Submit new or changed templates to Meta for approval and store each
 * language's status on the template (shown in the app).
 */
export async function syncTemplates(cfg: WaConfig, db: DB) {
  const existing = await listMeta(cfg);
  const status: Record<string, Partial<Record<Lang, string>>> = {};
  const errors: string[] = [];
  for (const t of db.templates) {
    status[t.id] = {};
    for (const lang of LANGS) {
      const body = t.body[lang]?.trim();
      if (!body) continue;
      const name = metaName(t);
      const text = toMetaText(body);
      const component = {
        type: 'BODY',
        text,
        example: { body_text_named_params: varsIn(body).map((v) => ({ param_name: v, example: EXAMPLES[v] ?? 'PAHRAVA' })) },
      };
      const found = existing.find((m) => m.name === name && m.language === lang);
      try {
        if (!found) {
          const r = await graph<{ status?: string }>(cfg, 'POST', `${cfg.wabaId}/message_templates`, {
            name,
            language: lang,
            category: UTILITY.has(String(t.key)) ? 'UTILITY' : 'MARKETING',
            parameter_format: 'NAMED',
            components: [component],
          });
          status[t.id][lang] = r.status ?? 'PENDING';
        } else if (found.components?.find((c) => c.type === 'BODY')?.text !== text) {
          await graph(cfg, 'POST', found.id, { components: [component] });
          status[t.id][lang] = 'PENDING';
        } else {
          status[t.id][lang] = found.status;
        }
      } catch (e) {
        status[t.id][lang] = 'ERROR';
        errors.push(`${t.name.en} (${lang}): ${(e as Error).message}`);
      }
    }
  }
  await serverExec((d) => {
    for (const t of d.templates) if (status[t.id]) t.wa = status[t.id];
  });
  return { status, errors };
}

/** Update one template's status from a Meta webhook. */
export async function setTemplateStatus(name: string, lang: string, value: string) {
  await serverExec((d) => {
    const t = d.templates.find((x) => metaName(x) === name);
    if (t && (LANGS as string[]).includes(lang)) t.wa = { ...t.wa, [lang]: value };
  });
}

export const waNumber = (phone: string) => `91${phone}`;

/** The language to send in: the exhibitor's own if approved, else English. */
export function sendLang(t: Template, ex: Exhibitor): Lang | undefined {
  if (t.wa?.[ex.language] === 'APPROVED') return ex.language;
  if (t.wa?.en === 'APPROVED') return 'en';
  return undefined;
}

export interface Outgoing {
  exhibitorId: string;
  to: string;
  lang: Lang;
  name: string;
  params: Record<string, string>;
  label: string;
}

/** Build the message for one exhibitor, or undefined if no approved template. */
export function prepare(db: DB, t: Template, ex: Exhibitor, eventId?: string): Outgoing | undefined {
  const lang = sendLang(t, ex);
  if (!lang) return undefined;
  const vars = templateVars(db, ex, eventId, lang) as Record<string, string>;
  const params = Object.fromEntries(varsIn(t.body[lang]).map((v) => [v, String(vars[v] ?? '—')]));
  return { exhibitorId: ex.id, to: waNumber(ex.phone), lang, name: metaName(t), params, label: t.name[lang] || t.name.en };
}

/** Send prepared messages; remember each message id for delivery updates. */
export async function deliver(cfg: WaConfig, list: Outgoing[], meta: { broadcastId?: string; eventId?: string; kind: string }) {
  let sent = 0;
  const failed: { exhibitorId: string; error: string }[] = [];
  for (const m of list) {
    try {
      const id = await sendTemplate(cfg, m.to, m.name, m.lang, m.params);
      sent++;
      if (id)
        await fs()
          .collection(WA_COLLECTION)
          .doc(`msg_${id}`)
          .set({ exhibitorId: m.exhibitorId, broadcastId: meta.broadcastId ?? null, kind: meta.kind, status: 'sent', at: FieldValue.serverTimestamp() });
    } catch (e) {
      failed.push({ exhibitorId: m.exhibitorId, error: (e as Error).message });
    }
  }
  return { sent, failed };
}

/** Timeline entries for messages that went out (broadcasts log their own). */
export async function logSent(list: Outgoing[], eventId: string | undefined, failedIds: Set<string>) {
  const ok = list.filter((m) => !failedIds.has(m.exhibitorId));
  if (!ok.length) return;
  await serverExec((d, now) => {
    for (const m of ok) log(d, { at: now, kind: 'message_sent', actor: 'system', exhibitorId: m.exhibitorId, eventId, data: { template: m.label, lang: m.lang } });
  });
}
