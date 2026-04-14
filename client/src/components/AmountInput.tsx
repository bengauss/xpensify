import { useEffect, useRef, useState } from "preact/hooks";
import type { Ref } from "preact";

interface AmountInputProps {
  value: string;
  onChange: (raw: string) => void;
  /** Forwarded ref to the underlying <input> element */
  inputRef?: Ref<HTMLInputElement>;
}

// ── Formatting helpers (de-DE: "1.234,56") ──────────────────────────────────

/**
 * Normalize user input to de-DE format: thousands separator dot, decimal comma.
 * Strips all non-digit/separator chars, treats last comma OR dot as decimal.
 */
function formatDE(raw: string): string {
  if (!raw) return "";

  // Keep only digits, dots, commas
  let cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return "";

  // Strip thousands dots (all dots), comma is the decimal separator
  // This means "1.500" gets interpreted as 1500 (de-DE thousands)
  const noDots = cleaned.replace(/\./g, "");
  const parts = noDots.split(",");
  let integerPart = parts[0];
  const hasComma = parts.length > 1;
  let decimalPart = hasComma ? parts[1] : "";

  // Limit decimal to 2 digits
  decimalPart = decimalPart.slice(0, 2);

  // Remove leading zeros from integer (but keep at least one)
  integerPart = integerPart.replace(/^0+(?=\d)/, "") || "0";

  // Add thousands separators
  integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return hasComma ? `${integerPart},${decimalPart}` : integerPart;
}

/** Parse a de-DE formatted string to a JS number. */
function parseDE(formatted: string): number {
  if (!formatted) return NaN;
  return parseFloat(formatted.replace(/\./g, "").replace(",", "."));
}

export function AmountInput({ value, onChange, inputRef }: AmountInputProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const resolvedRef = (inputRef ?? internalRef) as { current: HTMLInputElement | null };
  const measureRef = useRef<HTMLSpanElement>(null);
  const [inputWidth, setInputWidth] = useState(64);

  useEffect(() => {
    resolvedRef.current?.focus();
  }, []);

  useEffect(() => {
    if (measureRef.current) {
      const measured = measureRef.current.offsetWidth;
      setInputWidth(Math.max(64, measured + 4));
    }
  }, [value]);

  function handleInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    onChange(formatDE(raw));
  }

  function handleBlur() {
    if (!value) return;
    const n = parseDE(value);
    if (!isNaN(n)) {
      // Format to 2 decimals in de-DE
      const fixed = n.toFixed(2); // "4.00"
      const [int, dec] = fixed.split(".");
      const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      onChange(`${intFormatted},${dec}`);
    }
  }

  const displayText = value || "0,00";

  return (
    <div class="flex flex-col items-center gap-2">
      <div class="inline-flex items-baseline gap-2 rounded-xl bg-bg-surface px-6 py-4">
        <span class="text-3xl sm:text-[40px] font-light leading-none text-text-secondary select-none">
          EUR
        </span>

        <div class="relative" style={{ width: inputWidth }}>
          <input
            ref={resolvedRef as Ref<HTMLInputElement>}
            type="text"
            inputMode="decimal"
            value={value}
            onInput={handleInput}
            onBlur={handleBlur}
            placeholder="0,00"
            class="
              w-full
              bg-transparent
              text-3xl sm:text-[40px] font-light leading-none
              text-text-primary placeholder:text-text-hint
              outline-none border-none
            "
          />
        </div>

        <span
          ref={measureRef}
          class="text-3xl sm:text-[40px] font-light leading-none absolute invisible whitespace-pre"
          aria-hidden="true"
        >
          {displayText}
        </span>
      </div>

      <div class="h-px w-full bg-accent opacity-30" />
    </div>
  );
}

/** Parse a de-DE formatted amount string to integer cents. Returns 0 for invalid input. */
export function parseCents(raw: string): number {
  const n = parseDE(raw);
  return isNaN(n) || n <= 0 ? 0 : Math.round(n * 100);
}

/** Format integer cents as a de-DE string (e.g. 145000 → "1.450,00") for AmountInput initial values. */
export function formatCentsDE(cents: number): string {
  const fixed = (cents / 100).toFixed(2); // "1450.00"
  const [int, dec] = fixed.split(".");
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intFormatted},${dec}`;
}
