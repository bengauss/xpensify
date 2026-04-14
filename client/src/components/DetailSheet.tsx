import { useRef, useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { animate } from "motion";
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
      el.style.transform = "translateY(100%)";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anim = (animate as any)(
        el,
        { y: ["100%", "0%"] },
        springs.gentle
      );
      anim.then(() => setState("open"));
    } else if (state === "closing" && sheetRef.current) {
      const el = sheetRef.current;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anim = (animate as any)(
        el,
        { y: ["0%", "100%"] },
        { duration: 0.2, ease: "easeOut" }
      );
      anim.then(() => {
        setState("closed");
        onCloseRef.current();
      });
    }
  }, [state]);

  // Lock scroll on the active scroll container while the sheet is visible.
  // The app scrolls inside .transition-layer.active (per index.css), so we
  // toggle overflow there; we also lock <body> as a belt-and-braces guard.
  useEffect(() => {
    if (state === "closed") return;
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const layer = document.querySelector<HTMLElement>(".transition-layer.active");
    const prevLayerOverflow = layer?.style.overflow ?? "";
    if (layer) layer.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      if (layer) layer.style.overflow = prevLayerOverflow;
    };
  }, [state]);

  if (state === "closed") return null;

  const overlayVisible = state === "open" || state === "opening";

  const node = (
    <>
      {/* Overlay — fixed to viewport, covers everything including the tab bar */}
      <div
        class="transition-opacity duration-200"
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.55)",
          opacity: overlayVisible ? 1 : 0,
          zIndex: 100,
        }}
        onClick={() => {
          if (state === "open") setState("closing");
        }}
      />

      {/* Sheet — fixed to the bottom of the viewport */}
      <div
        ref={sheetRef}
        class="flex flex-col"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 101,
          backgroundColor: "#1a1a22",
          borderRadius: "24px 24px 0 0",
          maxHeight: "70dvh",
          overflowY: "auto",
          overscrollBehavior: "contain",
          paddingBottom: "env(safe-area-inset-bottom, 20px)",
          willChange: "transform",
          transform: "translateY(100%)",
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
        <div class="px-4 pb-6 pt-2">{children}</div>
      </div>
    </>
  );

  return createPortal(node, document.body);
}
