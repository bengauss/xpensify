import { useState, useRef, useEffect } from "preact/hooks";
import { animate } from "motion";
import { springs } from "@/lib/animations";
import { categoryIcons } from "@/icons";
import { transitionDone } from "@/lib/transitions";
import type { Category, Subcategory } from "@/db/local";

const GRID_COLS = 3;
const STAGGER_MS = 30;

/** Staggered reveal: fade in + scale up cards from an origin position in the grid */
function revealGrid(gridEl: HTMLDivElement, originIndex?: number) {
  const cards = gridEl.querySelectorAll<HTMLButtonElement>("[data-card]");
  cards.forEach((card, i) => {
    const row = Math.floor(i / GRID_COLS);
    const col = i % GRID_COLS;

    let delay: number;
    if (originIndex !== undefined) {
      const oRow = Math.floor(originIndex / GRID_COLS);
      const oCol = originIndex % GRID_COLS;
      delay = (Math.abs(row - oRow) + Math.abs(col - oCol)) * STAGGER_MS;
    } else {
      delay = (row + col) * STAGGER_MS;
    }

    card.style.opacity = "0";
    card.style.transform = "scale(0.85)";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anim = animate(card, { opacity: 1, scale: 1 }, { ...springs.snappy, delay: delay / 1000 }) as any;
    anim.then(() => {
      card.style.opacity = "1";
      card.style.transform = "";
    });
  });
}

interface CategorySelectorProps {
  categories: Category[];
  subcategories: Subcategory[];
  onSelect: (categoryId: string, subcategoryId: string) => void;
  /** When set, opens directly to this category's subcategory view (edit mode) */
  initialCategoryId?: string;
  /** Compact mode: grid + pills only, no zoom animation (for recurring template form) */
  compact?: boolean;
  /** Currently confirmed subcategory — shows highlight on the card/pill (used by RecurringForm) */
  confirmedSubcategoryId?: string;
}

export function CategorySelector({
  categories,
  subcategories,
  onSelect,
  initialCategoryId,
  compact = false,
  confirmedSubcategoryId,
}: CategorySelectorProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    initialCategoryId ?? null
  );

  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const gridRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const needsMountReveal = useRef(!initialCategoryId);
  const lastSelectedIndex = useRef<number | undefined>(undefined);
  const pendingBackReveal = useRef(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) ?? null
    : null;

  const visibleSubcategories = selectedCategory
    ? subcategories
        .filter((s) => s.category_id === selectedCategory.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];

  // Mount reveal — staggered cascade from top-left, waits for tab transition + 150ms
  useEffect(() => {
    if (!compact && needsMountReveal.current && gridRef.current) {
      needsMountReveal.current = false;
      const grid = gridRef.current;
      let cancelled = false;

      function doReveal() {
        if (cancelled) return;
        const timer = setTimeout(() => {
          if (!cancelled) revealGrid(grid);
        }, 150);
        return () => clearTimeout(timer);
      }

      const pending = transitionDone.value;
      let cleanup: (() => void) | undefined;
      if (pending) {
        pending.then(() => { cleanup = doReveal(); });
      } else {
        cleanup = doReveal();
      }

      return () => { cancelled = true; cleanup?.(); };
    }
  }, [compact]);

  // Animate grid out + pills in when selectedCategoryId changes (non-compact)
  useEffect(() => {
    if (compact || !gridRef.current) return;

    if (selectedCategoryId) {
      // Fade out grid, then show pills
      const grid = gridRef.current;
      const pillsContainer = pillsRef.current;

      grid.style.transition = "opacity 150ms ease";
      grid.style.opacity = "0";
      grid.style.pointerEvents = "none";

      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        hideTimeout.current = null;
        grid.style.display = "none";

        // Animate pills cascading in
        if (pillsContainer) {
          const pills = pillsContainer.querySelectorAll<HTMLElement>("[data-pill]");
          pills.forEach((pill, i) => {
            pill.style.opacity = "0";
            pill.style.transform = "translateY(8px)";
            animate(
              pill,
              { opacity: [0, 1], y: [8, 0] },
              { ...springs.gentle, delay: i * 0.05 }
            );
          });
        }
      }, 200);
    } else {
      // Reverse: show grid
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
      const grid = gridRef.current;
      grid.style.display = "";
      grid.style.transition = "";
      grid.style.opacity = "1";
      grid.style.pointerEvents = "";
      // Force reflow so display change takes effect
      void grid.offsetHeight;

      if (pendingBackReveal.current) {
        pendingBackReveal.current = false;
        // Reset card styles before animating — the JSX render set opacity:0 via
        // the pendingBackReveal ref, and motion's animate may not override inline
        // styles reliably. Explicitly clear them so revealGrid can take over.
        const cards = grid.querySelectorAll<HTMLButtonElement>("[data-card]");
        cards.forEach((card) => {
          card.style.opacity = "0";
          card.style.transform = "scale(0.85)";
        });
        revealGrid(grid, lastSelectedIndex.current);
      }
    }
  }, [selectedCategoryId, compact]);

  function handleCardPress(el: HTMLButtonElement) {
    el.style.transition = "transform 100ms ease";
    el.style.transform = "scale(0.95)";
  }

  function handleCardRelease(el: HTMLButtonElement) {
    el.style.transition = "";
    animate(el, { scale: 1 }, springs.snappy);
  }

  // Sorted categories (stable reference for index lookups)
  const sortedCategories = categories.slice().sort((a, b) => a.sort_order - b.sort_order);

  function handleCategoryTap(category: Category) {
    const subs = subcategories.filter((s) => s.category_id === category.id);

    if (subs.length === 1) {
      onSelect(category.id, subs[0].id);
      return;
    }

    if (compact) {
      setSelectedCategoryId(
        selectedCategoryId === category.id ? null : category.id
      );
      return;
    }

    // Store this category's grid index for the return reveal
    lastSelectedIndex.current = sortedCategories.findIndex((c) => c.id === category.id);

    // Staggered fade-out of other cards by visual distance
    const tappedEl = cardRefs.current.get(category.id);
    if (tappedEl && gridRef.current) {
      const allCards = Array.from(
        gridRef.current.querySelectorAll<HTMLButtonElement>("[data-card]")
      );
      const tappedRect = tappedEl.getBoundingClientRect();

      allCards.forEach((card) => {
        if (card === tappedEl) return;
        const rect = card.getBoundingClientRect();
        const dx = rect.left - tappedRect.left;
        const dy = rect.top - tappedRect.top;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const delay = Math.round(dist / 20) * 15;
        card.style.transition = `opacity 150ms ease ${delay}ms`;
        card.style.opacity = "0";
      });
    }

    setSelectedCategoryId(category.id);
  }

  function handleBackToGrid() {
    if (pillsRef.current) {
      const pills = pillsRef.current.querySelectorAll<HTMLElement>("[data-pill]");
      pills.forEach((pill) => {
        pill.style.opacity = "0";
      });
    }
    // Flag triggers invisible cards via JSX style; useEffect runs the reveal
    pendingBackReveal.current = true;
    setSelectedCategoryId(null);
  }

  // ── Compact mode render ────────────────────────────────────────────────────
  if (compact) {
    return (
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-3 gap-3">
          {categories
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((cat) => {
              const IconComponent = categoryIcons[cat.icon];
              const isSelected = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  data-card
                  ref={(el) => { if (el) cardRefs.current.set(cat.id, el); }}
                  onClick={() => handleCategoryTap(cat)}
                  onMouseDown={(e) => handleCardPress(e.currentTarget as HTMLButtonElement)}
                  onMouseUp={(e) => handleCardRelease(e.currentTarget as HTMLButtonElement)}
                  onTouchStart={(e) => handleCardPress(e.currentTarget as HTMLButtonElement)}
                  onTouchEnd={(e) => handleCardRelease(e.currentTarget as HTMLButtonElement)}
                  class="flex flex-col items-center justify-center gap-2 py-4 rounded-xl cursor-pointer border"
                  style={{
                    backgroundColor: `${cat.color}0d`,
                    borderColor: isSelected ? cat.color : `${cat.color}18`,
                    borderWidth: isSelected ? "1.5px" : "1px",
                  }}
                >
                  {IconComponent && (
                    <IconComponent color={cat.color} size={26} />
                  )}
                  <span
                    class="text-[13px] leading-none"
                    style={{ color: cat.color }}
                  >
                    {cat.name}
                  </span>
                </button>
              );
            })}
        </div>

        {selectedCategory && visibleSubcategories.length > 1 && (
          <div class="flex flex-wrap gap-2 pt-1">
            {visibleSubcategories.map((sub) => (
              <button
                key={sub.id}
                onClick={() => onSelect(selectedCategory.id, sub.id)}
                class="rounded-full px-4 py-2 text-sm border cursor-pointer"
                style={{
                  backgroundColor: `${selectedCategory.color}0d`,
                  borderColor: `${selectedCategory.color}18`,
                  color: selectedCategory.color,
                }}
              >
                {sub.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Derive which category is confirmed (for single-sub categories)
  const confirmedCategoryId = confirmedSubcategoryId
    ? subcategories.find((s) => s.id === confirmedSubcategoryId)?.category_id ?? null
    : null;

  // ── Full mode render ───────────────────────────────────────────────────────
  return (
    <div class="flex flex-col gap-4">
      {/* Grid */}
      <div ref={gridRef} class="grid grid-cols-3 gap-3">
        {sortedCategories.map((cat) => {
            const IconComponent = categoryIcons[cat.icon];
            const subs = subcategories.filter((s) => s.category_id === cat.id);
            const isConfirmed = subs.length === 1 && confirmedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                data-card
                ref={(el) => { if (el) cardRefs.current.set(cat.id, el); }}
                onClick={() => handleCategoryTap(cat)}
                onMouseDown={(e) => handleCardPress(e.currentTarget as HTMLButtonElement)}
                onMouseUp={(e) => handleCardRelease(e.currentTarget as HTMLButtonElement)}
                onTouchStart={(e) => handleCardPress(e.currentTarget as HTMLButtonElement)}
                onTouchEnd={(e) => handleCardRelease(e.currentTarget as HTMLButtonElement)}
                class="flex flex-col items-center justify-center gap-2 py-4 rounded-xl cursor-pointer border"
                style={{
                  backgroundColor: isConfirmed ? `${cat.color}25` : `${cat.color}0d`,
                  borderColor: isConfirmed ? cat.color : `${cat.color}18`,
                  borderWidth: isConfirmed ? "1.5px" : "1px",
                  opacity: (needsMountReveal.current || pendingBackReveal.current) ? 0 : undefined,
                  transform: (needsMountReveal.current || pendingBackReveal.current) ? "scale(0.85)" : undefined,
                }}
              >
                {IconComponent && (
                  <IconComponent color={cat.color} size={26} />
                )}
                <span
                  class="text-[13px] leading-none"
                  style={{ color: cat.color }}
                >
                  {cat.name}
                </span>
              </button>
            );
          })}
      </div>

      {/* Selected category header + pills */}
      {selectedCategory && (
        <div class="flex flex-col items-center gap-4">
          {/* Header — tap to go back */}
          <button
            onClick={handleBackToGrid}
            class="flex flex-col items-center gap-2 cursor-pointer"
          >
            <div
              class="flex items-center justify-center w-12 h-12 rounded-full"
              style={{ backgroundColor: `${selectedCategory.color}1a` }}
            >
              {(() => {
                const IconComponent = categoryIcons[selectedCategory.icon];
                return IconComponent ? (
                  <IconComponent color={selectedCategory.color} size={24} />
                ) : null;
              })()}
            </div>
            <span
              class="text-[15px] font-semibold"
              style={{ color: selectedCategory.color }}
            >
              {selectedCategory.name}
            </span>
          </button>

          {/* Pills */}
          <div ref={pillsRef} class="flex flex-wrap justify-center gap-2">
            {visibleSubcategories.map((sub) => {
              const isConfirmedPill = confirmedSubcategoryId === sub.id;
              return (
                <button
                  key={sub.id}
                  data-pill
                  onClick={() => onSelect(selectedCategory.id, sub.id)}
                  class="rounded-full px-4 py-2 text-sm border cursor-pointer"
                  style={{
                    backgroundColor: isConfirmedPill ? `${selectedCategory.color}25` : `${selectedCategory.color}0d`,
                    borderColor: isConfirmedPill ? selectedCategory.color : `${selectedCategory.color}18`,
                    borderWidth: isConfirmedPill ? "1.5px" : "1px",
                    color: selectedCategory.color,
                    opacity: 0,
                  }}
                >
                  {sub.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
