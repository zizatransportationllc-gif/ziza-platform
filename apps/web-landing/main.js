/**
 * Ziza Landing Page — main.js
 * Sprint 51 — WYSIWYG Editor
 *
 * Features:
 *  - Animated stat counters on scroll
 *  - Environment-aware links (driver app + customer app)
 *  - Live stats from API (graceful fallback)
 *  - Earnings bar animation
 *  - Admin WYSIWYG inline editor (admin login required)
 *
 * App URLs come from env-config.js (generated at container startup):
 *   window.ZIZA_DRIVER_URL   — web-driver app  (e.g. http://localhost:3002)
 *   window.ZIZA_CUSTOMER_URL — web-customer app (e.g. http://localhost:3001)
 *   window.ZIZA_CRAFT_URL    — web-craft app   (e.g. http://localhost:3004)
 *   window.ZIZA_API_URL      — API base URL
 */

const API_BASE      = window.ZIZA_API_URL      || "http://localhost:8000";
const DRIVER_URL    = window.ZIZA_DRIVER_URL   || "http://localhost:3002";
const CUSTOMER_URL  = window.ZIZA_CUSTOMER_URL || "http://localhost:3001";
const CRAFT_URL     = window.ZIZA_CRAFT_URL    || "http://localhost:3004";

// Firebase web config (public by design). When ZIZA_FIREBASE_API_KEY is set
// (prod), the admin editor signs in via Firebase — Google popup or email /
// password — and exchanges the ID token for a Ziza admin JWT. POST /v1/token
// is 404 in prod, so the DEV email+password flow is the fallback only when no
// Firebase key is present (local dev).
const FIREBASE_API_KEY     = window.ZIZA_FIREBASE_API_KEY     || "";
const FIREBASE_AUTH_DOMAIN = window.ZIZA_FIREBASE_AUTH_DOMAIN || "";
const FIREBASE_PROJECT_ID  = window.ZIZA_FIREBASE_PROJECT_ID  || "";
const firebaseEnabled      = !!FIREBASE_API_KEY;

// URL for the driver sign-up form: ?signup=1 makes web-driver open the
// "Create Account" tab directly instead of the sign-in form.
const DRIVER_SIGNUP_URL  = `${DRIVER_URL}?signup=1`;

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------

function animateCounter(el, target, duration = 1500) {
  const start = performance.now();

  function tick(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease     = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current  = Math.round((target) * ease);
    el.textContent = current.toLocaleString("fr-FR");
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Stats — try to load from public /v1/stats, fall back to zeros
// ---------------------------------------------------------------------------

const FALLBACK_STATS = { trips: 0, drivers: 0, cities: 1 };

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/v1/stats`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error("stats not available");
    const data = await res.json();
    return {
      trips:   data.total_trips   ?? FALLBACK_STATS.trips,
      drivers: data.total_drivers ?? FALLBACK_STATS.drivers,
      cities:  1,
    };
  } catch {
    return FALLBACK_STATS;
  }
}

function initStats() {
  const statNums = document.querySelectorAll(".stat-num");
  if (statNums.length === 0) return;

  loadStats().then((stats) => {
    const targets = [stats.trips, stats.drivers, stats.cities];
    statNums.forEach((el, i) => {
      el.dataset.target = targets[i] ?? 0;
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el     = entry.target;
        const target = parseInt(el.dataset.target || "0", 10);
        animateCounter(el, target);
        observer.unobserve(el);
      });
    },
    { threshold: 0.5 },
  );

  statNums.forEach((el) => observer.observe(el));
}

// ---------------------------------------------------------------------------
// Earnings bar animation
// ---------------------------------------------------------------------------

function initEarningsBar() {
  const bar = document.querySelector(".earnings-fill");
  if (!bar) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        bar.style.width = bar.style.width || "65%";
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.3 },
  );

  observer.observe(bar);
}

// ---------------------------------------------------------------------------
// App links — set href on all "Become a driver" and "Take a ride" anchors
// ---------------------------------------------------------------------------

function setLink(id, url) {
  const el = document.getElementById(id);
  if (!el) return;
  el.href = url;
  // Open in the same tab (seamless navigation)
  el.removeAttribute("target");
}

function initAppLinks() {
  // "Become a driver" links → web-driver sign-up form (?signup=1)
  setLink("nav-become-driver",  DRIVER_SIGNUP_URL);
  setLink("hero-become-driver", DRIVER_SIGNUP_URL);
  setLink("apply-btn",          DRIVER_SIGNUP_URL);
  setLink("footer-become-driver", DRIVER_SIGNUP_URL);

  // "Take a ride" links → web-customer app
  setLink("nav-take-ride",    CUSTOMER_URL);
  setLink("hero-take-ride",   CUSTOMER_URL);
  setLink("footer-take-ride", CUSTOMER_URL);

  // "Join our road-side assistance team" → web-craft app (Ziza Craft)
  setLink("footer-join-craft", CRAFT_URL);
}

// ---------------------------------------------------------------------------
// Header scroll shadow
// ---------------------------------------------------------------------------

function initHeader() {
  const header = document.querySelector(".header");
  if (!header) return;
  window.addEventListener(
    "scroll",
    () => {
      header.style.boxShadow =
        window.scrollY > 20 ? "0 2px 20px rgba(0,0,0,.08)" : "none";
    },
    { passive: true },
  );
}

// ---------------------------------------------------------------------------
// Coming soon toast — store buttons
// ---------------------------------------------------------------------------

let _toastTimer = null;

function showComingSoon() {
  const toast = document.getElementById("coming-soon-toast");
  if (!toast) return;

  // Cancel any running timer and reset state
  if (_toastTimer) clearTimeout(_toastTimer);
  toast.classList.remove("fade-out");
  toast.hidden = false;

  // After 2 s start the fade-out (0.4 s transition), then hide
  _toastTimer = setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => { toast.hidden = true; }, 400);
  }, 2000);
}

function initStoreButtons() {
  document.querySelectorAll(".store-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      showComingSoon();
    });
  });
}

// ---------------------------------------------------------------------------
// Admin WYSIWYG editor — Sprint 51
// ---------------------------------------------------------------------------

const ADMIN_TOKEN_KEY = "ziza_landing_admin_token";

/** Decode the JWT payload (base64url → JSON) — no signature check, UI only. */
function decodeJwtPayload(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch { return null; }
}

/** Returns true when the token is present, admin-role, and not expired. */
function isAdminToken(token) {
  if (!token) return false;
  const p = decodeJwtPayload(token);
  if (!p) return false;
  if (p.exp && p.exp * 1000 < Date.now()) return false;
  return p.role === "admin";
}

// ---------------------------------------------------------------------------
// Content loading — apply stored HTML from API to [data-editable] elements
// ---------------------------------------------------------------------------

async function loadContent() {
  try {
    const res = await fetch(`${API_BASE}/v1/landing/content`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const { content } = await res.json();
    Object.entries(content).forEach(([key, html]) => {
      const el = document.querySelector(`[data-editable="${key}"]`);
      if (el) el.innerHTML = html;
    });
  } catch { /* page keeps default HTML on error */ }
}

// ---------------------------------------------------------------------------
// Admin login modal
// ---------------------------------------------------------------------------

function showAdminModal() {
  const modal = document.getElementById("admin-login-modal");
  if (!modal) return;
  modal.hidden = false;
  // Clear previous state
  const errEl = document.getElementById("admin-login-error");
  if (errEl) errEl.hidden = true;
  document.getElementById("admin-email")?.focus();
}

function hideAdminModal() {
  const modal = document.getElementById("admin-login-modal");
  if (modal) modal.hidden = true;
}

// --- Firebase (lazy-loaded compat SDK) ---------------------------------------

const FIREBASE_SDK_VERSION = "10.12.2";
let _firebaseReady = null;

/** Inject a <script> and resolve once it has loaded. */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Load + initialize the Firebase compat SDK once. Returns firebase.auth(). */
async function ensureFirebaseAuth() {
  if (!firebaseEnabled) throw new Error("Firebase is not configured");
  if (!_firebaseReady) {
    _firebaseReady = (async () => {
      if (!window.firebase?.auth) {
        await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`);
        await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth-compat.js`);
      }
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp({
          apiKey: FIREBASE_API_KEY,
          authDomain: FIREBASE_AUTH_DOMAIN,
          projectId: FIREBASE_PROJECT_ID,
        });
      }
    })();
  }
  await _firebaseReady;
  return window.firebase.auth();
}

/** Exchange a Firebase ID token for a Ziza admin JWT (role resolved from DB). */
async function exchangeFirebaseIdToken(idToken) {
  const res = await fetch(`${API_BASE}/v1/auth/firebase`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ id_token: idToken, role: "admin" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Sign-in failed");
  }
  const { access_token } = await res.json();
  return access_token;
}

function friendlyFirebaseError(code) {
  if (/wrong-password|user-not-found|invalid-credential|invalid-email/.test(code || "")) {
    return "Invalid credentials";
  }
  if (/popup-closed-by-user|cancelled-popup-request/.test(code || "")) {
    return "Sign-in cancelled";
  }
  if (/unauthorized-domain/.test(code || "")) {
    return "This domain is not authorized for Google sign-in (Firebase settings).";
  }
  return null;
}

/** Email + password sign-in. Firebase in prod, DEV /v1/token fallback locally. */
async function loginWithEmail(email, password) {
  if (firebaseEnabled) {
    const auth = await ensureFirebaseAuth();
    let cred;
    try {
      cred = await auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      throw new Error(friendlyFirebaseError(e.code) || e.message || "Sign-in failed");
    }
    const idToken = await cred.user.getIdToken();
    return exchangeFirebaseIdToken(idToken);
  }
  // DEV fallback (POST /v1/token is 404 in prod).
  const res = await fetch(`${API_BASE}/v1/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Invalid credentials");
  }
  const { access_token } = await res.json();
  return access_token;
}

/** Google popup sign-in (Firebase only). */
async function loginWithGoogle() {
  const auth = await ensureFirebaseAuth();
  const provider = new window.firebase.auth.GoogleAuthProvider();
  let cred;
  try {
    cred = await auth.signInWithPopup(provider);
  } catch (e) {
    throw new Error(friendlyFirebaseError(e.code) || e.message || "Sign-in failed");
  }
  const idToken = await cred.user.getIdToken();
  return exchangeFirebaseIdToken(idToken);
}

/** Validate the admin token, store it, and reveal the editor toolbar. */
function onAdminAuthenticated(accessToken) {
  if (!isAdminToken(accessToken)) {
    throw new Error("This account does not have admin access.");
  }
  localStorage.setItem(ADMIN_TOKEN_KEY, accessToken);
  hideAdminModal();
  activateAdminBar();
}

async function handleAdminLogin() {
  const email    = document.getElementById("admin-email")?.value.trim();
  const password = document.getElementById("admin-password")?.value;
  const errEl    = document.getElementById("admin-login-error");
  const btn      = document.getElementById("admin-login-submit");

  if (!email || !password) {
    if (errEl) { errEl.textContent = "Please enter your email and password."; errEl.hidden = false; }
    return;
  }
  if (errEl) errEl.hidden = true;
  if (btn) btn.disabled = true;

  try {
    onAdminAuthenticated(await loginWithEmail(email, password));
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.hidden = false; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleGoogleLogin() {
  const errEl = document.getElementById("admin-login-error");
  const btn   = document.getElementById("admin-google-btn");
  if (errEl) errEl.hidden = true;
  if (btn) btn.disabled = true;

  try {
    onAdminAuthenticated(await loginWithGoogle());
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.hidden = false; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Admin toolbar
// ---------------------------------------------------------------------------

let _editMode = false;

function activateAdminBar() {
  const bar = document.getElementById("admin-toolbar");
  if (bar) bar.hidden = false;
}

function enterEditMode() {
  _editMode = true;
  document.querySelectorAll("[data-editable]").forEach((el) => {
    el.contentEditable = "true";
    el.classList.add("editable-active");
  });
  const formatBtns = document.getElementById("admin-format-btns");
  const saveBtn    = document.getElementById("admin-save-btn");
  const toggleBtn  = document.getElementById("admin-edit-toggle");
  if (formatBtns) formatBtns.hidden = false;
  if (saveBtn)    saveBtn.hidden    = false;
  if (toggleBtn)  { toggleBtn.textContent = "✏ Editing…"; toggleBtn.classList.add("active"); }
  document.body.classList.add("edit-mode");
}

function exitEditMode() {
  _editMode = false;
  document.querySelectorAll("[data-editable]").forEach((el) => {
    el.contentEditable = "false";
    el.classList.remove("editable-active");
  });
  const formatBtns = document.getElementById("admin-format-btns");
  const saveBtn    = document.getElementById("admin-save-btn");
  const toggleBtn  = document.getElementById("admin-edit-toggle");
  if (formatBtns) formatBtns.hidden = true;
  if (saveBtn)    saveBtn.hidden    = true;
  if (toggleBtn)  { toggleBtn.textContent = "✏ Edit"; toggleBtn.classList.remove("active"); }
  document.body.classList.remove("edit-mode");
}

async function saveContent() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) return;

  const content = {};
  document.querySelectorAll("[data-editable]").forEach((el) => {
    content[el.dataset.editable] = el.innerHTML;
  });

  const btn = document.getElementById("admin-save-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

  try {
    const res = await fetch(`${API_BASE}/v1/landing/content`, {
      method:  "PATCH",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Save failed");
    }
    if (btn) {
      btn.textContent = "✓ Saved!";
      setTimeout(() => { btn.textContent = "💾 Save"; btn.disabled = false; }, 2000);
    }
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert("Could not save: " + err.message);
    if (btn) { btn.textContent = "💾 Save"; btn.disabled = false; }
  }
}

function logoutAdmin() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  if (_editMode) exitEditMode();
  const bar = document.getElementById("admin-toolbar");
  if (bar) bar.hidden = true;
}

// ---------------------------------------------------------------------------
// Init admin mode
// ---------------------------------------------------------------------------

function initAdminMode() {
  // Trigger link in footer
  document.getElementById("admin-trigger")?.addEventListener("click", (e) => {
    e.preventDefault();
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (token && isAdminToken(token)) {
      activateAdminBar();
    } else {
      showAdminModal();
    }
  });

  // Reveal Google sign-in (+ divider) when Firebase is configured (prod).
  if (firebaseEnabled) {
    const gBtn = document.getElementById("admin-google-btn");
    const divider = document.getElementById("admin-login-divider");
    if (gBtn) { gBtn.hidden = false; gBtn.addEventListener("click", handleGoogleLogin); }
    if (divider) divider.hidden = false;
  }

  // Show / hide the password field
  document.getElementById("admin-show-pw")?.addEventListener("change", (e) => {
    const pw = document.getElementById("admin-password");
    if (pw) pw.type = e.target.checked ? "text" : "password";
  });

  // Modal buttons
  document.getElementById("admin-login-submit")?.addEventListener("click", handleAdminLogin);
  document.getElementById("admin-login-cancel")?.addEventListener("click", hideAdminModal);

  // Keyboard shortcuts inside modal
  document.getElementById("admin-login-modal")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  handleAdminLogin();
    if (e.key === "Escape") hideAdminModal();
  });

  // Click on backdrop closes modal
  document.querySelector(".admin-modal-backdrop")?.addEventListener("click", hideAdminModal);

  // Toolbar buttons
  document.getElementById("admin-edit-toggle")?.addEventListener("click", () => {
    if (_editMode) exitEditMode(); else enterEditMode();
  });
  document.getElementById("admin-save-btn")?.addEventListener("click",   saveContent);
  document.getElementById("admin-logout-btn")?.addEventListener("click", logoutAdmin);

  // Format buttons (Bold, Italic, Underline, removeFormat)
  document.querySelectorAll("[data-cmd]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      // Prevent the focused editable element from losing focus
      e.preventDefault();
      document.execCommand(btn.dataset.cmd, false, null);
    });
  });

  // Auto-activate toolbar if a valid admin token is already stored
  const stored = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (stored && isAdminToken(stored)) {
    activateAdminBar();
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  loadContent();
  initStats();
  initEarningsBar();
  initAppLinks();
  initHeader();
  initStoreButtons();
  initAdminMode();
});
