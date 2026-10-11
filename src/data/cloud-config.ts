// Firebase web config. These values identify the project; they are not secrets
// (access is controlled by sign-in and firestore.rules). Leave VITE_FIREBASE_API_KEY
// empty to run the app on this browser's local storage only.
const env = import.meta.env;

export const firebaseConfig = env.VITE_FIREBASE_API_KEY
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY as string,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
      projectId: env.VITE_FIREBASE_PROJECT_ID as string,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
      appId: env.VITE_FIREBASE_APP_ID as string,
    }
  : null;

/** Point at the local Firebase emulators (npm run dev:emulator). */
export const useEmulator = env.VITE_FIREBASE_EMULATOR === 'true';

export const CLOUD = firebaseConfig !== null;
