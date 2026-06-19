/**
 * Firebase auth helper for web-customer — Sprint 3.
 * Google Sign-In is only available when VITE_FIREBASE_API_KEY is set.
 * Falls back to email/password (DevAdapter) when not configured.
 */

const FIREBASE_CONFIG = {
  apiKey:    import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

/** True when Firebase credentials are present in the build. */
export const firebaseEnabled = Boolean(FIREBASE_CONFIG.apiKey);

let _app = null;
let _auth = null;

async function getFirebaseAuth() {
  if (_auth) return _auth;
  const { initializeApp, getApps } = await import("firebase/app");
  const { getAuth } = await import("firebase/auth");
  _app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  _auth = getAuth(_app);
  return _auth;
}

/**
 * Sign in with a Google popup.
 * Returns the Firebase ID token string.
 */
export async function signInWithGoogle() {
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user.getIdToken();
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

/** Send a Firebase password-reset email to the given address. */
export async function sendPasswordReset(email) {
  const { sendPasswordResetEmail } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  await sendPasswordResetEmail(auth, email);
}

/** Sign out of Firebase. */
export async function firebaseSignOut() {
  if (!_auth) return;
  const { signOut } = await import("firebase/auth");
  await signOut(_auth);
}
