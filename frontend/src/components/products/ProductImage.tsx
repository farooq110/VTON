import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * ProductImage — graceful image loader with skeleton placeholder (Issue 6).
 *
 * Product images load unevenly with noticeable delay, degrading UX. This
 * component shows a clean shimmering skeleton placeholder until the image
 * is FULLY loaded, then cross-fades the real image in. No layout shift,
 * no half-loaded images popping in.
 *
 * Features:
 *   - Shimmer skeleton while loading (Tailwind `animate-pulse` + gradient).
 *   - Cross-fade transition from skeleton → image (smooth, not jarring).
 *   - `onError` fallback to a tasteful "image unavailable" placeholder so
 *     broken images don't show the browser's default broken-image icon.
 *   - `loading="lazy"` by default for off-screen images (perf).
 *   - Works for ANY image src (product imageUrl, garmentOverlayUrl, etc.).
 *
 * Usage:
 *   <ProductImage src={resolveProductImage(product)} alt={product.name}
 *     className="absolute inset-0 h-full w-full object-cover" />
 *
 * The `className` prop is applied to the <img> AND the skeleton placeholder
 * so they have identical dimensions (no layout shift on load).
 */
export interface ProductImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> {
  src: string;
  alt: string;
  /** Called when the image fails to load. If omitted, a default placeholder is shown. */
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
}

export function ProductImage({
  src,
  alt,
  onError,
  className,
  loading = "lazy",
  ...rest
}: ProductImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Reset state when src changes (e.g. product card re-used for a new product).
  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [src]);

  return (
    <div className="relative overflow-hidden">
      {/* Skeleton placeholder — visible until the image is fully loaded.
          Uses `animate-pulse` + a subtle gradient for a premium shimmer.
          Identical sizing to the img (via shared className) so no layout
          shift occurs when the image swaps in. */}
      {!loaded && !errored && (
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-br from-muted via-muted/70 to-muted animate-pulse",
            className,
          )}
          aria-hidden="true"
        />
      )}

      {/* Error fallback — shown if the image fails to load. Prevents the
          browser's broken-image icon from appearing. */}
      {errored && (
        <div
          className={cn(
            "absolute inset-0 grid place-items-center bg-muted text-muted-foreground",
            className,
          )}
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 opacity-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 3.75h16.5a1.5 1.5 0 011.5 1.5v13.5a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5V5.25a1.5 1.5 0 011.5-1.5zm10.5 6a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm-3 3a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
            />
          </svg>
        </div>
      )}

      {/* The actual image. Hidden (opacity 0) until loaded, then
          cross-faded in via the `opacity` transition. */}
      {!errored && (
        <img
          src={src}
          alt={alt}
          loading={loading}
          onLoad={() => setLoaded(true)}
          onError={(e) => {
            setErrored(true);
            onError?.(e);
          }}
          className={cn(
            "transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
            className,
          )}
          {...rest}
        />
      )}
    </div>
  );
}
