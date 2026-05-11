/**
 * Manual escape hatch: unregister the current SW, blow away every cache the
 * Cache Storage API knows about, and hard-reload. For when the user is
 * stuck on a stale bundle (Settings → "force update").
 *
 * We previously also auto-polled `registration.update()` on every visibility
 * change and reloaded on `controllerchange`, but that caused screen flashes
 * during normal use. Manual-only is the safer default for iOS PWAs.
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
