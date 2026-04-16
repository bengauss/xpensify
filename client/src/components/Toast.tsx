import { useEffect, useRef } from "preact/hooks";
import { animate } from "motion";
import { springs, durations, getReducedMotionOverride } from "@/lib/animations";

interface ToastProps {
  message: string;
  visible: boolean;
  onDone: () => void;
}

export function Toast({ message, visible, onDone }: ToastProps) {
  const toastRef = useRef<HTMLDivElement>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible || !toastRef.current) return;

    const el = toastRef.current;

    // Reset transform/opacity in case of a re-entrance during fade-out
    el.style.opacity = "1";
    el.style.transition = "none";

    // Spring slide UP from below
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (animate as any)(
      el,
      { y: [20, 0], opacity: [0, 1] },
      { ...springs.gentle, ...getReducedMotionOverride() },
    );

    if (dismissTimer.current !== null) {
      clearTimeout(dismissTimer.current);
    }

    // Auto-dismiss after 1.5 s — bottom position is less intrusive so keep it short
    dismissTimer.current = setTimeout(() => {
      if (!toastRef.current) return;
      // Use shared exit duration (see durations.exit); hyphenated CSS keyword.
      const exitMs = Math.round(durations.exit.duration * 1000);
      toastRef.current.style.transition = `opacity ${exitMs}ms ease-out`;
      toastRef.current.style.opacity = "0";

      setTimeout(onDone, exitMs);
    }, 1500);

    return () => {
      if (dismissTimer.current !== null) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={toastRef}
      class="fixed left-1/2 -translate-x-1/2 z-50 whitespace-nowrap pointer-events-none"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
        backgroundColor: "rgba(52,199,89,0.12)",
        border: "0.5px solid rgba(52,199,89,0.2)",
        color: "#34c759",
        fontSize: "15px",
        fontWeight: 500,
        padding: "12px 24px",
        borderRadius: "24px",
        opacity: 0,
      }}
    >
      {message}
    </div>
  );
}
