// Minimal WhatsApp Cloud API client (Meta Graph API).
// https://developers.facebook.com/documentation/business-messaging/whatsapp/

export const GRAPH_VERSION = 'v23.0';
// Overridable so local tests can point at a fake Graph server.
const BASE = () => process.env.WA_GRAPH_BASE || 'https://graph.facebook.com';

export interface WaConfig {
  token: string;
  phoneNumberId: string;
  wabaId: string;
}

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
  }
}

export async function graph<T = Record<string, unknown>>(cfg: WaConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE()}/${GRAPH_VERSION}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!res.ok || json.error) throw new GraphError(json.error?.message ?? `Graph API ${res.status}`, res.status, json.error?.code);
  return json;
}

const send = (cfg: WaConfig, to: string, message: Record<string, unknown>) =>
  graph<{ messages?: { id: string }[] }>(cfg, 'POST', `${cfg.phoneNumberId}/messages`, { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message }).then(
    (r) => r.messages?.[0]?.id ?? '',
  );

export const sendText = (cfg: WaConfig, to: string, text: string) => send(cfg, to, { type: 'text', text: { body: text, preview_url: false } });

/** Up to 3 reply buttons (title ≤ 20 chars). */
export const sendButtons = (cfg: WaConfig, to: string, text: string, buttons: { id: string; title: string }[]) =>
  send(cfg, to, {
    type: 'interactive',
    interactive: { type: 'button', body: { text }, action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) } },
  });

/** A list picker: up to 10 rows (title ≤ 24, description ≤ 72 chars). */
export const sendList = (cfg: WaConfig, to: string, text: string, button: string, rows: { id: string; title: string; description?: string }[]) =>
  send(cfg, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text },
      action: {
        button: button.slice(0, 20),
        sections: [{ title: 'PAHRAVA', rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: r.title.slice(0, 24), description: r.description?.slice(0, 72) })) }],
      },
    },
  });

/** An approved template with named body parameters. */
export const sendTemplate = (cfg: WaConfig, to: string, name: string, lang: string, params: Record<string, string>) =>
  send(cfg, to, {
    type: 'template',
    template: {
      name,
      language: { code: lang },
      components: Object.keys(params).length
        ? [{ type: 'body', parameters: Object.entries(params).map(([k, v]) => ({ type: 'text', parameter_name: k, text: v || '—' })) }]
        : [],
    },
  });

export const markRead = (cfg: WaConfig, messageId: string) =>
  graph(cfg, 'POST', `${cfg.phoneNumberId}/messages`, { messaging_product: 'whatsapp', status: 'read', message_id: messageId }).catch(() => undefined);
