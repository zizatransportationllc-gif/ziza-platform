/**
 * Firebase auth helper for mobile-driver — Sprint 66.
 * Firebase JS SDK with React Native (AsyncStorage) persistence.
 * Active only when EXPO_PUBLIC_FIREBASE_API_KEY is set; otherwise the app
 * falls back to the DEV /v1/token flow.
 * NOT shared across apps (isolation rule). See metro.config.js for the
 * Expo + Firebase 10 resolver workaround.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
};

export const firebaseEnabled = Boolean(FIREBASE_CONFIG.apiKey);

let _auth: any = null;

async function getFirebaseAuth(): Promise<any> {
  if (_auth) return _auth;
  const { initializeApp, getApps } = await import("firebase/app");
  const fb: any = await import("firebase/auth");
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG as any);
  _auth = fb.initializeAuth(app, {
    persistence: fb.getReactNativePersistence(AsyncStorage),
  });
  return _auth;
}

/** Create a Firebase account with email/password. Returns the Firebase ID token. */
export async function signUpEmail(email: string, password: string): Promise<string> {
  const fb: any = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const cred = await fb.createUserWithEmailAndPassword(auth, email, password);
  return cred.user.getIdToken();
}

/** Sign in with an existing Firebase email/password. Returns the Firebase ID token. */
export async function signInEmail(email: string, password: string): Promise<string> {
  const fb: any = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const cred = await fb.signInWithEmailAndPassword(auth, email, password);
  return cred.user.getIdToken();
}

/** Send a Firebase password-reset email to the given address. */
export async function sendPasswordReset(email: string): Promise<void> {
  const fb: any = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  await fb.sendPasswordResetEmail(auth, email);
}
