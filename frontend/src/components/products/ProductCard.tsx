import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice, resolveProductImage, onImageError } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { ProductImage } from "@/components/products/ProductImage";
import type { Product } from "@/types";

/**
 * ProductCard — the shared product tile used by BOTH:
 *   - ProductScreen (collection grid)
 *   - TrendingProducts (home screen rail)
 *
 * Behavior:
 *   - Tap toggles `expanded`
 *   - When expanded, shows `ProductExpandedActions` (Try on + Details buttons)
 *   - When collapsed, shows product image + name + SKU + price + colors count
 *   - `onTryOn` and `onViewDetails` callbacks are passed through
 *
 * Optional `badge` prop lets the caller add a small top-left overlay
 * (e.g. the trending rank "#1" badge on the home rail).
 *
 * Layout:
 *   - Mobile: horizontal (image left, info right) — keeps tiles compact.
 *   - sm+:   vertical (image on top, info below).
 */
export interface ProductCardProps {
  product: Product;
  index: number;
  expanded: boolean;
  onTap: () => void;
  onTryOn: () => void;
  onViewDetails: () => void;
  /** Optional small overlay shown at top-left of the image (e.g. "#1 trending"). */
  badge?: React.ReactNode;
  /** Layout variant — "grid" (default, used by ProductScreen) or "compact"
   *  (slightly tighter, used by TrendingProducts on small screens). */
  variant?: "grid" | "compact";
}

export function ProductCard({
  product,
  index,
  expanded,
  onTap,
  onTryOn,
  onViewDetails,
  badge,
  variant = "grid",
}: ProductCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // When a card expands, scroll it into view so the expanded actions (TRY ON +
  // Details buttons) are fully visible — not clipped by the viewport edges.
  // `block: "center"` centers the card so both the image and the action bar
  // are visible on small screens and narrow trending rails.
  useEffect(() => {
    if (expanded && cardRef.current) {
      const t = setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 280);
      return () => clearTimeout(t);
    }
  }, [expanded]);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      className="rounded-2xl overflow-hidden bg-card border border-border/60 shadow-boutique hover:shadow-elevated transition-shadow flex flex-col"
    >
      <button
        onClick={() => {
          logger.interaction(`Product card tapped: ${product.name}`, {
            component: "ProductCard",
            detail: `SKU ${product.sku} · ${expanded ? "collapsing" : "expanding"}`,
          });
          onTap();
        }}
        className="group block w-full text-left cursor-pointer"
        aria-label={`${product.name} — ${product.sku} — tap to ${expanded ? "collapse" : "expand"}`}
      >
        {/* Mobile: horizontal layout (image left, info right). Desktop: vertical. */}
        <div className="flex sm:flex-col">
          <div className="relative w-28 sm:w-auto aspect-[4/5] sm:aspect-[4/5] overflow-hidden bg-muted shrink-0 sm:shrink">
            {/* Issue 6 fix — graceful image loading with shimmer skeleton.
                Issue 5 fix — pass wrapperClassName="absolute inset-0 h-full w-full"
                so the wrapper fills the parent (which is `relative aspect-[4/5]`).
                Without this, the wrapper had no explicit dimensions and could
                collapse to 0×0 on first render, hiding the image. */}
            <ProductImage
              src={resolveProductImage(product)}
              alt={product.name}
              wrapperClassName="absolute inset-0 h-full w-full"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={(e) => onImageError(e, product.sku)}
            />
            {/* Caller-provided badge (e.g. trending rank) */}
            {badge && (
              <div className="absolute top-2 left-2 z-10">{badge}</div>
            )}
            {/* Default "New" badge — only show if caller didn't provide one */}
            {!badge && product.isNew && (
              <Badge className="absolute top-2 left-2 bg-accent text-accent-foreground hover:bg-accent text-[9px]">
                New
              </Badge>
            )}
            {!product.inStock && (
              <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
                <span className="text-[10px] uppercase tracking-widest text-foreground">Sold out</span>
              </div>
            )}
            {/* Trending score gauge — bottom-right (only shown if product has one) */}
            {typeof product.trendingScore === "number" && variant === "compact" && (
              <div className="absolute bottom-2 right-2 rounded-full bg-accent/90 text-accent-foreground text-[10px] px-2 py-0.5 font-mono">
                {product.trendingScore}%
              </div>
            )}
          </div>
          <div className="p-3 sm:p-4 flex flex-col gap-1 sm:gap-1.5 flex-1 justify-center">
            <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{product.category}</p>
            <h3 className="font-display text-sm sm:text-base font-medium leading-tight line-clamp-2">{product.name}</h3>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 font-mono">{product.sku}</p>
            <div className="mt-1 sm:mt-auto sm:pt-2 flex items-center justify-between">
              <span className="text-sm sm:text-base font-semibold">{formatPrice(product.price, product.currency)}</span>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground">{product.colors.length}c</span>
            </div>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <ProductExpandedActions product={product} onTryOn={onTryOn} onViewDetails={onViewDetails} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * ProductExpandedActions — inline expansion of a product card.
 * Reveals description excerpt + TRY ON + View details buttons.
 *
 * Overflow-prevention (Change 2 sync from preview):
 *   - `flex-wrap` so the buttons stack on very narrow cards instead of
 *     overflowing horizontally.
 *   - `min-w-[calc(50%-0.25rem)]` so each button claims at least half the row
 *     before wrapping (prevents one tiny button + one stretched button).
 *   - `whitespace-nowrap` + `shrink-0` on the icon keeps the icon visible.
 *   - `truncate` on the label span clips long labels cleanly.
 *   - Together these stop the TRY ON button from spilling outside the card on
 *     narrow rails (the original bug).
 */
export function ProductExpandedActions({
  product,
  onTryOn,
  onViewDetails,
}: {
  product: Product;
  onTryOn: () => void;
  onViewDetails: () => void;
}) {
  return (
    <motion.div
      initial={{ maxHeight: 0, opacity: 0 }}
      animate={{ maxHeight: 300, opacity: 1 }}
      exit={{ maxHeight: 0, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden border-t border-border/40 bg-muted/30"
    >
      <div className="p-3 space-y-2.5">
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{product.description}</p>
        <div className="flex flex-wrap gap-2 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              logger.interaction(`View details clicked: ${product.name}`, { component: "ProductExpandedActions" });
              onViewDetails();
            }}
            className="flex-1 min-w-[calc(50%-0.25rem)] h-10 gap-1 text-xs whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Details</span>
          </Button>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              logger.interaction(`TRY ON clicked: ${product.name}`, { component: "ProductExpandedActions" });
              onTryOn();
            }}
            className="flex-[1.4] min-w-[calc(50%-0.25rem)] h-10 gap-1 text-xs whitespace-nowrap"
          >
            <Camera className="h-4 w-4 shrink-0" /> <span className="truncate">TRY ON</span>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
