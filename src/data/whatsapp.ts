// Calls to the WhatsApp server (functions/src/index.ts). Loaded only when
// WhatsApp is switched on, so the Firebase Functions SDK stays out of the main bundle.
import { useEmulator } from './cloud-config';

let connected = false;

export async function callWa<T = unknown>(name: string, data?: unknown): Promise<T> {
  const [{ getApp }, { getFunctions, httpsCallable, connectFunctionsEmulator }] = await Promise.all([import('firebase/app'), import('firebase/functions')]);
  const fns = getFunctions(getApp(), 'asia-south1');
  if (useEmulator && !connected) {
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    connected = true;
  }
  const res = await httpsCallable(fns, name, { timeout: 540_000 })(data);
  return res.data as T;
}

/** A readable message from a failed call. */
export const waError = (e: unknown) => (e as { message?: string }).message ?? String(e);
