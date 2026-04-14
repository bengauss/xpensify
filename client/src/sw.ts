/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope;

// Activate new service worker immediately — don't wait for old tabs to close
self.skipWaiting();
clientsClaim();

// Precache the app shell (injected by vite-plugin-pwa at build time)
precacheAndRoute(self.__WB_MANIFEST);

// Clean up old precaches from previous versions
cleanupOutdatedCaches();

// Delete the legacy api-cache from earlier SW versions on activate so users
// upgrading from a prior build don't keep serving stale authenticated data.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("api-cache"));
});

// Intentionally no runtime caching for /api/*: the app's offline-first
// data lives in IndexedDB (Dexie). Caching authenticated API responses in
// the SW risks leaking one user's data to the next user on a shared device.

// Handle push notifications
self.addEventListener("push", (event: PushEvent) => {
  let title = "xpensify";
  let body = "You have a new notification";
  let icon = "/icons/icon-192.svg";

  if (event.data) {
    try {
      const data = event.data.json() as {
        title?: string;
        body?: string;
        icon?: string;
      };
      title = data.title ?? title;
      body = data.body ?? body;
      icon = data.icon ?? icon;
    } catch {
      body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: "/icons/icon-192.svg",
      tag: "xpensify-notification",
    })
  );
});

// Handle notification clicks — open / focus the app
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing window if one is open
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow("/");
        }
      })
  );
});
