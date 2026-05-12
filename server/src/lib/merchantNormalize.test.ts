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

  it("preserves multi-word brand names with branch IDs in the middle", () => {
    // The bug this fixes: greedy "strip everything from first space-digit"
    // collapsed "Der Mann 12 1010 Wien" to "der".
    expect(normalizeMerchant("Der Mann 12 1010 Wien")).toBe("der mann");
    expect(normalizeMerchant("DER MANN 1234 1010 WIEN")).toBe("der mann");
    expect(normalizeMerchant("Der Mann 1010 Wien")).toBe("der mann");
    expect(normalizeMerchant("Der Mann")).toBe("der mann");
  });

  it("strips multiple trailing digit runs", () => {
    expect(normalizeMerchant("Billa Plus 1234 5678")).toBe("billa plus");
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
    expect(normalizeMerchant("5 Guys Wien")).toBe("5 guys");
  });

  it("strips trailing numeric+city combos", () => {
    expect(normalizeMerchant("Subway 0123 Vienna")).toBe("subway");
  });

  it("preserves digits embedded between non-digit words", () => {
    // No trailing digit run, so "7-Eleven" or "Studio 54 Bar" survive intact.
    expect(normalizeMerchant("Studio 54 Bar")).toBe("studio 54 bar");
  });

  it("is idempotent — normalizing twice yields the same result", () => {
    const once = normalizeMerchant("BILLA 0123 WIEN");
    const twice = normalizeMerchant(once);
    expect(twice).toBe(once);
  });
});
