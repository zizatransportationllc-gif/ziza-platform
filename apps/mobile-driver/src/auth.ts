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

/** Create a Firebase account with email/password. Sends a verification e-mail
 *  (Sprint 67) and returns the Firebase ID token. */
export async function signUpEmail(email: string, password: string): Promise<string> {
  const fb: any = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const cred = await fb.createUserWithEmailAndPassword(auth, email, password);
  try { await fb.sendEmailVerification(cred.user); } catch (_) { /* non-blocking */ }
  return cred.user.getIdToken();
}

/** Resend the verification e-mail to the currently signed-in Firebase user. */
export async function resendVerification(): Promise<void> {
  const fb: any = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  if (auth.currentUser) {
    try { await fb.sendEmailVerification(auth.currentUser); } catch (_) { /* non-blocking */ }
  }
}

/** Change the account e-mail (Sprint 67). Firebase sends a confirmation link to
 *  the NEW address; the change applies once the user clicks it, after which the
 *  backend syncs the Ziza account on the next token exchange. */
export async function changeEmail(newEmail: string): Promise<void> {
  const fb: any = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  if (!auth.currentUser) throw new Error("Please sign in again to change your email.");
  await fb.verifyBeforeUpdateEmail(auth.currentUser, newEmail);
}

/** Sign out of Firebase (clears the RN-persisted session). */
export async function firebaseSignOut(): Promise<void> {
  if (!_auth) return;
  const fb: any = await import("firebase/auth");
  try { await fb.signOut(_auth); } catch (_) { /* best effort */ }
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
