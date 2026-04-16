import { signal } from "@preact/signals";

/**
 * Tracks the most recently-saved expense so History can glow the row briefly
 * when the user navigates there. Read with `.peek()` in a component's mount
 * useState initializer so only the matching row triggers a glow (avoids
 * subscribing every row to this signal).
 */
export const lastSaved = signal<{ id: string; timestamp: number } | null>(null);

/** 3s window — after this the signal auto-clears and no glow triggers on arrival. */
const GLOW_WINDOW_MS = 3000;

export function markSaved(id: string): void {
  const ts = Date.now();
  lastSaved.value = { id, timestamp: ts };
  setTimeout(() => {
    if (lastSaved.value?.id === id && lastSaved.value?.timestamp === ts) {
      lastSaved.value = null;
    }
  }, GLOW_WINDOW_MS);
}

export function isWithinGlowWindow(saved: { timestamp: number } | null): boolean {
  if (!saved) return false;
  return Date.now() - saved.timestamp < GLOW_WINDOW_MS;
}
