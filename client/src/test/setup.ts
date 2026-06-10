// Pin the timezone so local-vs-UTC date bucketing is deterministic in tests
// (mirrors server/src/test/setup.ts). Europe/Vienna is UTC+1/+2, so a late-UTC
// timestamp can fall in the next local day/month — which the bucketing tests rely on.
process.env.TZ = "Europe/Vienna";

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
