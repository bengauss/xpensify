/**
 * Open the native date picker for an `<input type="date">`.
 *
 * The date controls on Add and History are invisible (`opacity:0`) overlays
 * wrapped in a `<label>`. iOS Safari opens the picker on the native
 * click-through, but desktop Firefox doesn't (its calendar indicator is hidden
 * at `opacity:0`) — it only opens via `showPicker()`. Call this from the
 * control's `onClick` to cover desktop.
 *
 * Restricted to fine-pointer / hover environments (desktop): iOS already works
 * via the click-through and `showPicker()` has regressed there before, so we
 * leave coarse-pointer devices strictly on the native path. Guarded with
 * try/catch because `showPicker()` may be absent or throw outside a user
 * gesture — the click-through is the fallback there.
 */
export function openDatePicker(el: HTMLInputElement | null): void {
  if (!el || typeof el.showPicker !== "function") return;
  // Only the desktop-pointer case needs the explicit call. matchMedia may be
  // absent (non-browser) — fall through and try showPicker then.
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    !window.matchMedia("(hover: hover) and (pointer: fine)").matches
  ) {
    return;
  }
  try {
    el.showPicker();
  } catch {
    // showPicker can throw on some browsers / outside a user gesture; the
    // native click-through is the fallback.
  }
}
