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

/** Sign in with Google via a Firebase popup. Returns the Firebase ID token. */
export async function signInWithGoogle() {
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user.getIdToken();
}

/** Create a Firebase account with email/password. Sends a verification e-mail
 *  (Sprint 67) and returns the Firebase ID token. */
export async function signUpEmail(email, password) {
  const { createUserWithEmailAndPassword, sendEmailVerification } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  try { await sendEmailVerification(cred.user); } catch (_) { /* non-blocking */ }
  return cred.user.getIdToken();
}

/** Resend the verification e-mail to the currently signed-in Firebase user. */
export async function resendVerification() {
  const { sendEmailVerification } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  if (auth.currentUser) {
    try { await sendEmailVerification(auth.currentUser); } catch (_) { /* non-blocking */ }
  }
}

/** Change the account e-mail (Sprint 67). Firebase sends a confirmation link to
 *  the NEW address; the change only applies once the user clicks it, after which
 *  the backend syncs the Ziza account on the next token exchange. */
export async function changeEmail(newEmail) {
  const { verifyBeforeUpdateEmail } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  if (!auth.currentUser) throw new Error("Please sign in again to change your email.");
  await verifyBeforeUpdateEmail(auth.currentUser, newEmail);
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
