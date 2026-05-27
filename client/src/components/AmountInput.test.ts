import { describe, it, expect } from "vitest";
import { parseCents, formatCents, formatAmount } from "./AmountInput.js";

/** Simulate typing chars one at a time: each keystroke re-formats the prior display value. */
function typeSeq(chars: string[]): string {
  let display = "";
  for (const c of chars) display = formatAmount(display + c);
  return display;
}

describe("formatAmount", () => {
  it("formats a plain integer", () => {
    expect(formatAmount("123")).toBe("123");
  });

  it("inserts a thousands separator at 4 digits", () => {
    expect(formatAmount("1234")).toBe("1,234");
  });

  it("treats a comma trailing 3+ digits as a thousands separator, not a decimal", () => {
    // Regression: typing "5" into the displayed "1,234" produces raw "1,2345".
    // It must re-parse to 12,345 — previously it collapsed to "1.23".
    expect(formatAmount("1,2345")).toBe("12,345");
  });

  it("treats a comma trailing ≤2 digits as a decimal separator (German keypad)", () => {
    expect(formatAmount("1,23")).toBe("1.23");
    expect(formatAmount("1,2")).toBe("1.2");
  });

  it("keeps an in-progress trailing comma as a decimal point", () => {
    expect(formatAmount("1,")).toBe("1.");
  });

  it("handles a large decimal entered with a comma", () => {
    expect(formatAmount("12345,67")).toBe("12,345.67");
  });

  it("does not truncate as digits are typed one at a time", () => {
    expect(typeSeq([..."123"])).toBe("123");
    expect(typeSeq([..."1234"])).toBe("1,234");
    expect(typeSeq([..."12345"])).toBe("12,345");
    expect(typeSeq([..."123456"])).toBe("123,456");
    expect(typeSeq([..."1234567"])).toBe("1,234,567");
  });

  it("supports incremental German decimal entry", () => {
    expect(typeSeq(["1", ",", "2", "3"])).toBe("1.23");
    expect(typeSeq(["1", "2", "3", "4", "5", ",", "6", "7"])).toBe("12,345.67");
  });
});

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
