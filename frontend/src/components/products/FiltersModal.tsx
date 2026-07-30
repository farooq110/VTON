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
 * Ported from the Next.js preview's tryon/FiltersModal.tsx, simplified to
 * fit the frontend's smaller UI kit (no shadcn `variant` API on Badge,
 * inline facet helpers instead of importing from utils).
 *
 * Filters: new-arrivals toggle, in-stock toggle, price range (min/max slider),
 * sizes (multi), colors (multi). Applies immediately to the store's
 * `productFilters`, which can be consumed both client-side and forwarded to
 * the backend query string.
 */
export interface FiltersModalProps {
  open: boolean;
  onClose: () => void;
}

export function FiltersModal({ open, onClose }: FiltersModalProps) {
  const products = useAuthStore((s) => s.products);
  const filters = useAuthStore((s) => s.productFilters);
  const setProductFilters = useAuthStore((s) => s.setProductFilters);
  const resetProductFilters = useAuthStore((s) => s.resetProductFilters);

  const facets = collectFilterFacets(products);
  const activeCount = countActiveFilters(filters);

  const toggleSize = (size: string) => {
    const next = filters.sizes.includes(size)
      ? filters.sizes.filter((s) => s !== size)
      : [...filters.sizes, size];
    setProductFilters({ sizes: next });
  };

  const toggleColor = (color: string) => {
    const next = filters.colors.includes(color)
      ? filters.colors.filter((c) => c !== color)
      : [...filters.colors, color];
    setProductFilters({ colors: next });
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
                {activeCount > 0 && (
                  <Badge className="text-[10px] bg-secondary text-secondary-foreground">
                    {activeCount} active
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {activeCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetProductFilters}
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

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto scrollbar-boutique p-4 sm:p-5 space-y-6">
              {/* New arrivals toggle */}
              <ToggleRow
                label="New arrivals only"
                hint="Show only pieces marked as new this season."
                checked={filters.newArrivalsOnly}
                onChange={(v) => setProductFilters({ newArrivalsOnly: v })}
              />

              <Separator />

              {/* In-stock toggle */}
              <ToggleRow
                label="In stock only"
                hint="Hide sold-out pieces."
                checked={filters.inStockOnly}
                onChange={(v) => setProductFilters({ inStockOnly: v })}
              />

              <Separator />

              {/* Price range */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Price range</p>
                  <span className="text-xs font-mono text-muted-foreground">
                    ${filters.priceMin ?? facets.priceMin} – ${filters.priceMax ?? facets.priceMax}
                  </span>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Min: ${filters.priceMin ?? facets.priceMin}
                    </p>
                    <Slider
                      value={[filters.priceMin ?? facets.priceMin]}
                      min={facets.priceMin}
                      max={facets.priceMax}
                      step={10}
                      onValueChange={([v]) => setProductFilters({ priceMin: v })}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Max: ${filters.priceMax ?? facets.priceMax}
                    </p>
                    <Slider
                      value={[filters.priceMax ?? facets.priceMax]}
                      min={facets.priceMin}
                      max={facets.priceMax}
                      step={10}
                      onValueChange={([v]) => setProductFilters({ priceMax: v })}
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProductFilters({ priceMin: null, priceMax: null })}
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
                        filters.sizes.includes(s)
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
                        filters.colors.includes(c.name)
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:border-foreground/40"
                      }`}
                    >
                      <span
                        className="h-5 w-5 rounded-full border border-foreground/20"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.name}
                      {filters.colors.includes(c.name) && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer — apply (closes modal) */}
            <div className="p-4 sm:p-5 border-t border-border/60 bg-card shrink-0">
              <Button onClick={onClose} className="w-full h-12 text-base">
                Show results
              </Button>
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
  // Defensive: tolerate non-array inputs so the filter modal never crashes.
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

/** Count how many filters are active (excludes query + category). */
function countActiveFilters(filters: ProductFilters): number {
  let count = 0;
  if (filters.sizes.length > 0) count += 1;
  if (filters.colors.length > 0) count += 1;
  if (filters.priceMin !== null || filters.priceMax !== null) count += 1;
  if (filters.inStockOnly) count += 1;
  if (filters.newArrivalsOnly) count += 1;
  return count;
}

// Re-export so callers can grab the constant without an extra import line.
export type { ProductFilters };
export { EMPTY_FILTERS };
