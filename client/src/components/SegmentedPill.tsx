import { usePressScale } from "@/lib/usePressScale";

export interface SegmentedOption<T extends string> {
  value: T;
  shortLabel: string;
  longLabel?: string;
}

interface SegmentedPillProps<T extends string> {
  options: [SegmentedOption<T>, SegmentedOption<T>];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function SegmentedPill<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedPillProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      class="inline-flex items-center"
      style={{
        height: 32,
        padding: 2,
        borderRadius: 9999,
        backgroundColor: "var(--color-bg-surface)",
        border: "1px solid rgba(42,42,50,0.8)",
      }}
    >
      {options.map((opt) => (
        <Segment
          key={opt.value}
          opt={opt}
          selected={opt.value === value}
          onSelect={() => onChange(opt.value)}
        />
      ))}
    </div>
  );
}

interface SegmentProps<T extends string> {
  opt: SegmentedOption<T>;
  selected: boolean;
  onSelect: () => void;
}

function Segment<T extends string>({ opt, selected, onSelect }: SegmentProps<T>) {
  const press = usePressScale<HTMLButtonElement>(0.95);
  return (
    <button
      ref={press.ref}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onClick={onSelect}
      aria-pressed={selected}
      class="bg-transparent border-0 cursor-pointer tabular-nums"
      style={{
        height: 26,
        padding: "0 10px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 500,
        color: selected ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
        backgroundColor: selected ? "rgba(108,156,255,0.18)" : "transparent",
        transition: "background-color 180ms ease, color 180ms ease",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span class="sm:hidden">{opt.shortLabel}</span>
      <span class="hidden sm:inline">{opt.longLabel ?? opt.shortLabel}</span>
    </button>
  );
}
