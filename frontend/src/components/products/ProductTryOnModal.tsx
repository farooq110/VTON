import { motion, AnimatePresence } from "framer-motion";
import { Camera, Shirt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

/**
 * ProductTryOnModal — small modal that appears when the user taps a product
 * while `settings.productTapBehavior === "modal"`.
 *
 * Ported from the Next.js preview's tryon/ProductTryOnModal.tsx. Shows just
 * enough info (image, name, SKU, price) + TRY ON + View details. Used by
 * ProductsPage when the manager-selected tap behavior is "modal".
 *
 * Spec: "small modal Wich best" — lightweight, action-focused.
 */
export interface ProductTryOnModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onTryOn: () => void;
  onViewDetails: () => void;
}

export function ProductTryOnModal({
  product,
  open,
  onClose,
  onTryOn,
  onViewDetails,
}: ProductTryOnModalProps) {
  return (
    <AnimatePresence>
      {open && product && (
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
            className="relative w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-elevated max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-foreground/40 backdrop-blur-md text-primary-foreground grid place-items-center"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Image */}
            <div className="relative aspect-[4/3] bg-muted shrink-0">
              <img
                src={product.imageUrl}
                alt={product.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
              {product.isNew && (
                <Badge className="absolute top-3 left-3 bg-accent text-accent-foreground hover:bg-accent">
                  New
                </Badge>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-boutique">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {product.category}
                </p>
                <h2 className="font-display text-xl sm:text-2xl font-medium leading-tight mt-1 text-balance">
                  {product.name}
                </h2>
                <p className="text-xs text-muted-foreground font-mono mt-1">{product.sku}</p>
                <p className="text-xl font-semibold mt-2">
                  {formatPrice(product.price, product.currency)}
                </p>
              </div>

              <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                {product.description}
              </p>

              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">{product.colors.length} colours</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{product.sizes.length} sizes</span>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-border/60 bg-card flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="lg"
                onClick={onViewDetails}
                className="flex-1 h-12 gap-2"
              >
                <Shirt className="h-4 w-4" />
                <span className="text-sm">Details</span>
              </Button>
              <Button size="lg" onClick={onTryOn} className="flex-[1.4] h-12 gap-2 text-sm">
                <Camera className="h-5 w-5" />
                TRY ON
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * ProductExpandedActions — inline expansion of a product card.
 * Reveals description excerpt + TRY ON + View details buttons.
 *
 * Spec: "expand little to show try on button"
 *
 * Note: the frontend's ProductCard already ships its own
 * `ProductExpandedActions`. Callers should import it directly from
 * `@/components/products/ProductCard` rather than re-exporting here.
 */
