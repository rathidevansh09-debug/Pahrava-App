import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import type { StallStatus } from '../data/types';
import { initials } from '../domain/format';
import { useT } from '../i18n';
import { Icon } from './Icon';

// ---------- Status

export function StatusBadge({ status, short = false, className = '' }: { status: StallStatus; short?: boolean; className?: string }) {
  const t = useT();
  return (
    <span className={`st st-${status} inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${className}`}>
      <Icon name={`st-${status}`} size={16} />
      {short ? t.statusShort[status] : t.status[status]}
    </span>
  );
}

// ---------- Empty state

export function EmptyState({ icon = 'info', title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name={icon} size={24} />
      </span>
      <p className="text-lg font-semibold">{title}</p>
      {hint && <p className="max-w-md text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------- Avatar

const AVATAR_COLOURS = ['#7a1f5c', '#1d5f8a', '#2d6a3e', '#8a4b12', '#5b3a8c', '#8a1c2b', '#0f6e6e', '#6b5a14'];
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: AVATAR_COLOURS[h % AVATAR_COLOURS.length], fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

// ---------- Overlay plumbing

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

function useFocusOnOpen(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current;
    el?.focus();
    return () => prev?.focus?.();
  }, [ref]);
}

/** Side panel on desktop (≥768px), bottom sheet on phones. */
export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEscape(onClose);
  useFocusOnOpen(ref);
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40 [animation:fade-in_.15s]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl bg-surface shadow-2xl outline-none [animation:sheet-up_.2s_ease-out] md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[440px] md:rounded-none md:[animation:panel-in_.2s_ease-out]"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-border md:hidden" />
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <h2 id={titleId} className="min-w-0 flex-1 text-lg font-bold">
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label={t.common.close}>
            <Icon name="x" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEscape(onClose);
  useFocusOnOpen(ref);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/45 [animation:fade-in_.15s]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl outline-none sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <h2 id={titleId} className="flex-1 text-lg font-bold">
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label={t.common.close}>
            <Icon name="x" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} data-autofocus>
            {t.common.cancel}
          </button>
          <button
            className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-2 text-base">{body}</div>
    </Modal>
  );
}

// ---------- Toasts

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}
const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }));
let toastSeq = 0;
export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = ++toastSeq;
  useToasts.setState((s) => ({ list: [...s.list, { id, text, kind }] }));
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((x) => x.id !== id) })), kind === 'error' ? 6000 : 3500);
}
export function Toasts() {
  const list = useToasts((s) => s.list);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
      {list.map((x) => (
        <div
          key={x.id}
          className={`pointer-events-auto flex max-w-lg items-center gap-2 rounded-xl px-4 py-3 font-semibold shadow-lg [animation:fade-in_.15s] ${
            x.kind === 'error' ? 'bg-danger text-white dark:text-[#2b0b09]' : 'bg-text text-bg'
          }`}
        >
          <Icon name={x.kind === 'error' ? 'alert' : 'check'} size={18} />
          {x.text}
        </div>
      ))}
    </div>
  );
}

// ---------- Form bits

export function Field({ label, error, children, hint, htmlFor }: { label: ReactNode; error?: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-danger" role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[40px] rounded-lg px-3 text-sm font-semibold ${value === o.value ? 'bg-surface shadow text-text' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChipToggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {pressed && <Icon name="check" size={14} />}
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`tabular mt-1 text-2xl font-bold ${tone ?? ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}
