import { useRef, useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { animate } from "motion";
import type { DOMKeyframesDefinition, AnimationOptions } from "motion";
import { springs } from "@/lib/animations";

type SheetState = "closed" | "opening" | "open" | "closing";

interface DetailSheetProps {
  open: boolean;
  onClose: () => void;
  children: ComponentChildren;
}

export function DetailSheet({ open, onClose, children }: DetailSheetProps) {
  const [state, setState] = useState<SheetState>("closed");
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open && (state === "closed" || state === "closing")) {
      setState("opening");
    } else if (!open && (state === "open" || state === "opening")) {
      setState("closing");
    }
  }, [open]);

  useEffect(() => {
    if (state === "opening" && sheetRef.current) {
      const el = sheetRef.current;
      const kf: DOMKeyframesDefinition = { translateY: ["100%", "0%"] };
      animate(el as Element, kf, springs.gentle).then(() => {
        setState("open");
      });
    } else if (state === "closing" && sheetRef.current) {
      const el = sheetRef.current;
      const kf: DOMKeyframesDefinition = { translateY: ["0%", "100%"] };
      const opts: AnimationOptions = { duration: 0.2, ease: "easeOut" };
      animate(el as Element, kf, opts).then(() => {
        setState("closed");
        onCloseRef.current();
      });
    }
  }, [state]);

  if (state === "closed") return null;

  const overlayVisible = state === "open" || state === "opening";

  return (
    <div
      class="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ pointerEvents: "all" }}
    >
      {/* Overlay */}
      <div
        class="absolute inset-0 transition-opacity duration-200"
        style={{
          backgroundColor: "rgba(0,0,0,0.5)",
          opacity: overlayVisible ? 1 : 0,
        }}
        onClick={() => {
          if (state === "open") setState("closing");
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        class="relative flex flex-col"
        style={{
          backgroundColor: "#1a1a22",
          borderRadius: "24px 24px 0 0",
          maxHeight: "70vh",
          overflowY: "auto",
          willChange: "transform",
        }}
      >
        {/* Drag handle */}
        <div class="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 9999,
              backgroundColor: "#4a4a52",
            }}
          />
        </div>

        {/* Content */}
        <div class="px-4 pb-8 pt-2">{children}</div>
      </div>
    </div>
  );
}
