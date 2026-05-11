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

interface PushPayload {
  title?: string;
  body?: string;
  icon?: string;
  tag?: string;
  url?: string;
  expenseId?: string;
  suggestedCategoryId?: string;
  suggestedSubcategoryId?: string;
  showActions?: boolean;
}

// Handle push notifications
self.addEventListener("push", (event: PushEvent) => {
  let title = "xpensify";
  let body = "You have a new notification";
  let icon = "/icons/icon-192.png";
  let tag = "xpensify-notification";
  let payloadData: PushPayload = {};

  if (event.data) {
    try {
      payloadData = event.data.json() as PushPayload;
      title = payloadData.title ?? title;
      body = payloadData.body ?? body;
      icon = payloadData.icon ?? icon;
      // Per-expense tags let multiple Apple Pay notifications stack on the
      // lock screen instead of collapsing into the latest one.
      tag = payloadData.tag ?? tag;
    } catch {
      body = event.data.text();
    }
  }

  // Action buttons appear on Apple Pay pending notifications when there's a
  // suggested (category, subcategory) the SW can submit on the user's behalf.
  // iOS Safari supports up to 2 visible actions on PWA push notifications.
  // (NotificationAction isn't in the default webworker lib types, so we use
  // a structural shape and cast on the showNotification call.)
  const actions: Array<{ action: string; title: string }> = payloadData.showActions
    ? [
        { action: "confirm", title: "looks right" },
        { action: "edit", title: "edit" },
      ]
    : [];

  // Fan out to controlled clients so an open app refreshes its pending /
  // history-marker state in real time, even before the user taps the push.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon,
        badge: "/icons/icon-192.png",
        tag,
        data: payloadData,
        actions,
      } as NotificationOptions),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          for (const c of clients) c.postMessage({ type: "push-received" });
        }),
    ])
  );
});

/**
 * One-tap confirmation from the lock screen. PATCHes the pending row with the
 * server-suggested category/subcategory, then nudges open clients to refresh.
 * On failure (network, expired session, race), falls back to deep-linking
 * into the Confirm flow so the user can resolve it manually.
 */
async function confirmFromNotification(data: PushPayload): Promise<void> {
  const { expenseId, suggestedCategoryId, suggestedSubcategoryId } = data;
  if (!expenseId || !suggestedCategoryId || !suggestedSubcategoryId) return;

  let ok = false;
  try {
    const res = await fetch(`/api/pending/${expenseId}/confirm`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category_id: suggestedCategoryId,
        subcategory_id: suggestedSubcategoryId,
      }),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }

  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  if (ok) {
    for (const c of clientList) c.postMessage({ type: "push-received" });
    return;
  }

  // Fallback: open the Confirm screen so the user can resolve it.
  const target = `/?confirm=${expenseId}`;
  for (const c of clientList) {
    if ("focus" in c) {
      try {
        if ("navigate" in c) await (c as WindowClient).navigate(target);
      } catch {
        // ignore — focus is enough
      }
      await c.focus();
      return;
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(target);
}

// Handle notification clicks — open / focus the app, deep-linking to the URL
// the server attached to the push payload (e.g. /?confirm=<id>, /history).
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as PushPayload;

  // "looks right" — confirm the pending row in place. No app open.
  if (event.action === "confirm") {
    event.waitUntil(confirmFromNotification(data));
    return;
  }

  // "edit" or default body tap — deep-link into the app.
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
