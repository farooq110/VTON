import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/products/ProductCard";
import { useProducts } from "@/hooks/useProducts";
import { useAuthStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import type { Product } from "@/types";

/**
 * TrendingProducts — paginated rail of trending products, CAPPED at 30.
 *
 * Behavior:
 *   - Sorts the real catalog by `trendingScore` (desc).
 *   - IntersectionObserver loads 8 more at a time.
 *   - STOPS at 30 products — displays a clear "No more products" message
 *     when the user reaches the end.
 *   - Tap a card → expand ONLY that card (unique cardKey) → reveal TRY ON
 *     + Details buttons.
 */
const PAGE_SIZE = 8;
const MAX_TRENDING = 30;

export function TrendingProducts({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  useProducts();
  const products = useAuthStore((s) => s.products);

  // Trending = real catalog sorted by trendingScore (desc), capped at 30.
  const trending = useMemo(
    () =>
      (Array.isArray(products) ? [...products] : [])
        .sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0))
        .slice(0, MAX_TRENDING),
    [products],
  );

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  // Unique per-card key so only the tapped card expands (not all cards with
  // the same product.id).
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // displayed = first `visibleCount` of the (capped) trending list.
  const displayed = useMemo(() => {
    if (trending.length === 0) return [];
    const result: { product: Product; idx: number; cardKey: string }[] = [];
    for (let i = 0; i < Math.min(visibleCount, trending.length); i++) {
      const product = trending[i];
      const cardKey = `${product.id}-${i}`;
      result.push({ product, idx: i, cardKey });
    }
    return result;
  }, [trending, visibleCount]);

  // True when the user has seen all 30 (or fewer if catalog is smaller).
  const hasReachedEnd = visibleCount >= trending.length;

  const loadMore = useCallback(() => {
    if (isLoading || trending.length === 0) return;
    if (visibleCount >= trending.length) return; // already at the end
    setIsLoading(true);
    setTimeout(() => {
      setVisibleCount((c) => Math.min(c + PAGE_SIZE, trending.length));
      setIsLoading(false);
    }, 400);
  }, [isLoading, trending.length, visibleCount]);

  // IntersectionObserver — only loads more when NOT at the end.
  useEffect(() => {
    if (hasReachedEnd) return; // no more to load — don't observe
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
  }, [loadMore, hasReachedEnd]);

  const handleTap = (_product: Product, cardKey: string) => {
    logger.interaction(`Trending card tapped: ${_product.name}`, {
      component: "TrendingProducts",
      detail: `SKU ${_product.sku}`,
    });
    setExpandedCardKey((cur) => (cur === cardKey ? null : cardKey));
  };

  const handleTryOn = (product: Product) => {
    logger.interaction(`TRY ON clicked: ${product.name}`, {
      component: "TrendingProducts",
    });
    useAuthStore.getState().selectProduct(product.id);
    setExpandedCardKey(null);
    navigate("/tryon/camera");
  };

  const handleViewDetails = (product: Product) => {
    logger.interaction(`View details clicked: ${product.name}`, {
      component: "TrendingProducts",
    });
    setExpandedCardKey(null);
    useAuthStore.getState().selectProduct(product.id);
    navigate(`/products/${product.id}`);
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Issue 1 fix — sticky top-0 with NO top offset. When the hero
          scrolls completely off-screen, this header sticks flush to the
          very top of the viewport (no gap, no padding above it). The main
          header is fixed + transparent and hidden when hero is out of view,
          so this header takes over as the top bar cleanly. */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-3 sm:px-6 lg:px-10 py-3 shrink-0 border-b border-border/40 bg-background/95 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-accent" />
          <h2 className="font-display text-lg sm:text-xl font-medium">Trending now</h2>
          <Badge className="text-[10px] uppercase tracking-wider">
            {trending.length} styles
          </Badge>
        </div>
        <p className="hidden sm:block text-xs text-muted-foreground">
          {hasReachedEnd ? "You've seen all styles" : "Scroll to explore more"}
        </p>
      </div>

      {/* Grid */}
      <div className="px-3 sm:px-6 lg:px-10 py-4">
        {trending.length === 0 ? (
          /* Empty state — no trending products available */
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
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 sm:gap-4">
              {displayed.map(({ product, idx, cardKey }) => (
                <ProductCard
                  key={cardKey}
                  product={product}
                  index={idx}
                  expanded={expandedCardKey === cardKey}
                  onTap={() => handleTap(product, cardKey)}
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

            {/* Sentinel + end-of-list message.
                When the user has seen all 30 products, show a clear
                "No more products" message. The Browse-all button has been
                removed per the user's request — the user can navigate to
                the full collection via the header menu or the home banner.
                Bottom padding ensures this isn't hidden behind the footer. */}
            <div ref={sentinelRef} className="grid place-items-center mt-6 pb-24 min-h-[120px]">
              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading more styles…
                </div>
              )}
              {!isLoading && hasReachedEnd && (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <div className="h-10 w-10 rounded-full bg-accent/10 text-accent grid place-items-center">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <p className="font-display text-sm font-medium text-foreground">No more products</p>
                  <p className="text-xs text-muted-foreground">
                    You&apos;ve seen all {trending.length} trending styles.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
