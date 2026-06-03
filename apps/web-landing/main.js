/**
 * Ziza Landing Page — main.js
 * Sprint 50 — Skills & Links
 *
 * Features:
 *  - Animated stat counters on scroll
 *  - Environment-aware links (driver app + customer app)
 *  - Live driver count from API (graceful fallback)
 *  - Earnings bar animation
 *
 * App URLs come from env-config.js (generated at container startup):
 *   window.ZIZA_DRIVER_URL   — web-driver app  (e.g. http://localhost:3002)
 *   window.ZIZA_CUSTOMER_URL — web-customer app (e.g. http://localhost:3001)
 *   window.ZIZA_API_URL      — API base URL
 */

const API_BASE      = window.ZIZA_API_URL      || "http://localhost:8000";
const DRIVER_URL    = window.ZIZA_DRIVER_URL   || "http://localhost:3002";
const CUSTOMER_URL  = window.ZIZA_CUSTOMER_URL || "http://localhost:3001";

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
// Stats — try to load from API, fall back to zeros
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
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  initStats();
  initEarningsBar();
  initAppLinks();
  initHeader();
});
