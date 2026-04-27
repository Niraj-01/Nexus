import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  type Auth,
} from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import {
  getStorage,
  connectStorageEmulator,
  type FirebaseStorage,
} from "firebase/storage";
import {
  getFunctions,
  connectFunctionsEmulator,
  type Functions,
} from "firebase/functions";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";

export const firebaseApp: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

// Cache singletons on globalThis so Next.js HMR doesn't create stale duplicates
// (re-evaluating this module would otherwise leak Firestore listeners and trip
// the SDK's "Unexpected state (ID: ca9)" internal assertion).
type GlobalCache = {
  __nexusFirestore?: Firestore;
  __nexusEmulatorsConnected?: boolean;
};
const g = globalThis as unknown as GlobalCache;

export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore =
  g.__nexusFirestore ??
  (g.__nexusFirestore = (() => {
    try {
      return initializeFirestore(firebaseApp, {
        experimentalAutoDetectLongPolling: true,
      });
    } catch {
      return getFirestore(firebaseApp);
    }
  })());
export const storage: FirebaseStorage = getStorage(firebaseApp);
export const functions: Functions = getFunctions(firebaseApp, "asia-south1");
export const googleProvider = new GoogleAuthProvider();

let appCheckInstance: AppCheck | null = null;

export function getAppCheckClient(): AppCheck | null {
  if (typeof window === "undefined") return null;
  if (appCheckInstance) return appCheckInstance;

  const siteKey = process.env.NEXT_PUBLIC_APP_CHECK_SITE_KEY;
  if (!siteKey) return null;

  appCheckInstance = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}

if (typeof window !== "undefined" && USE_EMULATORS) {
  if (!g.__nexusEmulatorsConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    g.__nexusEmulatorsConnected = true;
  }
}
