import { useEffect, useRef } from "preact/hooks";
import type { Ref } from "preact";

interface AmountInputProps {
  value: string;
  onAmountChange: (cents: number) => void;
  /** Forwarded ref to the underlying <input> element */
  inputRef?: Ref<HTMLInputElement>;
}

export function AmountInput({ value, onAmountChange, inputRef }: AmountInputProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const resolvedRef = (inputRef ?? internalRef) as { current: HTMLInputElement | null };

  // Auto-focus on mount
  useEffect(() => {
    resolvedRef.current?.focus();
  }, []);

  function handleInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value;

    // Allow only digits and at most one decimal point
    const sanitized = raw.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    (e.target as HTMLInputElement).value = sanitized;

    // Parse to cents: treat empty / non-numeric as 0
    const numeric = parseFloat(sanitized);
    const cents = isNaN(numeric) ? 0 : Math.round(numeric * 100);
    onAmountChange(cents);
  }

  return (
    <div class="flex flex-col gap-0 rounded-lg bg-bg-surface px-4 pt-4 pb-0">
      {/* Input row */}
      <div class="flex items-center gap-3">
        {/* Currency prefix */}
        <span class="text-3xl sm:text-[44px] font-light leading-none text-text-secondary select-none">
          EUR
        </span>

        {/* Amount input */}
        <input
          ref={resolvedRef as Ref<HTMLInputElement>}
          type="text"
          inputMode="decimal"
          value={value}
          onInput={handleInput}
          placeholder="0.00"
          class="
            min-w-0 flex-1
            bg-transparent
            text-3xl sm:text-[44px] font-light leading-none
            text-text-primary placeholder:text-text-hint
            outline-none border-none
            pb-4
          "
        />
      </div>

      {/* Accent divider */}
      <div class="h-px w-full bg-accent opacity-30" />
    </div>
  );
}
