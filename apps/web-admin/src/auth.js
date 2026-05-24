/**
 * Firebase auth helper for web-admin — Sprint 3.
 * Google Sign-In is only available when VITE_FIREBASE_API_KEY is set.
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

export async function signInWithGoogle() {
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user.getIdToken();
}

export async function firebaseSignOut() {
  if (!_auth) return;
  const { signOut } = await import("firebase/auth");
  await signOut(_auth);
}
