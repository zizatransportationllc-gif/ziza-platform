/**
 * Ziza Web-Driver — Service Worker (Sprint 26)
 *
 * Handles web push notifications for drivers: new trips, document reviews,
 * payout notifications.
 *
 * Push payload format:
 *   { title: string, body: string, data: { type: string, trip_id?: string } }
 */

const CACHE_NAME = "ziza-driver-v1";

// ---------------------------------------------------------------------------
// Install & Activate
// ---------------------------------------------------------------------------

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Push event — display the notification
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let payload = { title: "Ziza", body: "Nouvelle notification", data: {} };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (_) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: payload.data || {},
    tag: payload.data?.type || "ziza-driver-notification",
    renotify: true,
    // Driver notifications use high-priority vibration pattern
    vibrate: [200, 100, 200, 100, 400],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Ziza", options)
  );
});

// ---------------------------------------------------------------------------
// Notification click — focus or open the driver app
// ---------------------------------------------------------------------------

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow("/");
        }
      })
  );
});
