import { describe, it, expect } from "vitest";
import { formatMoney, formatMoneyWhole, formatEur, dateKey, todayKey, monthKey, MONTHS_SHORT } from "./format.js";

describe("formatMoney", () => {
  it("formats whole euros with two decimals", () => {
    expect(formatMoney(1000)).toBe("10.00");
  });

  it("formats partial euros with two decimals", () => {
    expect(formatMoney(3250)).toBe("32.50");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toBe("0.00");
  });

  it("uses en-style thousands separator", () => {
    expect(formatMoney(123456)).toBe("1,234.56");
  });

  it("formats large amounts", () => {
    expect(formatMoney(99999999)).toBe("999,999.99");
  });

  it("handles single cent precision", () => {
    expect(formatMoney(1)).toBe("0.01");
    expect(formatMoney(99)).toBe("0.99");
    expect(formatMoney(101)).toBe("1.01");
  });
});

describe("formatMoneyWhole", () => {
  it("rounds to whole euros and adds thousands separator", () => {
    expect(formatMoneyWhole(123456)).toBe("1,235");
    expect(formatMoneyWhole(1099)).toBe("11");
  });

  it("returns 0 for zero", () => {
    expect(formatMoneyWhole(0)).toBe("0");
  });
});

describe("formatEur", () => {
  it("prepends EUR to formatted money", () => {
    expect(formatEur(3250)).toBe("EUR 32.50");
    expect(formatEur(0)).toBe("EUR 0.00");
  });
});

describe("dateKey", () => {
  it("converts ISO UTC timestamp to local YYYY-MM-DD string", () => {
    const d = new Date("2026-04-30T23:59:00.000Z");
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const expected = `${yyyy}-${mm}-${dd}`;
    expect(dateKey("2026-04-30T23:59:00.000Z")).toBe(expected);
  });

  it("works on date-only strings", () => {
    expect(dateKey("2026-04-30")).toBe("2026-04-30");
  });
});

describe("todayKey", () => {
  it("returns YYYY-MM-DD for today in local timezone", () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const expected = `${yyyy}-${mm}-${dd}`;
    expect(todayKey()).toBe(expected);
  });
});

describe("monthKey", () => {
  it("zero-pads month", () => {
    expect(monthKey(2026, 1)).toBe("2026-01");
    expect(monthKey(2026, 4)).toBe("2026-04");
    expect(monthKey(2026, 12)).toBe("2026-12");
  });
});

describe("MONTHS_SHORT", () => {
  it("has 12 entries, all lowercase", () => {
    expect(MONTHS_SHORT).toHaveLength(12);
    for (const m of MONTHS_SHORT) {
      expect(m).toMatch(/^[a-z]{3}$/);
    }
  });

  it("ordered jan through dec", () => {
    expect(MONTHS_SHORT[0]).toBe("jan");
    expect(MONTHS_SHORT[11]).toBe("dec");
  });
});
