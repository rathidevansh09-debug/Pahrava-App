// Shared database: Firebase Auth (staff sign-in) + Firestore.
//
// The screen shows the last confirmed database state with this device's
// unconfirmed changes ("ops") applied on top. Each op is then re-run inside a
// Firestore transaction against the latest shared data — the same domain code,
// the same ids — so if another phone took the stall first, the op fails there,
// is dropped here, and the user is told. Transactions are retried by Firestore
// when the data changes underneath them, so two writes can never both win.
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
  type Firestore,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { produce } from 'immer';
import { toast } from '../components/ui';
import { dictionaries } from '../i18n';
import { uid, withIdTape } from '../lib/id';
import { chunkIds, decode, diff, META_ID, type Meta } from './codec';
import { firebaseConfig, REQUIRE_LOGIN, useEmulator } from './cloud-config';
import { createStarter } from './seed';
import { emptyDB, registerCloud, setCloud, useStore } from './store';
import type { DB } from './types';

export const COLLECTION = 'pahrava';

interface Op {
  id: string;
  fn: (db: DB, now: number) => unknown;
  now: number;
  ids: string[];
  /** What the op returned on screen — compared with the database re-run. */
  local: unknown;
  /** Set once the database has the op; dropped when a snapshot includes it. */
  committedRev?: number;
}

let fs: Firestore;
let auth: Auth;
let confirmed: DB | null = null;
let ops: Op[] = [];
let flushing = false;
let unsubData: Unsubscribe | null = null;

const t = () => dictionaries[useStore.getState().prefs.lang];
const ref = (id: string) => doc(fs, COLLECTION, id);

function apply(db: DB, op: Op): DB {
  return produce(db, (d) => {
    withIdTape(op.ids, () => op.fn(d as DB, op.now));
  });
}

/** Re-derive what the screen shows: confirmed data + unconfirmed ops. */
function refresh() {
  if (!confirmed) return;
  const db = ops.reduce(apply, confirmed);
  useStore.setState({ db });
  setCloud({ pending: ops.filter((o) => o.committedRev === undefined).length });
}

// ---------- Writes

function exec<R>(fn: (db: DB, now: number) => R): R {
  const now = Date.now();
  const base = useStore.getState().db;
  let out!: { result: R; ids: string[] };
  const next = produce(base, (d) => {
    out = withIdTape([], () => fn(d as DB, now));
  });
  if (next !== base) {
    ops.push({ id: uid('op'), fn, now, ids: out.ids, local: out.result });
    useStore.setState({ db: next, now });
    setCloud({ pending: ops.filter((o) => o.committedRev === undefined).length });
    void flush();
  }
  return out.result;
}

/** Read the whole store inside a transaction (meta + its chunks, ~20 reads). */
async function readAll(tx: Transaction): Promise<{ meta: Meta; db: DB } | null> {
  const metaSnap = await tx.get(ref(META_ID));
  if (!metaSnap.exists()) return null;
  const meta = metaSnap.data() as Meta;
  const snaps = await Promise.all(chunkIds(meta).map((id) => tx.get(ref(id))));
  const db = decode(meta, new Map(snaps.map((s) => [s.id, s.data() as { items: unknown[] } | undefined])));
  return { meta, db };
}

function write(tx: Transaction, prev: DB | null, next: DB, rev: number, recent: string[]) {
  for (const w of diff(prev, next, rev, recent)) {
    if ('delete' in w) tx.delete(ref(w.id));
    else tx.set(ref(w.id), w.data);
  }
}

async function commit(op: Op): Promise<{ remote: unknown; rev: number }> {
  return runTransaction(fs, async (tx) => {
    const cur = await readAll(tx);
    if (!cur) throw Object.assign(new Error('Database is empty'), { code: 'not-found' });
    const { meta, db } = cur;
    // Already applied (the reply to an earlier attempt was lost): don't apply twice.
    if (meta.recent?.includes(op.id)) return { remote: op.local, rev: meta.rev };
    let remote: unknown;
    const next = produce(db, (d) => {
      remote = withIdTape(op.ids, () => op.fn(d as DB, op.now)).result;
    });
    if (next === db) return { remote, rev: meta.rev };
    write(tx, db, next, meta.rev + 1, [...(meta.recent ?? []), op.id]);
    return { remote, rev: meta.rev + 1 };
  });
}

const isFail = (r: unknown): r is { ok: false; error: string } => !!r && typeof r === 'object' && (r as { ok?: unknown }).ok === false;
const isOk = (r: unknown) => !!r && typeof r === 'object' && (r as { ok?: unknown }).ok === true;
const TRANSIENT = new Set(['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted', 'internal', 'cancelled', 'unknown']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function flush() {
  if (flushing) return;
  flushing = true;
  let delay = 1000;
  try {
    for (;;) {
      const op = ops.find((o) => o.committedRev === undefined);
      if (!op) break;
      try {
        const { remote, rev } = await commit(op);
        delay = 1000;
        setCloud({ offline: false });
        if (isOk(op.local) && isFail(remote)) {
          // Someone else got there first: drop ours, show theirs.
          ops = ops.filter((o) => o !== op);
          toast(remote.error === 'taken' ? t().sync.taken : t().sync.conflict, 'error');
        } else if (confirmed && rev <= confirmed.rev) {
          // Nothing new to wait for (no-op on the server, or snapshot already here).
          ops = ops.filter((o) => o !== op);
        } else {
          op.committedRev = rev;
        }
        refresh();
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        if (TRANSIENT.has(code)) {
          setCloud({ offline: true });
          await sleep(delay);
          delay = Math.min(delay * 2, 30_000);
          continue;
        }
        console.error('Save failed', e);
        ops = ops.filter((o) => o !== op);
        toast(code === 'permission-denied' || code === 'unauthenticated' ? t().sync.denied : t().sync.failed, 'error');
        refresh();
      }
    }
  } finally {
    flushing = false;
  }
}

/** First sign-in on a new project: start with the event layouts, no demo bookings. */
async function seedIfEmpty() {
  await runTransaction(fs, async (tx) => {
    const metaSnap = await tx.get(ref(META_ID));
    if (metaSnap.exists()) return;
    write(tx, null, createStarter(), 1, []);
  });
}

async function reset() {
  ops = [];
  await runTransaction(fs, async (tx) => {
    const cur = await readAll(tx);
    write(tx, cur?.db ?? null, createStarter(), (cur?.meta.rev ?? 0) + 1, []);
  });
}

// ---------- Reads

function subscribe() {
  unsubData?.();
  setCloud({ status: 'loading' });
  unsubData = onSnapshot(
    collection(fs, COLLECTION),
    (snap) => {
      const docs = new Map(snap.docs.map((d) => [d.id, d.data()]));
      const meta = docs.get(META_ID) as Meta | undefined;
      if (!meta) {
        if (!snap.metadata.fromCache) seedIfEmpty().catch((e) => console.error('Seeding failed', e));
        return;
      }
      confirmed = decode(meta, docs as Map<string, { items: unknown[] }>);
      const recent = new Set(meta.recent ?? []);
      ops = ops.filter((o) => !recent.has(o.id) && !(o.committedRev !== undefined && o.committedRev <= meta.rev));
      refresh();
      setCloud({ status: 'ready' });
    },
    (err) => {
      console.error('Live data error', err);
      setCloud({ status: err.code === 'permission-denied' ? 'no_access' : 'loading' });
    },
  );
}

// ---------- Auth

export async function signIn(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

/** Check the current password, then set a new one. */
export async function changePassword(current: string, next: string) {
  const user = auth.currentUser;
  if (!user?.email) throw Object.assign(new Error('Not signed in'), { code: 'auth/requires-recent-login' });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  await updatePassword(user, next);
}

export async function signOutStaff() {
  await signOut(auth);
}

let started = false;

export function startCloud() {
  if (started) return; // React dev mode runs effects twice
  started = true;
  const app = initializeApp(firebaseConfig!);
  fs = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: useEmulator ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  auth = getAuth(app);
  if (useEmulator) {
    connectFirestoreEmulator(fs, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  registerCloud({ exec, reset });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      setCloud({ email: user.email ?? undefined });
      subscribe();
    } else if (!REQUIRE_LOGIN) {
      // Login switched off: connect with an invisible guest identity.
      setCloud({ status: 'connecting' });
      signInAnonymously(auth).catch((e) => {
        console.error('Could not connect', e);
        setCloud({ status: 'no_access' });
      });
    } else {
      unsubData?.();
      unsubData = null;
      confirmed = null;
      ops = [];
      useStore.setState({ db: emptyDB() });
      setCloud({ status: 'signed_out', email: undefined, pending: 0, offline: false });
    }
  });

  // Warn before closing the tab while changes are still being saved.
  window.addEventListener('beforeunload', (e) => {
    if (useStore.getState().cloud.pending > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
