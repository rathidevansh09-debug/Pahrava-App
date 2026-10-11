import { useState } from 'react';
import { WHATSAPP } from '../data/cloud-config';
import { callWa, waError } from '../data/whatsapp';
import { interpolate } from '../domain/format';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { toast } from './ui';

/** Sends one approved template to an exhibitor. Hidden unless WhatsApp is switched on. */
export function WaSendButton({ templateKey, exhibitorId, eventId, label, className = 'btn' }: { templateKey: string; exhibitorId: string; eventId?: string; label: string; className?: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  if (!WHATSAPP) return null;
  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await callWa('waSendTemplate', { templateKey, exhibitorId, eventId });
          toast(t.whatsapp.messageSent);
        } catch (e) {
          toast(interpolate(t.whatsapp.sendFailed, { error: waError(e) }), 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="chat" size={16} /> {busy ? t.broadcasts.sending : label}
    </button>
  );
}

/** Settings card: which number is connected. */
export function WaConnection() {
  const t = useT();
  const [state, setState] = useState<{ text: string; ok: boolean }>();
  const [busy, setBusy] = useState(false);
  if (!WHATSAPP) return null;
  const check = async () => {
    setBusy(true);
    try {
      const r = await callWa<{ number?: string; name?: string; quality?: string }>('waStatus');
      setState({ ok: true, text: interpolate(t.whatsapp.connected, { number: r.number ?? '—', name: r.name ?? '—' }) });
    } catch (e) {
      setState({ ok: false, text: interpolate(t.whatsapp.notConnected, { error: waError(e) }) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold">{t.whatsapp.connection}</h2>
        <p className={state ? (state.ok ? 'text-text' : 'text-danger') : 'text-muted'}>{state?.text ?? t.whatsapp.connectionHint}</p>
      </div>
      <button className="btn" onClick={check} disabled={busy}>
        <Icon name="refresh" size={16} /> {t.whatsapp.check}
      </button>
    </section>
  );
}

const STATUS_CLASS: Record<string, string> = {
  APPROVED: 'st st-fully_paid border',
  PENDING: 'st st-on_hold border',
  IN_APPEAL: 'st st-on_hold border',
  REJECTED: 'bg-danger-soft text-danger',
  ERROR: 'bg-danger-soft text-danger',
};

/** Per-language Meta approval badge for a template. */
export function WaTemplateStatus({ status }: { status?: string }) {
  const t = useT();
  if (!WHATSAPP) return null;
  const key = status ?? 'NONE';
  const label = (t.whatsapp.status as Record<string, string>)[key] ?? key;
  return <span className={`tag ${STATUS_CLASS[key] ?? ''}`}>{label}</span>;
}
