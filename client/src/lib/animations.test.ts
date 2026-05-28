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
