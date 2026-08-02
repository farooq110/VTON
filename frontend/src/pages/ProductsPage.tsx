import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, SlidersHorizontal, Sparkles, X, Loader2, CheckCircle2 } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useAuthStore } from "@/lib/store";
import { searchProducts } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductTryOnModal } from "@/components/products/ProductTryOnModal";
import { FiltersModal } from "@/components/products/FiltersModal";
import { BrandedLoader } from "@/components/BrandedLoader";
import { logger } from "@/lib/logger";
import type { Product } from "@/types";

/**
 * PAGE_SIZE — number of products to render per "page" in the infinite
 * scroll. Smaller pages feel snappier (the IntersectionObserver fires
 * sooner), but too small causes excessive re-renders. 12 is a good
 * compromise — fills a 4-col grid 3 rows deep before loading more.
 */
const PAGE_SIZE = 12;

export function ProductsPage() {
  const navigate = useNavigate();
  const { data: products, isLoading } = useProducts();
  const { settings, selectProduct, productFilters, setProductFilters, resetProductFilters } = useAuthStore();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  // Filter sidebar — opens the FiltersModal which contains ALL filter
  // options (new arrivals, in-stock, category, price range, sizes, colors).
  // The category filter USED TO live on the main page as a <select>; it
  // has been moved INTO the FiltersModal so all filters are centralised.
  const [showFilters, setShowFilters] = useState(false);

  // ─── Infinite scroll state ────────────────────────────────────────────
  // visibleCount grows by PAGE_SIZE each time the sentinel intersects.
  // The full filtered list is computed once (memoised), then we render
  // only the first `visibleCount` items. This keeps the DOM small even
  // when the catalog is large.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Count active filters for the badge on the filter button.
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (productFilters.newArrivalsOnly) count++;
    if (productFilters.inStockOnly) count++;
    if (productFilters.category && productFilters.category !== "all") count++;
    if (productFilters.sizes.length > 0) count++;
    if (productFilters.colors.length > 0) count++;
    if (productFilters.priceMin !== null || productFilters.priceMax !== null) count++;
    return count;
  }, [productFilters]);

  // The category list is now ONLY used to populate the active-filter chip
  // rail (so the user can clear it). The actual picker lives inside the
  // FiltersModal.
  const filtered = useMemo(() => {
    let list = searchProducts(products ?? [], query);
    if (productFilters.category && productFilters.category !== "all") {
      list = list.filter((p) => p.category === productFilters.category);
    }
    // Store-side filters — applied by FiltersModal + NewArrivalsPage redirect.
    if (productFilters.newArrivalsOnly) list = list.filter((p) => p.isNew);
    if (productFilters.inStockOnly) list = list.filter((p) => p.inStock);
    if (productFilters.sizes.length > 0) {
      list = list.filter((p) => p.sizes.some((s) => productFilters.sizes.includes(s)));
    }
    if (productFilters.colors.length > 0) {
      list = list.filter((p) => p.colors.some((c) => productFilters.colors.includes(c.name)));
    }
    if (productFilters.priceMin !== null) list = list.filter((p) => p.price >= (productFilters.priceMin ?? 0));
    if (productFilters.priceMax !== null) list = list.filter((p) => p.price <= (productFilters.priceMax ?? Infinity));
    return list;
  }, [products, query, productFilters]);

  // Reset the infinite-scroll window whenever the filtered list changes
  // (e.g. user typed in the search box, applied a filter, cleared chips).
  // Without this, the user could be looking at a stale "page 3" view of
  // the OLD filtered list when the list itself has changed entirely.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, productFilters]);

  // The slice of the filtered list that's actually rendered.
  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );
  const hasReachedEnd = visibleCount >= filtered.length;

  const loadMore = () => {
    if (isLoadingMore || hasReachedEnd) return;
    setIsLoadingMore(true);
    // Tiny delay so the loading indicator is visible (otherwise it would
    // flash so fast the user never sees the feedback). 300ms matches the
    // trending rail's pacing.
    setTimeout(() => {
      setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
      setIsLoadingMore(false);
    }, 300);
  };

  // IntersectionObserver — fires loadMore when the sentinel scrolls into
  // view. Disabled when we've already shown the entire list (otherwise
  // the observer would fire forever with no work to do).
  useEffect(() => {
    if (hasReachedEnd) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMore, hasReachedEnd]);

  const handleTap = (product: Product) => {
    selectProduct(product.id);
    if (settings.productTapBehavior === "navigate") {
      navigate(`/products/${product.id}`);
    } else if (settings.productTapBehavior === "expand") {
      setExpandedId((cur) => (cur === product.id ? null : product.id));
    } else if (settings.productTapBehavior === "modal") {
      setModalProduct(product);
    }
  };

  const handleTryOn = (product?: Product) => {
    if (product) selectProduct(product.id);
    setExpandedId(null);
    setModalProduct(null);
    navigate("/tryon/camera");
  };

  const handleViewDetails = () => {
    setExpandedId(null);
    setModalProduct(null);
    const selectedId = useAuthStore.getState().selectedProductId;
    if (selectedId) navigate(`/products/${selectedId}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalHeader
        title={productFilters.newArrivalsOnly ? "New arrivals" : "Collection"}
        subtitle={`${filtered.length} ${filtered.length === 1 ? "piece" : "pieces"}${productFilters.newArrivalsOnly ? " · new drops" : " ready to try on"}`}
        backTo="/home"
      />

      {/* Search + Filters button.
          The category <select> USED TO live here; it has been moved INTO
          the FiltersModal so all filters are centralised in one place. */}
      <div className="px-3 sm:px-6 lg:px-10 py-3 sm:py-4 flex flex-col sm:flex-row gap-2 sm:gap-3 bg-card/40 items-stretch">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU, code, name…"
            className="pl-10 pr-10 h-12 text-base bg-background"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => {
            logger.interaction("Filters button clicked", { component: "ProductsPage" });
            setShowFilters(true);
          }}
          className="h-12 sm:w-auto px-4 gap-2 relative"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] bg-primary text-primary-foreground grid place-items-center rounded-full">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Tap mode hint + active filter chips — ALL active filters are shown
          here as removable chips so the user can see exactly what's
          filtering the product list at a glance. */}
      <div className="px-3 sm:px-6 lg:px-10 pb-2 flex flex-wrap items-center gap-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Tap mode: <span className="text-foreground font-medium">{settings.productTapBehavior}</span>
        </p>
        {productFilters.category && productFilters.category !== "all" && (
          <button
            onClick={() => setProductFilters({ category: "all" })}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/25 transition"
          >
            Category: {productFilters.category}
            <X className="h-3 w-3" />
          </button>
        )}
        {productFilters.newArrivalsOnly && (
          <button
            onClick={() => setProductFilters({ newArrivalsOnly: false })}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/25 transition"
          >
            <Sparkles className="h-3 w-3" /> New arrivals
            <X className="h-3 w-3" />
          </button>
        )}
        {productFilters.inStockOnly && (
          <button
            onClick={() => setProductFilters({ inStockOnly: false })}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/25 transition"
          >
            In stock
            <X className="h-3 w-3" />
          </button>
        )}
        {productFilters.priceMin !== null && (
          <button
            onClick={() => setProductFilters({ priceMin: null })}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/25 transition"
          >
            Min: ${productFilters.priceMin}
            <X className="h-3 w-3" />
          </button>
        )}
        {productFilters.priceMax !== null && (
          <button
            onClick={() => setProductFilters({ priceMax: null })}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/25 transition"
          >
            Max: ${productFilters.priceMax}
            <X className="h-3 w-3" />
          </button>
        )}
        {productFilters.sizes.map((size) => (
          <button
            key={`size-${size}`}
            onClick={() => setProductFilters({ sizes: productFilters.sizes.filter((s) => s !== size) })}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/25 transition"
          >
            Size: {size}
            <X className="h-3 w-3" />
          </button>
        ))}
        {productFilters.colors.map((color) => (
          <button
            key={`color-${color}`}
            onClick={() => setProductFilters({ colors: productFilters.colors.filter((c) => c !== color) })}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/25 transition"
          >
            {color}
            <X className="h-3 w-3" />
          </button>
        ))}
        {activeFilterCount > 0 && (
          <button
            onClick={() => resetProductFilters()}
            className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2.5 py-1 text-[10px] font-medium hover:bg-destructive/20 transition"
          >
            Clear all
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Product grid — uses shared ProductCard.
          Default 4 per row (matches the trending rail). The grid goes to
          5 columns on xl screens so the layout breathes on wide monitors. */}
      <main className="flex-1 px-3 sm:px-6 lg:px-10 py-4 sm:py-6">
        {isLoading ? (
          /* Issue 3 fix — use the reusable BrandedLoader (inline variant)
             instead of bare pulse skeletons for a consistent, branded
             loading experience across the app. */
          <BrandedLoader variant="inline" label="Loading collection…" />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground">No pieces found</p>
            <Button onClick={() => { setQuery(""); resetProductFilters(); }} variant="ghost" className="mt-2">Clear filters</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
              {visible.map((p, idx) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  index={idx}
                  expanded={settings.productTapBehavior === "expand" && expandedId === p.id}
                  onTap={() => handleTap(p)}
                  onTryOn={() => handleTryOn(p)}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>

            {/* Sentinel + loading indicator + "No more products" message.
                The IntersectionObserver attached to sentinelRef triggers
                loadMore() when this div scrolls into view. When the user
                has seen every product in the filtered list, we show a
                clear "No more products" message so they know they've
                reached the end (mirrors the trending rail's behaviour). */}
            <div ref={sentinelRef} className="grid place-items-center mt-6 pb-12 min-h-[120px]">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading more pieces…
                </div>
              )}
              {!isLoadingMore && hasReachedEnd && (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <div className="h-10 w-10 rounded-full bg-accent/10 text-accent grid place-items-center">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <p className="font-display text-sm font-medium text-foreground">No more products</p>
                  <p className="text-xs text-muted-foreground">
                    You&apos;ve seen all {filtered.length} {filtered.length === 1 ? "piece" : "pieces"}.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Product try-on modal — shown when productTapBehavior === "modal" */}
      <ProductTryOnModal
        product={modalProduct}
        open={!!modalProduct}
        onClose={() => setModalProduct(null)}
        onTryOn={() => handleTryOn(modalProduct ?? undefined)}
        onViewDetails={handleViewDetails}
      />

      {/* Filters modal — opens when the user clicks the Filters button.
          Contains ALL filter options: new arrivals, in-stock, category,
          price range, sizes, colors. Applies immediately to the store's
          productFilters when the user clicks "Show Results". */}
      <FiltersModal open={showFilters} onClose={() => setShowFilters(false)} />
    </div>
  );
}
