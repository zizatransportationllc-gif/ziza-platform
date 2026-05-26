/**
 * Ziza Landing Page — main.js
 * Sprint 31 — Performance, SRE & GA
 *
 * Features:
 *  - Animated stat counters on scroll
 *  - Smooth CTA for driver apply button
 *  - Live driver count from API (graceful fallback)
 *  - Earnings bar animation
 */

const API_BASE = window.ZIZA_API_URL || "https://api.ziza.ci";

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------

function animateCounter(el, target, duration = 1500) {
  const start = performance.now();
  const startVal = 0;

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startVal + (target - startVal) * ease);
    el.textContent = current.toLocaleString("fr-FR");
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Stats — try to load from API, fall back to hardcoded values
// ---------------------------------------------------------------------------

const FALLBACK_STATS = {
  trips:   0,
  drivers: 0,
  cities:  1,
};

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

// ---------------------------------------------------------------------------
// Intersection observer for stat animation trigger
// ---------------------------------------------------------------------------

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
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.dataset.target || "0", 10);
          animateCounter(el, target);
          observer.unobserve(el);
        }
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
        if (entry.isIntersecting) {
          bar.style.width = bar.style.width || "65%";
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 },
  );

  observer.observe(bar);
}

// ---------------------------------------------------------------------------
// Apply button → customer app
// ---------------------------------------------------------------------------

function initApplyButton() {
  const btn = document.getElementById("apply-btn");
  if (!btn) return;
  // Point to customer web app (env-specific)
  const appUrl = window.ZIZA_CUSTOMER_URL || "#";
  btn.addEventListener("click", (e) => {
    if (appUrl !== "#") {
      e.preventDefault();
      window.location.href = appUrl;
    }
  });
}

// ---------------------------------------------------------------------------
// Header scroll effect
// ---------------------------------------------------------------------------

function initHeader() {
  const header = document.querySelector(".header");
  if (!header) return;
  window.addEventListener("scroll", () => {
    header.style.boxShadow =
      window.scrollY > 20 ? "0 2px 20px rgba(0,0,0,.08)" : "none";
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  initStats();
  initEarningsBar();
  initApplyButton();
  initHeader();
});
