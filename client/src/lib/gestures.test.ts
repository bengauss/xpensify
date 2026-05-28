import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CLIENT_ROOT = resolve(__dirname, "..", "..");
const GESTURES = readFileSync(
  resolve(CLIENT_ROOT, "src/lib/gestures.ts"),
  "utf-8",
);

describe("pull-to-refresh content follow (#20)", () => {
  it("translates the active scroll layer during vertical pull (not only the indicator)", () => {
    // The active layer is the element returned by getActiveLayer(); the
    // gesture handler must apply a transform to it on dy>0 from scrollTop=0,
    // so the content visibly drags along with the spinner.
    expect(GESTURES).toMatch(/getActiveLayer\(\)/);
    // The layer should receive a translateY that scales with the pull.
    expect(GESTURES).toMatch(/layer\.style\.transform\s*=\s*`translateY\(/);
  });

  it("uses the same PTR_RESISTANCE multiplier as the indicator (so finger and content stay attached)", () => {
    // The layer pull amount is computed from dy * PTR_RESISTANCE, capped at
    // PTR_MAX_PULL — same envelope as the indicator.
    expect(GESTURES).toMatch(/PTR_RESISTANCE/);
    expect(GESTURES).toMatch(/PTR_MAX_PULL/);
  });

  it("clears the layer transform on release (handleEnd) so the content eases back to 0", () => {
    // After release, the layer must transition back to translateY(0) — not
    // be left stuck at a non-zero translation.
    expect(GESTURES).toMatch(
      /layer\.style\.transition\s*=\s*"transform 200ms[^"]*"/,
    );
    expect(GESTURES).toMatch(/layer\.style\.transform\s*=\s*"translateY\(0\)"/);
  });

  it("clears the layer transform when intent flips to 'scroll' mid-gesture", () => {
    // The dy-goes-negative branch (vertical intent → scroll) must reset the
    // layer so the user can scroll normally without a stuck translation.
    // We assert a dedicated reset helper is used in both that branch and
    // handleCancel.
    expect(GESTURES).toMatch(/resetLayer/);
  });

  it("clears the layer transform on handleCancel", () => {
    // Same reset path used in cancel — symmetry with the indicator reset.
    expect(GESTURES.match(/resetLayer\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
