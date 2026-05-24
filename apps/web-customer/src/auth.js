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

/** Sign out of Firebase. */
export async function firebaseSignOut() {
  if (!_auth) return;
  const { signOut } = await import("firebase/auth");
  await signOut(_auth);
}
