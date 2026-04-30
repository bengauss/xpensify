import { describe, it, expect } from "vitest";
import { normalizeMerchant } from "./merchantNormalize.js";

describe("normalizeMerchant", () => {
  it("strips trailing store IDs", () => {
    expect(normalizeMerchant("BILLA 0123 WIEN")).toBe("billa");
    expect(normalizeMerchant("SPAR 4567")).toBe("spar");
  });

  it("strips #digit store IDs", () => {
    expect(normalizeMerchant("MCDONALDS#4521")).toBe("mcdonalds");
    expect(normalizeMerchant("STARBUCKS#1")).toBe("starbucks");
  });

  it("preserves multi-word names without trailing IDs", () => {
    expect(normalizeMerchant("Starbucks Coffee 1234")).toBe("starbucks coffee");
  });

  it("strips Austrian city suffixes", () => {
    expect(normalizeMerchant("DM Wien")).toBe("dm");
    expect(normalizeMerchant("Hofer Vienna")).toBe("hofer");
    expect(normalizeMerchant("Merkur Graz")).toBe("merkur");
    expect(normalizeMerchant("Penny Salzburg")).toBe("penny");
  });

  it("lowercases and trims", () => {
    expect(normalizeMerchant("  BILLA  ")).toBe("billa");
    expect(normalizeMerchant("HOFER")).toBe("hofer");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeMerchant("Billa   Plus")).toBe("billa plus");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeMerchant("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeMerchant("   ")).toBe("");
  });

  it("handles unicode merchant names", () => {
    expect(normalizeMerchant("Café Central")).toBe("café central");
    expect(normalizeMerchant("L'Étoile 0001")).toBe("l'étoile");
  });

  it("does not strip leading numbers", () => {
    // "5 Guys" should not become empty
    expect(normalizeMerchant("5 Guys Wien")).toBe("5 guys");
  });

  it("strips trailing numeric+text combos", () => {
    // The regex \s+\d+.*$ strips everything from the first whitespace+digit
    expect(normalizeMerchant("Subway 0123 Vienna")).toBe("subway");
  });

  it("is idempotent — normalizing twice yields the same result", () => {
    const once = normalizeMerchant("BILLA 0123 WIEN");
    const twice = normalizeMerchant(once);
    expect(twice).toBe(once);
  });
});
