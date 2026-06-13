import { describe, it, expect, vi } from "vitest";
import { openDatePicker } from "./datePicker";

describe("openDatePicker", () => {
  it("calls showPicker() when the element exposes it", () => {
    const showPicker = vi.fn();
    const el = { showPicker } as unknown as HTMLInputElement;
    openDatePicker(el);
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("swallows errors thrown by showPicker (iOS safety)", () => {
    const showPicker = vi.fn(() => {
      throw new Error("NotAllowedError");
    });
    const el = { showPicker } as unknown as HTMLInputElement;
    expect(() => openDatePicker(el)).not.toThrow();
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when showPicker is unsupported", () => {
    const el = {} as unknown as HTMLInputElement;
    expect(() => openDatePicker(el)).not.toThrow();
  });

  it("is a no-op for null", () => {
    expect(() => openDatePicker(null)).not.toThrow();
  });
});
