/**
 * iOS Safari aggressively caches PWAs and rarely checks for SW updates on
 * its own — `registration.update()` has to be called explicitly. We poll on
 * every foreground transition and on app start, then reload the page when
 * the new SW takes control. From the user's perspective: tap into the app
 * after a deploy, see one quick refresh, you're on the new bundle.
 */

let registered = false;

async function checkForUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  } catch {
    // Best-effort. update() rejects offline; we'll retry on next foreground.
  }
}

function onVisibility(): void {
  if (document.visibilityState === "visible") {
    checkForUpdate();
  }
}

/**
 * Wire up SW update polling. Idempotent — safe to call multiple times.
 * Should be invoked once after `serviceWorker.register()` succeeds.
 */
export function startSwUpdater(): void {
  if (registered) return;
  registered = true;
  if (!("serviceWorker" in navigator)) return;

  // Reload exactly once when a new SW takes control. clientsClaim() in sw.ts
  // makes this fire as soon as the new SW activates.
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  document.addEventListener("visibilitychange", onVisibility);
  // First-load probe (don't wait for a foreground transition that may never
  // come if the user opens the app after it's been backgrounded for hours).
  checkForUpdate();
}

/**
 * Manual escape hatch: unregister the current SW, blow away every cache the
 * Cache Storage API knows about, and hard-reload. For when the user is
 * stuck on a stale bundle and the auto-updater isn't reaching them.
 */
export async function forceUpdate(): Promise<void> {
  if ("serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      // ignore
    }
  }
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      // ignore
    }
  }
  // Bust any HTTP cache by appending a one-shot query string to the reload.
  window.location.replace(`/?_=${Date.now()}`);
}
