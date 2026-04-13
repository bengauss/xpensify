import { useRef, useEffect } from "preact/hooks";
import { animate } from "motion";
import { springs } from "@/lib/animations";

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

  useEffect(() => {
    if (containerRef.current) {
      // Entrance spring animation
      animate(
        containerRef.current,
        { opacity: [0, 1], scale: [0.95, 1] },
        springs.snappy
      );
    }
  }, []);

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
          onClick={onCancel}
          class="text-sm px-3 py-1.5 rounded-lg"
          style={{ color: "var(--color-text-secondary)" }}
        >
          cancel
        </button>
        <button
          onClick={onConfirm}
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
