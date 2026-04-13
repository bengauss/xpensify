import { useEffect, useRef, useState } from "preact/hooks";
import type { Ref } from "preact";

interface AmountInputProps {
  value: string;
  onChange: (raw: string) => void;
  /** Forwarded ref to the underlying <input> element */
  inputRef?: Ref<HTMLInputElement>;
}

export function AmountInput({ value, onChange, inputRef }: AmountInputProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const resolvedRef = (inputRef ?? internalRef) as { current: HTMLInputElement | null };
  const measureRef = useRef<HTMLSpanElement>(null);
  const [inputWidth, setInputWidth] = useState(48); // min width for "0"

  // Auto-focus on mount
  useEffect(() => {
    resolvedRef.current?.focus();
  }, []);

  // Measure text width
  useEffect(() => {
    if (measureRef.current) {
      const measured = measureRef.current.offsetWidth;
      setInputWidth(Math.max(48, measured + 4));
    }
  }, [value]);

  function handleInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value;

    // Convert commas to dots, strip anything that isn't a digit or dot,
    // and collapse multiple dots to keep only the first.
    const sanitized = raw
      .replace(/,/g, ".")
      .replace(/[^0-9.]/g, "")
      .replace(/(\..*)\./g, "$1");

    onChange(sanitized);
  }

  function handleBlur() {
    if (!value) return;
    const n = parseFloat(value);
    if (!isNaN(n)) {
      onChange(n.toFixed(2));
    }
  }

  const displayText = value || "0.00";

  return (
    <div class="flex flex-col items-center gap-2">
      {/* Container — inline, centered */}
      <div class="inline-flex items-baseline gap-2 rounded-xl bg-bg-surface px-6 py-4">
        {/* Currency prefix */}
        <span class="text-3xl sm:text-[40px] font-light leading-none text-text-secondary select-none">
          EUR
        </span>

        {/* Amount input — width driven by content */}
        <div class="relative" style={{ width: inputWidth }}>
          <input
            ref={resolvedRef as Ref<HTMLInputElement>}
            type="text"
            inputMode="decimal"
            value={value}
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

        {/* Hidden measuring span — mirrors input text to drive width */}
        <span
          ref={measureRef}
          class="text-3xl sm:text-[40px] font-light leading-none absolute invisible whitespace-pre"
          aria-hidden="true"
        >
          {displayText}
        </span>
      </div>

      {/* Accent divider — outside the container */}
      <div class="h-px w-full bg-accent opacity-30" />
    </div>
  );
}

/** Parse a raw amount string to integer cents. Returns 0 for invalid input. */
export function parseCents(raw: string): number {
  const n = parseFloat(raw);
  return isNaN(n) || n <= 0 ? 0 : Math.round(n * 100);
}
