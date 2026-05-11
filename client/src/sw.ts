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
  let icon = "/icons/icon-192.png";
  let tag = "xpensify-notification";
  let url: string | undefined;

  if (event.data) {
    try {
      const data = event.data.json() as {
        title?: string;
        body?: string;
        icon?: string;
        tag?: string;
        url?: string;
      };
      title = data.title ?? title;
      body = data.body ?? body;
      icon = data.icon ?? icon;
      // Per-expense tags let multiple Apple Pay notifications stack on the
      // lock screen instead of collapsing into the latest one.
      tag = data.tag ?? tag;
      url = data.url;
    } catch {
      body = event.data.text();
    }
  }

  // Fan out to controlled clients so an open app refreshes its pending /
  // history-marker state in real time, even before the user taps the push.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon,
        badge: "/icons/icon-192.png",
        tag,
        data: { url },
      }),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          for (const c of clients) c.postMessage({ type: "push-received" });
        }),
    ])
  );
});

// Handle notification clicks — open / focus the app, deep-linking to the URL
// the server attached to the push payload (e.g. /?confirm=<id>, /history).
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: string };
  const target = data.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            try {
              if ("navigate" in client) {
                await (client as WindowClient).navigate(target);
              }
            } catch {
              // navigate fails for cross-origin clients; focus is enough.
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
      })
  );
});
