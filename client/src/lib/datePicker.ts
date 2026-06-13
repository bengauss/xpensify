/**
 * Open the native date picker for an `<input type="date">`.
 *
 * The date controls on Add and History are invisible (`opacity:0`) overlays.
 * iOS Safari opens the picker on a plain tap of the input, but desktop Firefox
 * only opens it via `showPicker()` (its calendar indicator is hidden at
 * `opacity:0`). Call this from the control's `onClick` to cover both: Firefox
 * gets `showPicker()`, iOS keeps its native click-through. Guarded because
 * `showPicker()` may be absent or throw on some Safari versions — the iOS path
 * must never break (it has regressed before).
 */
export function openDatePicker(el: HTMLInputElement | null): void {
  if (!el || typeof el.showPicker !== "function") return;
  try {
    el.showPicker();
  } catch {
    // showPicker can throw on some Safari versions / outside a user gesture;
    // the native click-through is the fallback there.
  }
}
