import { useState, type ReactNode } from 'react';
import { CLOUD } from '../data/cloud-config';
import { useCloud } from '../data/store';
import { interpolate } from '../domain/format';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { LangToggle, LOGO } from './Shell';
import { Field } from './ui';

const cloud = () => import('../data/cloud');

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 pt-6">
        <img src={LOGO} alt="PAHRAVA — Fashion and Lifestyle Exhibition" className="logo-img h-11 w-auto max-w-[62%] object-contain object-left" />
        <div className="flex-1" />
        <LangToggle compact />
      </div>
      <div className="mx-auto max-w-md px-4 pt-8 pb-10">{children}</div>
    </div>
  );
}

function SignIn() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await (await cloud()).signIn(email, password);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setError(
        ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/missing-password'].includes(code)
          ? t.auth.wrong
          : code === 'auth/too-many-requests'
            ? t.auth.tooMany
            : code === 'auth/network-request-failed'
              ? t.auth.offline
              : t.auth.failed,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      <form
        className="card space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <h1 className="text-[26px] leading-[1.2] font-bold">{t.auth.title}</h1>
          <p className="mt-1 text-body">{t.auth.subtitle}</p>
        </div>
        <Field label={t.auth.email} htmlFor="si-email">
          <input id="si-email" className="input" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t.auth.password} htmlFor="si-password">
          <input id="si-password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && (
          <p className="flex items-center gap-1 text-sm font-semibold text-danger" role="alert">
            <Icon name="alert" size={16} /> {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? t.auth.signingIn : t.auth.submit}
        </button>
      </form>
    </Frame>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <Frame>
      <div className="flex flex-col items-center gap-3 py-16 text-muted" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-text" aria-hidden />
        {text}
      </div>
    </Frame>
  );
}

/** With Firebase configured: sign-in first, then wait for the live data. */
export function CloudGate({ children }: { children: ReactNode }) {
  const t = useT();
  const c = useCloud();
  if (!CLOUD || c.status === 'ready') return <>{children}</>;
  if (c.status === 'signed_out') return <SignIn />;
  if (c.status === 'no_access')
    return (
      <Frame>
        <div className="card space-y-4 p-6">
          <p className="font-semibold">{t.auth.noAccess}</p>
          {c.email && <p className="text-muted">{interpolate(t.auth.signedInAs, { email: c.email })}</p>}
          <button className="btn" onClick={() => void cloud().then((m) => m.signOutStaff())}>
            {t.auth.signOut}
          </button>
        </div>
      </Frame>
    );
  return <Loading text={c.status === 'connecting' ? t.sync.connecting : t.sync.loading} />;
}

/** Header pill: shows only while saving or offline. */
export function SyncStatus() {
  const t = useT();
  const c = useCloud();
  if (!CLOUD) return null;
  if (c.offline)
    return (
      <span className="tag gap-1 bg-warn-soft whitespace-nowrap text-warn-text" role="status" title={interpolate(t.sync.offline, { n: c.pending })}>
        <Icon name="alert" size={14} />
        <span className="sm:hidden">{c.pending}</span>
        <span className="hidden sm:inline">{interpolate(t.sync.offline, { n: c.pending })}</span>
      </span>
    );
  if (c.pending > 0)
    return (
      <span className="tag whitespace-nowrap" role="status">
        {t.sync.saving}
      </span>
    );
  return null;
}

export const signOutStaff = () => cloud().then((m) => m.signOutStaff());
