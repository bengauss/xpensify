import { useEffect, useRef } from "preact/hooks";
import { animate } from "motion";
import { springs } from "@/lib/animations";

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
    animate(el, { y: [20, 0], opacity: [0, 1] }, springs.gentle);

    if (dismissTimer.current !== null) {
      clearTimeout(dismissTimer.current);
    }

    // Auto-dismiss after 1.5 s — bottom position is less intrusive so keep it short
    dismissTimer.current = setTimeout(() => {
      if (!toastRef.current) return;
      toastRef.current.style.transition = "opacity 150ms ease";
      toastRef.current.style.opacity = "0";

      setTimeout(onDone, 150);
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
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)",
        backgroundColor: "rgba(52,199,89,0.12)",
        border: "0.5px solid rgba(52,199,89,0.2)",
        color: "#34c759",
        fontSize: "13px",
        fontWeight: 500,
        padding: "8px 20px",
        borderRadius: "20px",
        opacity: 0,
      }}
    >
      {message}
    </div>
  );
}
