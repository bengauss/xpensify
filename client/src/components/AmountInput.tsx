import { useEffect, useRef, useState } from "preact/hooks";
import type { Ref } from "preact";
import { animate } from "motion";
import { shouldReduceMotion } from "@/lib/animations";

export interface AmountInputCelebrateApi {
  /**
   * Plays a one-shot "saved" celebration over the input:
   *  - green flash over the pill background
   *  - checkmark fades in/out to the left of "EUR"
   *  - number rolls from `fromCents` down to 0.00
   * Resolves when the roll has landed so the parent can clear state next.
   * No-op (resolves immediately) under prefers-reduced-motion.
   */
  celebrate: (fromCents: number) => Promise<void>;
}

interface AmountInputProps {
  value: string;
  onChange: (raw: string) => void;
  /** Forwarded ref to the underlying <input> element */
  inputRef?: Ref<HTMLInputElement>;
  /** Ref slot the component fills with its imperative celebrate API. */
  celebrateRef?: { current: AmountInputCelebrateApi | null };
}

// ── Formatting helpers (en-US: "1,234.56") ──────────────────────────────────

/**
 * Normalize user input to en-US format: thousands separator comma, decimal period.
 * Accepts either "." or "," as the decimal separator so users on German iOS
 * keypads (which only expose ",") can enter decimals the same as en-US users.
 */
function formatAmount(raw: string): string {
  if (!raw) return "";

  // Keep only digits, dots, commas
  let cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return "";

  let integerPart: string;
  let decimalPart: string;
  let hasDecimal: boolean;

  if (cleaned.includes(".")) {
    // Period present → it's the decimal separator (en-US), commas are thousands
    const noCommas = cleaned.replace(/,/g, "");
    const dotIdx = noCommas.indexOf(".");
    integerPart = noCommas.slice(0, dotIdx);
    decimalPart = noCommas.slice(dotIdx + 1).replace(/\./g, "");
    hasDecimal = true;
  } else if (cleaned.includes(",")) {
    // No period but comma(s) → last comma is decimal, earlier commas are stray/thousands
    const lastComma = cleaned.lastIndexOf(",");
    integerPart = cleaned.slice(0, lastComma).replace(/,/g, "");
    decimalPart = cleaned.slice(lastComma + 1);
    hasDecimal = true;
  } else {
    integerPart = cleaned;
    decimalPart = "";
    hasDecimal = false;
  }

  // Limit decimal to 2 digits
  decimalPart = decimalPart.slice(0, 2);

  // Remove leading zeros from integer (but keep at least one)
  integerPart = integerPart.replace(/^0+(?=\d)/, "") || "0";

  // Add thousands separators
  integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return hasDecimal ? `${integerPart}.${decimalPart}` : integerPart;
}

/** Parse an en-US formatted string to a JS number. */
function parseAmount(formatted: string): number {
  if (!formatted) return NaN;
  return parseFloat(formatted.replace(/,/g, ""));
}

export function AmountInput({ value, onChange, inputRef, celebrateRef }: AmountInputProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const resolvedRef = (inputRef ?? internalRef) as { current: HTMLInputElement | null };
  const measureRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const checkRef = useRef<HTMLSpanElement>(null);
  const [inputWidth, setInputWidth] = useState(64);

  /** When non-null, overrides the displayed input value during a celebrate roll. */
  const [rollingText, setRollingText] = useState<string | null>(null);
  /** Screen-reader status region — "saved" is announced once per celebration. */
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    resolvedRef.current?.focus();
  }, []);

  useEffect(() => {
    if (measureRef.current) {
      const measured = measureRef.current.offsetWidth;
      setInputWidth(Math.max(64, measured + 4));
    }
  }, [value, rollingText]);

  // Expose the celebrate imperative via the optional celebrateRef slot.
  useEffect(() => {
    if (!celebrateRef) return;

    celebrateRef.current = {
      celebrate: (fromCents: number) => {
        // Reduced motion — skip all visuals; parent will clear state immediately.
        if (shouldReduceMotion()) {
          setStatusMsg("saved");
          setTimeout(() => setStatusMsg(""), 800);
          return Promise.resolve();
        }

        // 1. Flash the pill bg to a soft accent-success tint, then back.
        //    --color-bg-surface = #1a1a22, --color-success = #34c759.
        if (pillRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (animate as any)(
            pillRef.current,
            {
              backgroundColor: [
                "rgb(26, 26, 34)",
                "rgba(52, 199, 89, 0.18)",
                "rgb(26, 26, 34)",
              ],
            },
            { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
          );
        }

        // 2. Fade the ✓ in, hold, fade out (synced with the flash).
        if (checkRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (animate as any)(
            checkRef.current,
            { opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.9] },
            { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
          );
        }

        setStatusMsg("saved");
        setTimeout(() => setStatusMsg(""), 800);

        // 3. Number roll from fromCents → 0, updating rollingText each frame.
        return new Promise<void>((resolve) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (animate as any)(fromCents, 0, {
            duration: 0.45,
            ease: [0.16, 1, 0.3, 1],
            onUpdate: (v: number) => {
              setRollingText(formatCents(Math.max(0, Math.round(v))));
            },
            onComplete: () => {
              setRollingText(null);
              resolve();
            },
          });
        });
      },
    };

    return () => {
      if (celebrateRef) celebrateRef.current = null;
    };
    // celebrateRef is a stable ref slot — no deps needed; no re-subscribe on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleInput(e: Event) {
    // Ignore typing while a celebration roll is playing — the value will be
    // reset by the parent immediately after.
    if (rollingText !== null) return;
    const raw = (e.target as HTMLInputElement).value;
    onChange(formatAmount(raw));
  }

  function handleBlur() {
    if (!value) return;
    const n = parseAmount(value);
    if (!isNaN(n)) {
      // Format to 2 decimals in en-US
      const fixed = n.toFixed(2); // "4.00"
      const [int, dec] = fixed.split(".");
      const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      onChange(`${intFormatted}.${dec}`);
    }
  }

  const displayValue = rollingText ?? value;
  const displayText = displayValue || "0.00";

  return (
    <div class="flex flex-col items-center gap-2">
      <div
        ref={pillRef}
        class="relative inline-flex items-baseline gap-2 rounded-xl bg-bg-surface px-6 py-4"
      >
        {/* Checkmark — absolutely positioned inside the pill's left padding.
            Starts invisible; celebrate() fades it in/out. */}
        <span
          ref={checkRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%) scale(0.6)",
            opacity: 0,
            color: "var(--color-success)",
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          ✓
        </span>

        <span class="text-3xl sm:text-[40px] font-light leading-none text-text-secondary select-none">
          EUR
        </span>

        <div class="relative" style={{ width: inputWidth }}>
          <input
            ref={resolvedRef as Ref<HTMLInputElement>}
            type="text"
            inputMode="decimal"
            value={displayValue}
            onInput={handleInput}
            onBlur={handleBlur}
            placeholder="0.00"
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

      {/* Screen-reader-only status — announces "saved" without stealing focus. */}
      <span
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {statusMsg}
      </span>

      <div class="h-px w-full bg-accent opacity-30" />
    </div>
  );
}

/** Parse an en-US formatted amount string to integer cents. Returns 0 for invalid input. */
export function parseCents(raw: string): number {
  const n = parseAmount(raw);
  return isNaN(n) || n <= 0 ? 0 : Math.round(n * 100);
}

/** Format integer cents as an en-US string (e.g. 145000 → "1,450.00") for AmountInput initial values. */
export function formatCents(cents: number): string {
  const fixed = (cents / 100).toFixed(2); // "1450.00"
  const [int, dec] = fixed.split(".");
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${intFormatted}.${dec}`;
}
