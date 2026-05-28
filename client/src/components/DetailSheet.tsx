import { useRef, useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { animate } from "motion";
import { springs, getReducedMotionOverride } from "@/lib/animations";
import { usePressScale } from "@/lib/usePressScale";

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
  const dragHandlePress = usePressScale<HTMLButtonElement>(0.85);

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
        { ...springs.gentle, ...getReducedMotionOverride() },
      );
      anim.then(() => setState("open"));
    } else if (state === "closing" && sheetRef.current) {
      const el = sheetRef.current;
      // Symmetric spring on exit — the round trip should feel like the same
      // motion played backwards, not a different curve.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anim = (animate as any)(
        el,
        { y: ["0%", "100%"] },
        { ...springs.gentle, ...getReducedMotionOverride() },
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
      {/* Overlay — fixed to viewport, covers everything including the tab bar.
          Opacity ride matches the sheet spring's ~300ms landing so there's no
          frame where the overlay is gone but the sheet is still mid-slide. */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.55)",
          opacity: overlayVisible ? 1 : 0,
          transition: "opacity 300ms cubic-bezier(0.22, 1, 0.36, 1)",
          zIndex: 100,
        }}
        onClick={() => {
          if (state === "open") setState("closing");
        }}
      />

      {/* Sheet — fixed to the bottom of the viewport, capped to the app column */}
      <div
        ref={sheetRef}
        class="flex flex-col"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          marginLeft: "auto",
          marginRight: "auto",
          maxWidth: 560,
          zIndex: 101,
          backgroundColor: "#1a1a22",
          borderRadius: "24px 24px 0 0",
          maxHeight: "70dvh",
          overflowY: "auto",
          overscrollBehavior: "contain",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          willChange: "transform",
          transform: "translateY(100%)",
        }}
      >
        {/* Drag handle — doubles as a dismiss tap target */}
        <div class="flex justify-center pt-3 pb-1 flex-shrink-0">
          <button
            ref={dragHandlePress.ref}
            onPointerDown={dragHandlePress.onPointerDown}
            onPointerUp={dragHandlePress.onPointerUp}
            onPointerCancel={dragHandlePress.onPointerCancel}
            onClick={() => { if (state === "open") setState("closing"); }}
            aria-label="dismiss"
            class="bg-transparent border-0 cursor-pointer p-0"
            style={{
              width: 40,
              height: 4,
              borderRadius: 9999,
              backgroundColor: "#4a4a52",
              WebkitTapHighlightColor: "transparent",
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
