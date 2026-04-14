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

    // Reset opacity in case of a re-entrance during fade-out
    el.style.opacity = "1";
    el.style.transition = "none";

    // Spring slide-in from top
    animate(el, { y: [-20, 0], opacity: [0, 1] }, springs.gentle);

    // Clear any pending dismiss
    if (dismissTimer.current !== null) {
      clearTimeout(dismissTimer.current);
    }

    // Auto-dismiss after 2 s with a CSS opacity fade
    dismissTimer.current = setTimeout(() => {
      if (!toastRef.current) return;
      toastRef.current.style.transition = "opacity 300ms ease";
      toastRef.current.style.opacity = "0";

      // Notify parent after the fade completes
      setTimeout(onDone, 300);
    }, 2000);

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
      // Fixed pill above the input — sits in the header band, honors iOS notch
      class="
        fixed left-1/2 -translate-x-1/2 z-50
        flex items-center gap-2
        px-5 py-2
        rounded-full
        bg-success/15
        border border-success/30
        text-success text-sm font-medium
        shadow-lg
        whitespace-nowrap
        pointer-events-none
      "
      style={{
        top: "max(4px, env(safe-area-inset-top, 4px))",
        opacity: 0, // start invisible; animation drives it in
      }}
    >
      {message}
    </div>
  );
}
