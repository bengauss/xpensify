import { useRef, useEffect } from "preact/hooks";
import { animate } from "motion";
import { springs, durations, getReducedMotionOverride } from "@/lib/animations";

interface ToggleProps {
  active: boolean;
  onToggle: () => void;
}

export function Toggle({ active, onToggle }: ToggleProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!knobRef.current) return;
    const targetX = active ? 16 : 0;
    // Knob slides on spring (physical motion).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (animate as any)(knobRef.current, { x: targetX }, { ...springs.toggle, ...getReducedMotionOverride() });
    if (trackRef.current) {
      // Track colour uses duration + ease — colour has no mass, springs are
      // physically meaningless for it and can read as a lagging overshoot.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (animate as any)(
        trackRef.current,
        { backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)" },
        { ...durations.exit, ...getReducedMotionOverride() },
      );
    }
  }, [active]);

  return (
    <button
      ref={trackRef}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      class="relative flex-shrink-0 rounded-full cursor-pointer border-0 p-0"
      style={{
        width: 40,
        height: 24,
        backgroundColor: active ? "var(--color-accent)" : "var(--color-text-ghost)",
      }}
      aria-label={active ? "disable" : "enable"}
    >
      <div
        ref={knobRef}
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          backgroundColor: "white",
        }}
      />
    </button>
  );
}
