import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CLIENT_ROOT = resolve(__dirname, "..", "..");
const DISSOLVE = readFileSync(
  resolve(CLIENT_ROOT, "src/lib/dissolve.ts"),
  "utf-8",
);

describe("smooth gap-collapse on delete (#22)", () => {
  it("does not set display:none on the dissolved row", () => {
    // Setting display:none at the end of the transition removes the row
    // from layout in one discrete step, which causes neighbours to snap
    // up. Option 2 keeps the row in flow at height:0 and lets the Dexie
    // unmount carry it away.
    expect(DISSOLVE).not.toMatch(/\.display\s*=\s*"none"/);
    expect(DISSOLVE).not.toMatch(/display:\s*none/);
  });

  it("waits for the height/padding transition to actually paint before resolving", () => {
    // Resolving on a transitionend listener (with a fallback timer) ensures
    // the browser has painted the final height:0 state before the caller
    // triggers the Dexie unmount.
    expect(DISSOLVE).toMatch(/addEventListener\(\s*["']transitionend["']/);
  });

  it("keeps the existing per-property transition on height + padding + opacity", () => {
    // Regression guard: the smooth shrink itself is what closes the gap.
    expect(DISSOLVE).toMatch(/transition\s*=\s*`opacity [^`]+, height [^`]+, padding [^`]+`/);
  });
});
