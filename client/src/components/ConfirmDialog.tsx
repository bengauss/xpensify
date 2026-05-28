import { useRef, useEffect, useState } from "preact/hooks";
import { animate } from "motion";
import { springs, getReducedMotionOverride, shouldReduceMotion } from "@/lib/animations";

interface ConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
  message?: string;
}

export function ConfirmDialog({
  onConfirm,
  onCancel,
  message = "are you sure?",
}: ConfirmDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      // Entrance spring animation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (animate as any)(
        containerRef.current,
        { opacity: [0, 1], scale: [0.95, 1] },
        { ...springs.snappy, ...getReducedMotionOverride() },
      );
    }
  }, []);

  function dismiss(action: () => void) {
    if (closing) return;
    setClosing(true);
    const el = containerRef.current;
    if (!el || shouldReduceMotion()) {
      action();
      return;
    }
    // Symmetric spring on exit — matches the entrance so the round trip
    // reads as one motion played forward then back.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anim = (animate as any)(
      el,
      { opacity: [1, 0], scale: [1, 0.95] },
      { ...springs.snappy, ...getReducedMotionOverride() },
    );
    const fire = () => action();
    if (anim && anim.finished && typeof anim.finished.then === "function") {
      anim.finished.then(fire).catch(fire);
    } else {
      fire();
    }
  }

  return (
    <div
      ref={containerRef}
      class="flex items-center justify-between gap-3 py-2"
      style={{ opacity: 0 }}
    >
      <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {message}
      </span>
      <div class="flex gap-3">
        <button
          onClick={() => dismiss(onCancel)}
          class="text-sm px-3 py-1.5 rounded-lg"
          style={{ color: "var(--color-text-secondary)" }}
        >
          cancel
        </button>
        <button
          onClick={() => dismiss(onConfirm)}
          class="text-sm px-3 py-1.5 rounded-lg font-medium"
          style={{
            color: "var(--color-danger)",
            backgroundColor: "rgba(255,55,95,0.12)",
          }}
        >
          delete
        </button>
      </div>
    </div>
  );
}
