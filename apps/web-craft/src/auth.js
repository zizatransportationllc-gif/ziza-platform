/**
 * Firebase auth helper for web-craft — Sprint 66.
 * Active only when VITE_FIREBASE_API_KEY is set; otherwise the app falls back
 * to the DEV /v1/token flow.
 * NOT shared across frontends (isolation rule).
 */
const FIREBASE_CONFIG = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

export const firebaseEnabled = Boolean(FIREBASE_CONFIG.apiKey);

let _auth = null;

async function getFirebaseAuth() {
  if (_auth) return _auth;
  const { initializeApp, getApps } = await import("firebase/app");
  const { getAuth } = await import("firebase/auth");
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  _auth = getAuth(app);
  return _auth;
}

/** Create a Firebase account with email/password. Returns the Firebase ID token. */
export async function signUpEmail(email, password) {
  const { createUserWithEmailAndPassword } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user.getIdToken();
}

/** Sign in with an existing Firebase email/password. Returns the Firebase ID token. */
export async function signInEmail(email, password) {
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user.getIdToken();
}

/** Sign out of Firebase. */
export async function firebaseSignOut() {
  if (!_auth) return;
  const { signOut } = await import("firebase/auth");
  await signOut(_auth);
}
