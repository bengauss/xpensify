import { describe, it, expect } from "vitest";
import { parseCents, formatCents } from "./AmountInput.js";

describe("parseCents", () => {
  it("parses '32.50' → 3250", () => {
    expect(parseCents("32.50")).toBe(3250);
  });

  it("parses '1,234.56' → 123456 (strips thousands separator)", () => {
    expect(parseCents("1,234.56")).toBe(123456);
  });

  it("returns 0 for empty", () => {
    expect(parseCents("")).toBe(0);
  });

  it("returns 0 for non-numeric input", () => {
    expect(parseCents("abc")).toBe(0);
  });

  it("returns 0 for negative or zero amounts (guard)", () => {
    expect(parseCents("0")).toBe(0);
    expect(parseCents("-5")).toBe(0);
  });

  it("rounds half-cent values", () => {
    expect(parseCents("0.005")).toBe(1); // Math.round(0.5)
    expect(parseCents("0.014")).toBe(1);
    expect(parseCents("0.015")).toBe(2); // banker's rounding edge — Math.round(1.5) = 2
  });

  it("ignores trailing whitespace via parseFloat", () => {
    expect(parseCents("10.50  ")).toBe(1050);
  });
});

describe("formatCents", () => {
  it("formats 3250 → '32.50'", () => {
    expect(formatCents(3250)).toBe("32.50");
  });

  it("formats 0 → '0.00'", () => {
    expect(formatCents(0)).toBe("0.00");
  });

  it("formats 100 → '1.00'", () => {
    expect(formatCents(100)).toBe("1.00");
  });

  it("formats 123456 with thousands separator → '1,234.56'", () => {
    expect(formatCents(123456)).toBe("1,234.56");
  });

  it("formats large amounts", () => {
    expect(formatCents(99999999)).toBe("999,999.99");
  });

  it("round-trips formatCents → parseCents", () => {
    expect(parseCents(formatCents(3250))).toBe(3250);
    expect(parseCents(formatCents(123456))).toBe(123456);
  });
});
