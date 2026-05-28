// Spring presets — physical motion (translate, scale, width, height).
export const springs = {
  snappy: { type: "spring" as const, stiffness: 400, damping: 25 },
  gentle: { type: "spring" as const, stiffness: 300, damping: 30 },
  bouncy: { type: "spring" as const, stiffness: 500, damping: 20 },
  toggle: { type: "spring" as const, stiffness: 500, damping: 28 },
  data: { type: "spring" as const, stiffness: 200, damping: 20 },
  zoom: { type: "spring" as const, stiffness: 380, damping: 30 },
};

// Duration presets — use for non-physical animations (opacity, color, dismissals).
export const durations = {
  exit: { duration: 0.2, ease: "easeOut" as const },
  fade: { duration: 0.15, ease: "easeOut" as const },
  soft: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  count: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

// Stagger presets (seconds).
export const stagger = {
  text: 0.03,
  amount: 0.02,
  pill: 0.05,
  bar: 0.03,
  card: 0.05,
};

// Tempo presets (ms) — shared timing vocabulary for setTimeout-driven entrance
// choreography. Use these instead of bare ms numbers so phase handoffs across
// screens share a rhythm and small touch-ups propagate.
export const tempo = {
  mount: 30,      // post-mount lead-in before entrance animations start
  handoff: 150,   // brief overlap between two animation phases
  settle: 320,    // padding for a typical reveal to land
};

// Returns an options-spread override that collapses any animation to near-instant
// when the user has `prefers-reduced-motion: reduce`. Spread at the END of an
// options object so it overrides duration/type. Typed as Record<string, unknown>
// so TS doesn't warn about literal duration overwrites at call sites.
export function getReducedMotionOverride(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  if (!window.matchMedia) return {};
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? { duration: 0.01 }
    : {};
}

export function shouldReduceMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
