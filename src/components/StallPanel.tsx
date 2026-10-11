import { useState } from 'react';
import { Link } from 'react-router-dom';
import { exec, useDB, useLang, useNow } from '../data/store';
import type { Exhibitor } from '../data/types';
import { indexDB, stallState } from '../domain/derive';
import { fmtCountdown, fmtDate, fmtDateTime, fmtTime, interpolate, money } from '../domain/format';
import { createPaymentLink } from '../domain/payments';
import { formatPhone } from '../domain/phone';
import { quote } from '../domain/pricing';
import type { Claim } from '../domain/result';
import { confirmBooking, extendHold, holdStall, releaseStall, updateBooking } from '../domain/stalls';
import { useT, type Dict } from '../i18n';
import { errorText } from '../lib/hooks';
import { ExhibitorPicker } from './ExhibitorPicker';
import { Icon } from './Icon';
import { WaSendButton } from './WhatsApp';
import { PaymentForm } from './PaymentForm';
import { Avatar, ConfirmDialog, Field, Modal, Segmented, Sheet, StatusBadge, toast } from './ui';
import { stallCode } from '../domain/stallcode';

type Mode = 'idle' | 'pay' | 'confirm' | 'edit';

export function claimText(t: Dict, claim: Claim, ex: Exhibitor | undefined, lang: Parameters<typeof fmtTime>[1]) {
  return interpolate(t.stall.taken, {
    kind: claim.kind === 'hold' ? t.stall.kindHold : t.stall.kindBooking,
    name: ex?.ownerName ?? '?',
    business: ex?.businessName ?? '',
    until: claim.until ? interpolate(t.stall.until, { time: fmtDateTime(claim.until, lang) }) : '',
  });
}

export function StallPanel({ stallId, preselectId, onClose }: { stallId: string; preselectId?: string; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const db = useDB();
  const now = useNow();
  const idx = indexDB(db);
  const stall = idx.stallById.get(stallId);
  const [mode, setMode] = useState<Mode>('idle');
  const [picked, setPicked] = useState<Exhibitor | undefined>(() => (preselectId ? db.exhibitors.find((e) => e.id === preselectId) : undefined));
  const [hours, setHours] = useState<number>();
  const [partners, setPartners] = useState(1);
  const [partnerName, setPartnerName] = useState('');
  const [discount, setDiscount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [link, setLink] = useState<string>();

  if (!stall) return null;
  const type = idx.typeById.get(stall.typeId);
  const code = stallCode(db, stall);
  const floor = db.floors.find((f) => f.id === stall.floorId);
  const event = db.events.find((e) => e.id === stall.eventId)!;
  const st = stallState(db, stall.id, now);
  const target = st.exhibitor ?? picked;
  const payments = st.booking ? db.payments.filter((p) => p.bookingId === st.booking!.id).sort((a, b) => b.createdAt - a.createdAt) : [];
  const list = quote(db, stall);
  const holdHours = hours ?? event.holdHours;
  const closed = event.status === 'completed';

  const fail = (r: { error: Parameters<typeof errorText>[1]; claim?: Claim }) => {
    if (r.error === 'taken' && r.claim) setError(claimText(t, r.claim, idx.exhibitorById.get(r.claim.exhibitorId), lang));
    else setError(errorText(t, r.error));
  };

  const doHold = () => {
    if (!picked) return;
    const r = exec((d, n) => holdStall(d, { stallId, exhibitorId: picked.id, hours: holdHours }, n));
    if (!r.ok) return fail(r);
    setError(undefined);
    toast(interpolate(t.stall.holdCreated, { stall: code, name: picked.ownerName }));
  };

  const doConfirm = () => {
    if (!target) return;
    const r = exec((d, n) =>
      confirmBooking(d, { stallId, exhibitorId: target.id, partners, partnerName, discount: Number(discount) || 0, discountReason: reason }, n),
    );
    if (!r.ok) return fail(r);
    setError(undefined);
    setMode('idle');
    toast(interpolate(t.stall.bookingConfirmed, { stall: code }));
  };

  const doEdit = () => {
    if (!st.booking) return;
    const r = exec((d, n) => updateBooking(d, st.booking!.id, { partners, partnerName, discount: Number(discount) || 0, discountReason: reason }, n));
    if (!r.ok) return fail(r);
    setMode('idle');
    toast(t.stall.bookingUpdated);
  };

  const doRelease = () => {
    const r = exec((d, n) => releaseStall(d, stallId, n));
    if (!r.ok) return fail(r);
    setPicked(undefined);
    setMode('idle');
    toast(interpolate(t.stall.released, { stall: code }));
  };

  const doLink = () => {
    if (!target) return;
    const amount = st.booking ? st.due : list.total;
    const url = exec((d, n) => createPaymentLink(d, { bookingId: st.booking?.id, stallId, exhibitorId: target.id, amount }, n));
    setLink(url);
  };

  const startBookingOptions = (m: 'confirm' | 'edit') => {
    const b = st.booking;
    setPartners(b?.partners ?? 1);
    setPartnerName(b?.partnerName ?? '');
    setDiscount(b?.discount ? String(b.discount) : '');
    setReason(b?.discountReason ?? '');
    setMode(m);
    setError(undefined);
  };

  const preview = quote(db, stall, { partners, discount: Number(discount) || 0 });

  const bookingOptions = (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      {event.partnerSurcharge > 0 && (
        <div>
          <span className="label">{t.stall.partners}</span>
          <Segmented<number>
            label={t.stall.partners}
            value={partners}
            onChange={setPartners}
            options={[
              { value: 1, label: t.stall.single },
              { value: 2, label: `${t.stall.partnership} (+${money(2 * event.partnerSurcharge)})` },
            ]}
          />
          {partners > 1 && <input className="input mt-2" placeholder={t.stall.partnerName} aria-label={t.stall.partnerName} value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={t.stall.discount} htmlFor="disc">
          <input id="disc" className="input tabular" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, ''))} placeholder="0" />
        </Field>
        <Field label={t.stall.discountReason} htmlFor="disc-r">
          <input id="disc-r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!Number(discount)} />
        </Field>
      </div>
      <PriceBreakdown t={t} q={preview} />
      <div className="flex gap-2">
        <button className="btn flex-1" onClick={() => setMode('idle')}>
          {t.common.cancel}
        </button>
        <button className="btn btn-primary flex-1" onClick={mode === 'edit' ? doEdit : doConfirm}>
          <Icon name="check" size={18} /> {mode === 'edit' ? t.common.save : t.stall.confirm}
        </button>
      </div>
    </div>
  );

  return (
    <Sheet
      onClose={onClose}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t.stall.stall} #{code}
          <StatusBadge status={st.status} />
        </span>
      }
    >
      <div className="space-y-4">
        {/* Facts */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-surface-2 p-3 text-sm">
          <div>
            <dt className="text-muted">{t.stall.type}</dt>
            <dd className="flex items-center gap-1.5 font-semibold">
              {type?.accent && <span className="inline-block h-3 w-3 rounded-sm" style={{ background: type.accent }} aria-hidden />}
              {type?.name}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t.stall.size}</dt>
            <dd className="font-semibold">{type?.size}</dd>
          </div>
          <div>
            <dt className="text-muted">{t.stall.floor}</dt>
            <dd className="font-semibold">{floor?.name}</dd>
          </div>
          <div>
            <dt className="text-muted">{t.stall.price}</dt>
            <dd className="tabular font-semibold">
              {money(list.total)}
              {stall.isCorner && list.cornerAmt > 0 && <span className="ml-1 text-xs text-muted">({t.map.corner} +{money(list.cornerAmt)})</span>}
            </dd>
          </div>
          {type?.note && <div className="col-span-2 text-muted">{type.note}</div>}
        </dl>

        {error && (
          <div className="flex gap-2 rounded-xl bg-danger-soft p-3 font-semibold text-danger" role="alert">
            <Icon name="alert" /> {error}
          </div>
        )}

        {/* Who */}
        {st.exhibitor ? (
          <ExhibitorCard ex={st.exhibitor} t={t} />
        ) : picked ? (
          <div className="space-y-1">
            <ExhibitorCard ex={picked} t={t} />
            <button className="btn btn-sm btn-ghost" onClick={() => setPicked(undefined)}>
              {t.stall.changeExhibitor}
            </button>
          </div>
        ) : st.status === 'available' && !closed ? (
          <div className="space-y-2">
            <p className="text-muted">{t.stall.availableNow}</p>
            <p className="label">{t.stall.whoFor}</p>
            <ExhibitorPicker onPick={(ex) => { setPicked(ex); setError(undefined); }} />
          </div>
        ) : null}

        {/* Hold info */}
        {st.hold && (
          <div className="st st-on_hold flex items-center gap-2 rounded-xl border p-3 font-semibold">
            <Icon name="clock" />
            <span>
              {interpolate(t.stall.heldUntil, { time: fmtDateTime(st.hold.expiresAt, lang) })} · {interpolate(t.stall.expiresIn, { time: fmtCountdown(st.hold.expiresAt - now) })}
            </span>
          </div>
        )}

        {/* Booking money */}
        {st.booking && (
          <div className="space-y-2">
            <PriceBreakdown t={t} q={st.booking} reason={st.booking.discountReason} partnerName={st.booking.partnerName} />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-sm text-muted">{t.stall.paid}</p>
                <p className="tabular text-xl font-semibold">{money(st.paid)}</p>
              </div>
              <div className={`rounded-xl p-3 ${st.due > 0 ? 'bg-warn-soft text-warn-text' : 'bg-surface-2'}`}>
                <p className="text-sm">{t.stall.due}</p>
                <p className="tabular text-xl font-semibold">{money(st.due)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {!closed && mode === 'idle' && (
          <div className="grid gap-2">
            {st.status === 'available' && picked && (
              <>
                <div className="flex items-center gap-2">
                  <label className="label mb-0" htmlFor="hold-h">
                    {t.stall.holdHours}
                  </label>
                  <select id="hold-h" className="input w-28" value={holdHours} onChange={(e) => setHours(Number(e.target.value))}>
                    {Array.from(new Set([6, 12, 24, 48, 72, event.holdHours])).sort((a, b) => a - b).map((h) => (
                      <option key={h} value={h}>
                        {h}h
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-primary" onClick={doHold}>
                  <Icon name="clock" /> {t.stall.hold}
                </button>
                <button className="btn" onClick={() => startBookingOptions('confirm')}>
                  <Icon name="check" /> {t.stall.confirm}
                </button>
              </>
            )}
            {st.status === 'on_hold' && (
              <>
                <button className="btn btn-primary" onClick={() => startBookingOptions('confirm')}>
                  <Icon name="check" /> {t.stall.confirm}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="btn"
                    onClick={() => {
                      const r = exec((d, n) => extendHold(d, stallId, 24, n));
                      if (r.ok) toast(t.stall.extended);
                    }}
                  >
                    <Icon name="plus" /> {t.stall.extend}
                  </button>
                  <button className="btn" onClick={doLink}>
                    <Icon name="link" /> {t.stall.paymentLink}
                  </button>
                </div>
                {st.hold && <WaSendButton templateKey="hold_expiring" exhibitorId={st.hold.exhibitorId} eventId={event.id} label={t.whatsapp.sendHoldReminder} />}
              </>
            )}
            {st.booking && (
              <>
                {st.due > 0 && (
                  <button className="btn btn-primary" onClick={() => setMode('pay')}>
                    <Icon name="rupee" /> {t.stall.recordPayment}
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn" onClick={() => startBookingOptions('edit')}>
                    <Icon name="edit" /> {t.stall.editBooking}
                  </button>
                  {st.due > 0 && (
                    <button className="btn" onClick={doLink}>
                      <Icon name="link" /> {t.stall.paymentLink}
                    </button>
                  )}
                </div>
                <WaSendButton templateKey="booking_confirmation" exhibitorId={st.booking.exhibitorId} eventId={event.id} label={t.whatsapp.sendConfirmation} />
                {st.due > 0 && <WaSendButton templateKey="payment_reminder" exhibitorId={st.booking.exhibitorId} eventId={event.id} label={t.whatsapp.sendReminder} />}
              </>
            )}
            {st.status !== 'available' && (
              <button className="btn btn-danger" onClick={() => setConfirmRelease(true)}>
                <Icon name="trash" /> {t.stall.release}
              </button>
            )}
          </div>
        )}
        {(mode === 'confirm' || mode === 'edit') && (
          <div className="space-y-2">
            {target && mode === 'confirm' && <p className="font-semibold">{interpolate(t.stall.confirmFor, { name: target.ownerName })}</p>}
            {bookingOptions}
          </div>
        )}
        {mode === 'pay' && st.booking && (
          <div className="rounded-2xl border border-border p-3">
            <h3 className="mb-2 font-semibold">{t.payment.title}</h3>
            <PaymentForm bookingId={st.booking.id} due={st.due} onDone={() => setMode('idle')} onCancel={() => setMode('idle')} />
          </div>
        )}

        {/* Payment history */}
        {st.booking && (
          <div>
            <h3 className="mb-2 font-semibold">{t.stall.payments}</h3>
            {payments.length === 0 ? (
              <p className="text-muted">{t.stall.noPayments}</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-3">
                    <span className="tabular font-semibold">{money(p.amount)}</span>
                    <span className="tag">{t.payMode[p.mode]}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">{p.ref}</span>
                    <span className="text-sm text-muted">{fmtDate(p.date, lang, { day: 'numeric', month: 'short' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {confirmRelease && st.exhibitor && (
        <ConfirmDialog
          title={st.booking ? t.stall.releaseBookingTitle : t.stall.releaseHoldTitle}
          body={
            <>
              <p>{interpolate(t.stall.releaseBody, { stall: code, name: st.exhibitor.ownerName })}</p>
              {st.paid > 0 && <p className="font-semibold text-warn-text">{interpolate(t.stall.releasePaidWarning, { paid: money(st.paid) })}</p>}
            </>
          }
          confirmLabel={t.stall.release}
          onConfirm={doRelease}
          onClose={() => setConfirmRelease(false)}
        />
      )}
      {link && (
        <Modal title={t.stall.linkTitle} onClose={() => setLink(undefined)} footer={<button className="btn btn-primary" onClick={() => setLink(undefined)}>{t.common.done}</button>}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className="input tabular text-sm" readOnly value={link} aria-label={t.stall.linkTitle} />
              <button
                className="btn shrink-0"
                onClick={() => {
                  navigator.clipboard?.writeText(link).catch(() => {});
                  toast(t.common.copied);
                }}
              >
                {t.common.copy}
              </button>
            </div>
            <p className="flex gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn-text">
              <Icon name="info" /> {t.stall.linkNote}
            </p>
          </div>
        </Modal>
      )}
    </Sheet>
  );
}

function ExhibitorCard({ ex, t }: { ex: Exhibitor; t: Dict }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
      <Avatar name={ex.ownerName} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{ex.ownerName}</p>
        <p className="truncate text-sm text-muted">
          {ex.businessName} · <span className="tabular">{formatPhone(ex.phone)}</span>
        </p>
      </div>
      <Link to={`/exhibitors/${ex.id}`} className="btn btn-sm btn-ghost" aria-label={t.stall.viewProfile}>
        <Icon name="chevronRight" />
      </Link>
    </div>
  );
}

function PriceBreakdown({ t, q, reason, partnerName }: { t: Dict; q: { basePrice: number; cornerAmt: number; partnerAmt: number; discount: number; total: number }; reason?: string; partnerName?: string }) {
  const row = (label: string, v: string, strong = false) => (
    <div className={`flex justify-between ${strong ? 'border-t border-border pt-1 font-semibold' : 'text-sm'}`}>
      <span>{label}</span>
      <span className="tabular">{v}</span>
    </div>
  );
  return (
    <div className="space-y-1">
      {row(t.stall.base, money(q.basePrice))}
      {q.cornerAmt > 0 && row(t.stall.cornerAmt, `+${money(q.cornerAmt)}`)}
      {q.partnerAmt > 0 && row(`${t.stall.partnerAmt}${partnerName ? ` (${partnerName})` : ''}`, `+${money(q.partnerAmt)}`)}
      {q.discount > 0 && row(`${t.stall.discount.replace(' (₹)', '')}${reason ? ` – ${reason}` : ''}`, `−${money(q.discount)}`)}
      {row(t.stall.total, money(q.total), true)}
    </div>
  );
}
