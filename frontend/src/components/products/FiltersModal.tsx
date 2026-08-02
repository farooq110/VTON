import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/lib/store";
import { EMPTY_FILTERS } from "@/types";
import type { Product, ProductFilters } from "@/types";

/**
 * FiltersModal — full filter panel for the products list.
 *
 * ─── DRAFT / COMMIT PATTERN ─────────────────────────────────────────────
 * Filters do NOT apply immediately when the user toggles/slides/selects.
 * Instead, all changes go into a LOCAL DRAFT state. The draft is only
 * committed to the global store (which drives the actual product filtering)
 * when the user clicks "Show Results". This matches the user's expectation:
 * they can experiment with filters in the modal without seeing the product
 * grid jump around behind it.
 *
 * If the user closes the modal via the X button or backdrop click WITHOUT
 * clicking "Show Results", the draft is discarded — the store keeps its
 * previous filters.
 *
 * The "Reset" button resets the DRAFT (not the committed filters) to empty.
 *
 * ─── PRICE RANGE FROM SETTINGS ─────────────────────────────────────────
 * The min/max bounds of the price slider are read from
 * `settings.priceRange` (managed on the Settings page). The defaults are
 * { min: 0, max: 10000 } (rounded). This lets the boutique manager widen
 * or narrow the price filter without touching code.
 *
 * ─── CATEGORY FILTER ───────────────────────────────────────────────────
 * The category filter (previously a `<select>` on the main page) now lives
 * inside this modal alongside the other filters. The main page no longer
 * renders its own category picker — filters are centralised here.
 */
export interface FiltersModalProps {
  open: boolean;
  onClose: () => void;
}

export function FiltersModal({ open, onClose }: FiltersModalProps) {
  const products = useAuthStore((s) => s.products);
  const committedFilters = useAuthStore((s) => s.productFilters);
  const setProductFilters = useAuthStore((s) => s.setProductFilters);
  const priceRange = useAuthStore((s) => s.settings.priceRange);

  // ─── DRAFT STATE ──────────────────────────────────────────────────────
  // The draft is initialized from the COMMITTED filters when the modal opens.
  // All controls update the draft (local state) — the store is NOT touched
  // until "Show Results" is clicked.
  const [draft, setDraft] = useState<ProductFilters>(committedFilters);

  // When the modal opens, sync the draft from the committed filters.
  // This ensures the draft reflects the current state every time the user
  // opens the modal (e.g. if they opened it, changed some filters, closed
  // without applying, then reopened — they see the last committed state).
  useEffect(() => {
    if (open) {
      setDraft({ ...committedFilters });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const facets = collectFilterFacets(products);
  // Effective price bounds — read from settings (managed on Settings page).
  // Fallback to {0, 10000} for legacy persisted state without priceRange.
  const priceBounds = {
    min: Math.max(0, Math.round(priceRange?.min ?? 0)),
    max: Math.max(0, Math.round(priceRange?.max ?? 10000)),
  };
  // If the persisted bounds are inverted (min > max), normalise them so the
  // slider can't render with min >= max (which would crash Radix Slider).
  if (priceBounds.max < priceBounds.min) {
    priceBounds.max = priceBounds.min;
  }
  const draftActiveCount = countActiveFilters(draft, facets);

  const patchDraft = (patch: Partial<ProductFilters>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };

  const toggleSize = (size: string) => {
    const next = draft.sizes.includes(size)
      ? draft.sizes.filter((s) => s !== size)
      : [...draft.sizes, size];
    patchDraft({ sizes: next });
  };

  const toggleColor = (color: string) => {
    const next = draft.colors.includes(color)
      ? draft.colors.filter((c) => c !== color)
      : [...draft.colors, color];
    patchDraft({ colors: next });
  };

  const toggleCategory = (category: string) => {
    patchDraft({ category: draft.category === category ? "all" : category });
  };

  const resetDraft = () => {
    setDraft({ ...EMPTY_FILTERS });
  };

  // ─── COMMIT ───────────────────────────────────────────────────────────
  // Only called when the user clicks "Show Results". Writes the draft to
  // the store (which drives the actual product filtering) and closes.
  const applyAndClose = () => {
    setProductFilters(draft);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-foreground/70 backdrop-blur-sm p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%", opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full sm:max-w-lg bg-card rounded-t-3xl sm:rounded-3xl shadow-elevated max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h2 className="font-display text-base sm:text-lg font-medium">Filters</h2>
                {draftActiveCount > 0 && (
                  <Badge className="text-[10px] bg-secondary text-secondary-foreground">
                    {draftActiveCount} selected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {draftActiveCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetDraft}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Body — scrollable. All controls update the DRAFT only. */}
            <div className="flex-1 overflow-y-auto scrollbar-boutique p-4 sm:p-5 space-y-6">
              {/* New arrivals toggle */}
              <ToggleRow
                label="New arrivals only"
                hint="Show only pieces marked as new this season."
                checked={draft.newArrivalsOnly}
                onChange={(v) => patchDraft({ newArrivalsOnly: v })}
              />

              <Separator />

              {/* In-stock toggle */}
              <ToggleRow
                label="In stock only"
                hint="Hide sold-out pieces."
                checked={draft.inStockOnly}
                onChange={(v) => patchDraft({ inStockOnly: v })}
              />

              <Separator />

              {/* Category filter — moved here from the main products page. */}
              {facets.categories.length > 0 && (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Category</p>
                      {draft.category !== "all" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => patchDraft({ category: "all" })}
                          className="h-7 text-xs text-muted-foreground"
                        >
                          Clear category
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => patchDraft({ category: "all" })}
                        className={`min-w-[2.75rem] h-10 px-3 rounded-xl border text-sm font-medium transition ${
                          draft.category === "all"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-foreground/40"
                        }`}
                      >
                        All
                      </button>
                      {facets.categories.map((c) => (
                        <button
                          key={c}
                          onClick={() => toggleCategory(c)}
                          className={`min-w-[2.75rem] h-10 px-3 rounded-xl border text-sm font-medium transition ${
                            draft.category === c
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:border-foreground/40"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Price range — bounds driven by settings.priceRange */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Price range</p>
                  <span className="text-xs font-mono text-muted-foreground">
                    ${draft.priceMin ?? priceBounds.min} – ${draft.priceMax ?? priceBounds.max}
                  </span>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Min: ${draft.priceMin ?? priceBounds.min}
                    </p>
                    <Slider
                      value={[draft.priceMin ?? priceBounds.min]}
                      min={priceBounds.min}
                      max={priceBounds.max}
                      step={10}
                      onValueChange={([v]) => patchDraft({ priceMin: v })}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Max: ${draft.priceMax ?? priceBounds.max}
                    </p>
                    <Slider
                      value={[draft.priceMax ?? priceBounds.max]}
                      min={priceBounds.min}
                      max={priceBounds.max}
                      step={10}
                      onValueChange={([v]) => patchDraft({ priceMax: v })}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Range configurable from Settings → Price range bounds.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => patchDraft({ priceMin: null, priceMax: null })}
                  className="h-7 text-xs text-muted-foreground"
                >
                  Clear price
                </Button>
              </div>

              <Separator />

              {/* Sizes */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Sizes</p>
                <div className="flex flex-wrap gap-2">
                  {facets.sizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSize(s)}
                      className={`min-w-[2.75rem] h-10 px-3 rounded-xl border text-sm font-medium transition ${
                        draft.sizes.includes(s)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-foreground/40"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Colors */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Colours</p>
                <div className="flex flex-wrap gap-2">
                  {facets.colors.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => toggleColor(c.name)}
                      className={`flex items-center gap-2 h-10 px-3 rounded-xl border text-sm font-medium transition ${
                        draft.colors.includes(c.name)
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:border-foreground/40"
                      }`}
                    >
                      <span
                        className="h-5 w-5 rounded-full border border-foreground/20"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.name}
                      {draft.colors.includes(c.name) && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer — "Show Results" commits the draft to the store. */}
            <div className="p-4 sm:p-5 border-t border-border/60 bg-card shrink-0">
              <Button onClick={applyAndClose} className="w-full h-12 text-base">
                Show {draftActiveCount > 0 ? `${draftActiveCount} filter${draftActiveCount === 1 ? "" : "s"} · ` : ""}Results
              </Button>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Filters apply only when you tap &quot;Show Results&quot;.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Collect unique sizes/colors/categories across a product list — for filter UI. */
function collectFilterFacets(products: Product[]) {
  const list = Array.isArray(products) ? products : [];
  const categories = Array.from(new Set(list.map((p) => p?.category).filter(Boolean))).sort();
  const sizes = Array.from(new Set(list.flatMap((p) => p?.sizes ?? []))).sort();
  const colors = Array.from(
    new Map(list.flatMap((p) => p?.colors ?? []).map((c) => [c.name, c])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
  const prices = list.map((p) => p?.price ?? 0);
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 1000;
  return { categories, sizes, colors, priceMin, priceMax };
}

/** Count how many filters are active (excludes query). */
function countActiveFilters(filters: ProductFilters, facets: { categories: string[] }): number {
  let count = 0;
  if (filters.category && filters.category !== "all") count += 1;
  if (filters.sizes.length > 0) count += 1;
  if (filters.colors.length > 0) count += 1;
  if (filters.priceMin !== null || filters.priceMax !== null) count += 1;
  if (filters.inStockOnly) count += 1;
  if (filters.newArrivalsOnly) count += 1;
  // facets is included in the signature to keep the call site stable; we
  // don't actually use it here but it lets future expansion (e.g. counting
  // only "available" categories) without changing call sites.
  void facets;
  return count;
}

// Re-export so callers can grab the constant without an extra import line.
export type { ProductFilters };
export { EMPTY_FILTERS };
