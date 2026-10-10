import { useState } from 'react';
import { exec } from '../data/store';
import { PAY_MODES, type PayMode } from '../data/types';
import { interpolate, money, toISODate } from '../domain/format';
import { recordPayment } from '../domain/payments';
import { useT } from '../i18n';
import { errorText } from '../lib/hooks';
import { Icon } from './Icon';
import { Field, Segmented, toast } from './ui';

export function PaymentForm({ bookingId, due, onDone, onCancel }: { bookingId: string; due: number; onDone?: () => void; onCancel?: () => void }) {
  const t = useT();
  const [amount, setAmount] = useState(String(due));
  const [date, setDate] = useState(toISODate(new Date()));
  const [mode, setMode] = useState<PayMode>('upi');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string>();

  const submit = () => {
    const n = Math.round(Number(amount.replace(/[,₹\s]/g, '')));
    if (!n || n <= 0) return setErr(t.payment.invalidAmount);
    if (n > due) return setErr(interpolate(t.payment.exceedsDue, { due: money(due) }));
    const r = exec((db, now) => recordPayment(db, { bookingId, amount: n, date, mode, ref, note }, now));
    if (!r.ok) return setErr(errorText(t, r.error));
    toast(interpolate(t.payment.recorded, { amount: money(n) }));
    onDone?.();
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label={t.payment.amount} error={err} htmlFor="pay-amt">
        <div className="flex gap-2">
          <input id="pay-amt" data-autofocus className="input tabular text-lg font-bold" inputMode="numeric" value={amount} aria-invalid={!!err} onChange={(e) => { setAmount(e.target.value); setErr(undefined); }} />
          <button type="button" className="btn btn-sm shrink-0" onClick={() => setAmount(String(due))}>
            {t.payment.payFull}
          </button>
        </div>
      </Field>
      <div>
        <span className="label">{t.payment.mode}</span>
        <Segmented<PayMode> label={t.payment.mode} value={mode} onChange={setMode} options={PAY_MODES.map((m) => ({ value: m, label: t.payMode[m] }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.payment.date} htmlFor="pay-date">
          <input id="pay-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={`${t.payment.ref} (${t.common.optional})`} htmlFor="pay-ref">
          <input id="pay-ref" className="input" placeholder={t.payment.refHint} value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
      <Field label={`${t.payment.note} (${t.common.optional})`} htmlFor="pay-note">
        <input id="pay-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" className="btn flex-1" onClick={onCancel}>
            {t.common.cancel}
          </button>
        )}
        <button type="submit" className="btn btn-primary flex-1">
          <Icon name="check" size={18} /> {t.payment.record}
        </button>
      </div>
    </form>
  );
}
