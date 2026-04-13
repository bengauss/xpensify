import { useState, useRef, useEffect } from "preact/hooks";
import { animate } from "motion";
import { springs } from "@/lib/animations";
import { categoryIcons } from "@/icons";
import type { Category, Subcategory } from "@/db/local";

interface CategorySelectorProps {
  categories: Category[];
  subcategories: Subcategory[];
  onSelect: (categoryId: string, subcategoryId: string) => void;
  /** When set, opens directly to this category's subcategory view (edit mode) */
  initialCategoryId?: string;
  /** Compact mode: grid + pills only, no zoom animation (for recurring template form) */
  compact?: boolean;
}

export function CategorySelector({
  categories,
  subcategories,
  onSelect,
  initialCategoryId,
  compact = false,
}: CategorySelectorProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    initialCategoryId ?? null
  );

  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const gridRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) ?? null
    : null;

  const visibleSubcategories = selectedCategory
    ? subcategories
        .filter((s) => s.category_id === selectedCategory.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];

  // Animate grid out + pills in when selectedCategoryId changes (non-compact)
  useEffect(() => {
    if (compact || !gridRef.current) return;

    if (selectedCategoryId) {
      // Fade out grid, then show pills
      const grid = gridRef.current;
      const pillsContainer = pillsRef.current;

      grid.style.transition = "opacity 150ms ease, height 150ms ease";
      grid.style.opacity = "0";
      grid.style.pointerEvents = "none";

      setTimeout(() => {
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
      const grid = gridRef.current;
      grid.style.display = "";
      // Force reflow
      void grid.offsetHeight;
      grid.style.transition = "opacity 150ms ease";
      grid.style.opacity = "1";
      grid.style.pointerEvents = "";
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
    // Reset all card opacities before showing grid
    if (gridRef.current) {
      const allCards = gridRef.current.querySelectorAll<HTMLButtonElement>("[data-card]");
      allCards.forEach((card) => {
        card.style.transition = "";
        card.style.opacity = "1";
      });
    }
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
                  class="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl cursor-pointer border"
                  style={{
                    backgroundColor: `${cat.color}0d`,
                    borderColor: isSelected ? cat.color : `${cat.color}18`,
                    borderWidth: isSelected ? "1.5px" : "1px",
                  }}
                >
                  {IconComponent && (
                    <IconComponent color={cat.color} size={20} />
                  )}
                  <span
                    class="text-[11px] leading-none"
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

  // ── Full mode render ───────────────────────────────────────────────────────
  return (
    <div class="flex flex-col gap-4">
      {/* Grid */}
      <div ref={gridRef} class="grid grid-cols-3 gap-3">
        {categories
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((cat) => {
            const IconComponent = categoryIcons[cat.icon];
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
                class="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl cursor-pointer border"
                style={{
                  backgroundColor: `${cat.color}0d`,
                  borderColor: `${cat.color}18`,
                }}
              >
                {IconComponent && (
                  <IconComponent color={cat.color} size={20} />
                )}
                <span
                  class="text-[11px] leading-none"
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
            {visibleSubcategories.map((sub) => (
              <button
                key={sub.id}
                data-pill
                onClick={() => onSelect(selectedCategory.id, sub.id)}
                class="rounded-full px-4 py-2 text-sm border cursor-pointer"
                style={{
                  backgroundColor: `${selectedCategory.color}0d`,
                  borderColor: `${selectedCategory.color}18`,
                  color: selectedCategory.color,
                  opacity: 0,
                }}
              >
                {sub.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
