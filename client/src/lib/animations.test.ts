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

describe("shared Toggle component (#15)", () => {
  it("client/src/components/Toggle.tsx exists and exports a Toggle function/component", () => {
    const TOGGLE = readFileSync(
      resolve(CLIENT_ROOT, "src/components/Toggle.tsx"),
      "utf-8",
    );
    expect(TOGGLE).toMatch(/export\s+function\s+Toggle\b/);
  });

  it("Toggle.tsx animates the knob on springs.toggle (physical motion)", () => {
    const TOGGLE = readFileSync(
      resolve(CLIENT_ROOT, "src/components/Toggle.tsx"),
      "utf-8",
    );
    expect(TOGGLE).toMatch(/springs\.toggle/);
  });

  it("Toggle.tsx animates the track colour with a duration (no spring on colour)", () => {
    const TOGGLE = readFileSync(
      resolve(CLIENT_ROOT, "src/components/Toggle.tsx"),
      "utf-8",
    );
    // The track-colour animate() call uses durations.* (not springs.*) — colour
    // has no mass so a spring on it reads as a lagging overshoot.
    expect(TOGGLE).toMatch(/backgroundColor[\s\S]{0,200}durations\./);
  });

  it("Toggle.tsx respects prefers-reduced-motion via getReducedMotionOverride", () => {
    const TOGGLE = readFileSync(
      resolve(CLIENT_ROOT, "src/components/Toggle.tsx"),
      "utf-8",
    );
    expect(TOGGLE).toMatch(/getReducedMotionOverride/);
  });

  it("Recurring.tsx no longer declares its own Toggle and imports the shared one", () => {
    const RECURRING = readFileSync(
      resolve(CLIENT_ROOT, "src/screens/Recurring.tsx"),
      "utf-8",
    );
    expect(RECURRING).not.toMatch(/function\s+Toggle\s*\(/);
    expect(RECURRING).toMatch(/from\s+["']@\/components\/Toggle["']/);
  });

  it("Settings.tsx no longer declares its own Toggle and imports the shared one", () => {
    const SETTINGS = readFileSync(
      resolve(CLIENT_ROOT, "src/screens/Settings.tsx"),
      "utf-8",
    );
    expect(SETTINGS).not.toMatch(/function\s+Toggle\s*\(/);
    expect(SETTINGS).toMatch(/from\s+["']@\/components\/Toggle["']/);
  });
});

describe("usePressScale coverage (#16)", () => {
  it("CategoryBars.tsx wires usePressScale on the show-more/show-less toggle button", () => {
    const BARS = readFileSync(
      resolve(CLIENT_ROOT, "src/components/CategoryBars.tsx"),
      "utf-8",
    );
    expect(BARS).toMatch(/from\s+["']@\/lib\/usePressScale["']/);
    expect(BARS).toMatch(/usePressScale/);
  });

  it("DetailSheet.tsx wires usePressScale on the drag handle (dismiss tap target)", () => {
    const SHEET = readFileSync(
      resolve(CLIENT_ROOT, "src/components/DetailSheet.tsx"),
      "utf-8",
    );
    expect(SHEET).toMatch(/from\s+["']@\/lib\/usePressScale["']/);
    expect(SHEET).toMatch(/usePressScale/);
  });

  it("Settings.tsx Row component still wires usePressScale handlers (regression guard)", () => {
    const SETTINGS = readFileSync(
      resolve(CLIENT_ROOT, "src/screens/Settings.tsx"),
      "utf-8",
    );
    expect(SETTINGS).toMatch(/usePressScale/);
    expect(SETTINGS).toMatch(/onPointerDown/);
  });

  it("Add.tsx does NOT wrap the date <label> with usePressScale (iOS user-activation chain)", () => {
    const ADD = readFileSync(
      resolve(CLIENT_ROOT, "src/screens/Add.tsx"),
      "utf-8",
    );
    // The `<label>` wrapping `<input type="date">` must not have a transform
    // animation on its click target — iOS Safari requires an unbroken
    // user-activation chain to invoke the native date picker.
    expect(ADD).not.toMatch(/<label[^>]*ref=\{[^}]*usePressScale/);
  });
});

describe("modal spring symmetry (#17)", () => {
  const SHEET = readFileSync(
    resolve(CLIENT_ROOT, "src/components/DetailSheet.tsx"),
    "utf-8",
  );
  const DIALOG = readFileSync(
    resolve(CLIENT_ROOT, "src/components/ConfirmDialog.tsx"),
    "utf-8",
  );

  it("DetailSheet.tsx exit uses a spring, not durations.exit", () => {
    // Find the closing-branch animate() call. The simplest invariant: the file
    // must not pair "y: ["0%", "100%"]" with durations.exit anywhere.
    const closingFragment = SHEET.match(/y:\s*\[\s*["']0%["']\s*,\s*["']100%["']\s*\][\s\S]{0,200}/);
    expect(closingFragment).not.toBeNull();
    expect(closingFragment![0]).toMatch(/springs\./);
    expect(closingFragment![0]).not.toMatch(/durations\.exit/);
  });

  it("DetailSheet.tsx overlay opacity uses easeOutQuart at 300ms (matches sheet spring landing)", () => {
    // The hard 200ms ease finished before the spring landed at ~280–320ms,
    // leaving a frame where the overlay was gone but the sheet still slid.
    expect(SHEET).toMatch(
      /opacity\s+300ms\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/,
    );
    expect(SHEET).not.toMatch(/transition-opacity\s+duration-200/);
  });

  it("ConfirmDialog.tsx exit uses a spring, not durations.exit", () => {
    // Locate the dismiss animate() — the keyframes "opacity: [1, 0]" identify
    // the exit branch. It must use a spring on the round trip.
    const exitFragment = DIALOG.match(/opacity:\s*\[\s*1\s*,\s*0\s*\][\s\S]{0,200}/);
    expect(exitFragment).not.toBeNull();
    expect(exitFragment![0]).toMatch(/springs\./);
    expect(exitFragment![0]).not.toMatch(/durations\.exit/);
  });
});
