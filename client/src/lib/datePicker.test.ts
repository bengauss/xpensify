import { describe, it, expect, vi, afterEach } from "vitest";
import { openDatePicker } from "./datePicker";

// Default jsdom stub (src/test/setup.ts) returns matches:false for every query,
// i.e. a coarse-pointer / iOS-like env. Override to simulate desktop.
function setPointer(desktop: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: desktop,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}

afterEach(() => setPointer(false));

describe("openDatePicker", () => {
  it("calls showPicker() on a desktop pointer env when the element exposes it", () => {
    setPointer(true);
    const showPicker = vi.fn();
    const el = { showPicker } as unknown as HTMLInputElement;
    openDatePicker(el);
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("does NOT call showPicker() on a coarse-pointer / iOS env (keeps native click-through)", () => {
    setPointer(false);
    const showPicker = vi.fn();
    const el = { showPicker } as unknown as HTMLInputElement;
    openDatePicker(el);
    expect(showPicker).not.toHaveBeenCalled();
  });

  it("swallows errors thrown by showPicker", () => {
    setPointer(true);
    const showPicker = vi.fn(() => {
      throw new Error("NotAllowedError");
    });
    const el = { showPicker } as unknown as HTMLInputElement;
    expect(() => openDatePicker(el)).not.toThrow();
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when showPicker is unsupported", () => {
    setPointer(true);
    const el = {} as unknown as HTMLInputElement;
    expect(() => openDatePicker(el)).not.toThrow();
  });

  it("is a no-op for null", () => {
    setPointer(true);
    expect(() => openDatePicker(null)).not.toThrow();
  });
});
