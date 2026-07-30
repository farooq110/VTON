import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/products/ProductCard";
import { useProducts } from "@/hooks/useProducts";
import { useAuthStore } from "@/lib/store";
import type { Product } from "@/types";

/**
 * TrendingProducts — INFINITE-scrolling rail of trending products.
 *
 * The list cycles through the catalog repeatedly so it never runs out —
 * the user can keep scrolling forever and products keep appearing. This is
 * intentional for kiosk displays where the home screen should always look
 * full of options.
 *
 * Behavior:
 *   - Sorts the real catalog by `trendingScore` (desc).
 *   - IntersectionObserver loads 8 more at a time.
 *   - When the end of the catalog is reached, it cycles back to the start
 *     (appending the same products again with a new key) so the list is
 *     truly infinite — no "You've seen all styles" footer.
 *   - Tap a card → expand inline → reveal TRY ON + Details buttons.
 */
const PAGE_SIZE = 8;

export function TrendingProducts({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  useProducts();
  const products = useAuthStore((s) => s.products);

  // Trending = real catalog sorted by trendingScore (desc).
  const trending = useMemo(
    () =>
      (Array.isArray(products) ? [...products] : []).sort(
        (a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0),
      ),
    [products],
  );

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Infinite list — cycle through the catalog. Each "page" beyond the first
  // reuses the same products with a different cycle index so React keys stay
  // unique. The list never ends.
  const displayed = useMemo(() => {
    if (trending.length === 0) return [];
    const result: { product: Product; cycle: number; idx: number }[] = [];
    for (let i = 0; i < visibleCount; i++) {
      const cycle = Math.floor(i / trending.length);
      const idx = i % trending.length;
      result.push({ product: trending[idx], cycle, idx });
    }
    return result;
  }, [trending, visibleCount]);

  const loadMore = useCallback(() => {
    if (isLoading || trending.length === 0) return;
    setIsLoading(true);
    setTimeout(() => {
      setVisibleCount((c) => c + PAGE_SIZE);
      setIsLoading(false);
    }, 400);
  }, [isLoading, trending.length]);

  // IntersectionObserver — always attached (infinite list never stops).
  useEffect(() => {
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
  }, [loadMore]);

  const handleTap = (product: Product) => {
    setExpandedId((cur) => (cur === product.id ? null : product.id));
  };

  const handleTryOn = (product: Product) => {
    useAuthStore.getState().selectProduct(product.id);
    setExpandedId(null);
    navigate("/tryon/camera");
  };

  const handleViewDetails = (product: Product) => {
    setExpandedId(null);
    useAuthStore.getState().selectProduct(product.id);
    navigate(`/products/${product.id}`);
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header — sticky to the top of the viewport (under the main header)
          so it stays visible while the page scrolls. z-30 to sit above the
          product grid but below the main header (z-40) + menu overlay (z-50). */}
      <div className="sticky top-[64px] sm:top-[72px] lg:top-[80px] z-30 flex items-center justify-between px-3 sm:px-6 lg:px-10 py-3 shrink-0 border-b border-border/40 bg-background/95 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-accent" />
          <h2 className="font-display text-lg sm:text-xl font-medium">Trending now</h2>
          <Badge className="text-[10px] uppercase tracking-wider">
            {trending.length} styles
          </Badge>
        </div>
        <p className="hidden sm:block text-xs text-muted-foreground">
          Scroll to explore more
        </p>
      </div>

      {/* Grid — the whole page scrolls naturally; no internal scroll container. */}
      <div className="px-3 sm:px-6 lg:px-10 py-4">
        {trending.length === 0 ? (
          /* Beautiful empty state — shown when no trending products are available */
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center px-4 max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-accent/15 text-accent grid place-items-center mb-5 shadow-boutique">
              <Sparkles className="h-9 w-9" />
            </div>
            <h3 className="font-display text-xl sm:text-2xl font-medium">No trending styles yet</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              We&apos;re curating the hottest pieces from the collection. Check back soon, or explore the full
              collection to find your perfect look.
            </p>
            <Button
              onClick={() => navigate("/products")}
              className="mt-6 gap-2"
              size="lg"
            >
              <Flame className="h-4 w-4" /> Browse collection
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {displayed.map(({ product, cycle, idx }) => (
                <ProductCard
                  key={`${product.id}-${cycle}-${idx}`}
                  product={product}
                  index={idx}
                  expanded={expandedId === product.id}
                  onTap={() => handleTap(product)}
                  onTryOn={() => handleTryOn(product)}
                  onViewDetails={() => handleViewDetails(product)}
                  variant="compact"
                  badge={
                    <div className="flex items-center gap-1 rounded-full bg-foreground/70 backdrop-blur-md text-primary-foreground text-[10px] px-2 py-0.5 font-mono">
                      <Flame className="h-2.5 w-2.5 text-accent" /> #{idx + 1}
                    </div>
                  }
                />
              ))}
            </div>

            {/* Sentinel — always rendered (infinite list). Shows spinner while loading. */}
            <div ref={sentinelRef} className="h-12 grid place-items-center mt-4">
              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading more styles…
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
