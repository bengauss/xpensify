import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tempo } from "./animations.js";

const CLIENT_ROOT = resolve(__dirname, "..", "..");

describe("tempo presets", () => {
  it("exports mount/handoff/settle as positive ms values", () => {
    expect(tempo.mount).toBeGreaterThan(0);
    expect(tempo.handoff).toBeGreaterThan(0);
    expect(tempo.settle).toBeGreaterThan(0);
  });

  it("orders the tempos from shortest to longest", () => {
    expect(tempo.mount).toBeLessThan(tempo.handoff);
    expect(tempo.handoff).toBeLessThan(tempo.settle);
  });

  it("uses a 30ms mount lead-in (tightened from 80ms for snappier tab entrances)", () => {
    expect(tempo.mount).toBe(30);
  });

  const callSites = [
    "src/lib/entrance.ts",
    "src/components/CategorySelector.tsx",
    "src/components/CategoryBars.tsx",
    "src/screens/Recurring.tsx",
  ];

  for (const path of callSites) {
    it(`${path} sources animation delays from animations.ts (no bare delay literals)`, () => {
      const content = readFileSync(resolve(CLIENT_ROOT, path), "utf-8");
      expect(content).toMatch(/from\s+["']@\/lib\/animations["']/);
      expect(content).toMatch(/\btempo\b/);
    });
  }
});

describe("animation easing consistency", () => {
  const EASE_OUT_QUART = "cubic-bezier(0.22, 1, 0.36, 1)";

  it("entrance.ts amount fade uses the shared easeOutQuart curve at 220ms", () => {
    const content = readFileSync(
      resolve(CLIENT_ROOT, "src/lib/entrance.ts"),
      "utf-8",
    );
    // The amount-fade transition line — must use the shared curve, not bare `ease`.
    expect(content).toContain(
      `amountEl.style.transition = "opacity 220ms ${EASE_OUT_QUART}"`,
    );
  });

  it("entrance.ts hairline reveal uses the shared easeOutQuart curve", () => {
    const content = readFileSync(
      resolve(CLIENT_ROOT, "src/lib/entrance.ts"),
      "utf-8",
    );
    expect(content).toContain(
      `lineEl.style.transition = "opacity 320ms ${EASE_OUT_QUART}"`,
    );
  });

  it(".transition-layer in index.css uses easeOutQuart on opacity + transform", () => {
    const content = readFileSync(
      resolve(CLIENT_ROOT, "src/index.css"),
      "utf-8",
    );
    expect(content).toContain(
      `transition: opacity 250ms ${EASE_OUT_QUART}, transform 250ms ${EASE_OUT_QUART};`,
    );
  });
});

describe("tab transition fallback timer", () => {
  it("uses a 300ms fallback (50ms cushion over the 250ms CSS transition)", () => {
    const content = readFileSync(
      resolve(CLIENT_ROOT, "src/components/TabTransitionContainer.tsx"),
      "utf-8",
    );
    expect(content).toContain("window.setTimeout(cleanup, 300)");
  });
});

describe("pending-expenses banner entrance (#21)", () => {
  const CSS = readFileSync(resolve(CLIENT_ROOT, "src/index.css"), "utf-8");
  const ADD = readFileSync(resolve(CLIENT_ROOT, "src/screens/Add.tsx"), "utf-8");

  it("pins the hidden state in index.css on [data-banner-reveal]:not([data-revealed])", () => {
    // Following the established pattern (data-add-reveal, data-login-card) —
    // JSX inline opacity:0 gets clobbered by Preact re-renders, so the
    // default hidden state must live in CSS gated on a data-attribute.
    expect(CSS).toMatch(
      /\[data-banner-reveal\]:not\(\[data-revealed\]\)\s*\{[^}]*opacity:\s*0[^}]*\}/,
    );
  });

  it("hidden state also offsets the banner upward so the animation rises into place", () => {
    expect(CSS).toMatch(
      /\[data-banner-reveal\]:not\(\[data-revealed\]\)\s*\{[^}]*transform:\s*translateY\(-6px\)/,
    );
  });

  it("Add.tsx renders the banner with the data-banner-reveal attribute", () => {
    expect(ADD).toMatch(/data-banner-reveal/);
  });

  it("Add.tsx animates the banner with opacity 0→1 and y -6→0 on appearance", () => {
    // The entrance keyframes pin the start values explicitly (motion's
    // getComputedStyle fallback would otherwise read whatever the element
    // currently shows).
    expect(ADD).toMatch(/opacity:\s*\[\s*0\s*,\s*1\s*\][\s\S]{0,80}y:\s*\[\s*-6\s*,\s*0\s*\]/);
  });
});
