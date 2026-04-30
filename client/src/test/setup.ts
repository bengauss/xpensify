import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

// jsdom doesn't define matchMedia; many UI helpers (animations.ts) probe it
// before deciding whether to run motion. Provide a permissive default.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
