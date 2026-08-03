import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

/**
 * OptimizedImage — the SINGLE SOURCE OF TRUTH for all image rendering in
 * the app. Issue 1 + 2 fix.
 *
 * Designed as a drop-in replacement for `<img>` that maximises loading
 * performance, prevents UI jank (main-thread block), and optimises network
 * bandwidth — without relying on heavy third-party lazy-loading libraries.
 *
 * ─── PERFORMANCE TECHNIQUES (non-negotiable) ──────────────────────────
 *
 * 1. **Native Non-Blocking Loading** (`loading="lazy"` by default):
 *    The browser handles lazy-loading natively — no JS needed. Images
 *    below the fold are only fetched when the user scrolls near them,
 *    saving bandwidth on large product lists.
 *
 * 2. **Non-Blocking Rendering** (`decoding="async"`):
 *    Image decoding happens OFF the main thread. In Electron (Chromium)
 *    this prevents UI freezes when 50+ product images decode simultaneously
 *    on first paint. Without this, the main thread is blocked for
 *    ~50-200ms per image during decode, causing visible jank.
 *
 * 3. **Layout Stability / CLS** (forced `width` + `height` props):
 *    The browser reserves the layout slot BEFORE the image loads, so the
 *    page never shifts when images pop in. The `aspect-ratio` CSS is
 *    derived from these props. This is the #1 defence against Cumulative
 *    Layout Shift (a Core Web Vital).
 *
 * 4. **Prioritisation** (`priority` prop):
 *    - `priority={true}`  → `loading="eager"` + `fetchPriority="high"`
 *      Use for above-the-fold hero images (the first product the user sees).
 *    - `priority={false}` (default) → `loading="lazy"` + `fetchPriority="low"`
 *      Use for everything else — the browser deprioritises these so they
 *      don't compete with critical resources.
 *
 * 5. **Skeleton Placeholder**:
 *    A shimmer skeleton (`animate-pulse` + gradient) is shown while the
 *    image fetches. Once loaded, the real image cross-fades in via an
 *    `opacity` transition — smooth, not jarring.
 *
 * ─── CROSS-PLATFORM (Web + Electron) ──────────────────────────────────
 *
 * - Handles standard `http`/`https` URLs.
 * - Handles `data:` URLs (for locally uploaded images stored as data URLs).
 * - Error fallback: shows a tasteful "image unavailable" SVG icon instead
 *   of the browser's broken-image icon. The `onError` callback is still
 *   fired so callers can do their own fallback (e.g. swap to a dummy SKU).
 *
 * ─── USAGE ────────────────────────────────────────────────────────────
 *
 *   // Default (lazy, low priority) — for product list items:
 *   <OptimizedImage
 *     src={resolveProductImage(product)}
 *     alt={product.name}
 *     width={400}
 *     height={500}
 *     wrapperClassName="absolute inset-0 h-full w-full"
 *     imgClassName="object-cover group-hover:scale-105"
 *   />
 *
 *   // Priority (eager, high priority) — for the hero/first product:
 *   <OptimizedImage
 *     src={heroImageUrl}
 *     alt="Featured product"
 *     width={800}
 *     height={1000}
 *     priority
 *     wrapperClassName="w-full aspect-[4/5]"
 *     imgClassName="object-cover"
 *   />
 */
export interface OptimizedImageProps {
  /** The image source URL (http/https/data:). */
  src: string;
  /** Alt text for accessibility. */
  alt: string;
  /** Intrinsic width in pixels — used to reserve layout space (CLS). */
  width: number;
  /** Intrinsic height in pixels — used to reserve layout space (CLS). */
  height: number;
  /**
   * If true, set `loading="eager"` + `fetchPriority="high"` (above-the-fold /
   * hero images). If false (default), set `loading="lazy"` +
   * `fetchPriority="low"`.
   */
  priority?: boolean;
  /** className for the OUTER wrapper div (controls sizing/positioning). */
  wrapperClassName?: string;
  /** className for the INNER <img> (controls object-fit, hover effects). */
  imgClassName?: string;
  /** Called when the image fails to load. Caller can swap to a fallback src. */
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  priority = false,
  wrapperClassName,
  imgClassName,
  onError,
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Reset state when src changes (e.g. product card re-used for a new product).
  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [src]);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      setErrored(true);
      onError?.(e);
    },
    [onError],
  );

  // The aspect-ratio is derived from the width/height props so the wrapper
  // reserves the correct layout slot BEFORE the image loads. This is the
  // primary CLS defence.
  const aspectRatio = `${width} / ${height}`;

  return (
    <div
      className={cn("relative overflow-hidden", wrapperClassName)}
      style={{ aspectRatio }}
    >
      {/* Skeleton placeholder — shimmer while the image fetches. Identical
          sizing to the img (absolute inset-0) so no layout shift on load. */}
      {!loaded && !errored && (
        <div
          className="absolute inset-0 bg-gradient-to-br from-muted via-muted/70 to-muted animate-pulse"
          aria-hidden="true"
        />
      )}

      {/* Error fallback — tasteful SVG icon instead of the browser's
          broken-image icon. */}
      {errored && (
        <div
          className="absolute inset-0 grid place-items-center bg-muted text-muted-foreground"
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

      {/* The actual image. Hidden (opacity 0) until loaded, then cross-faded
          in via the opacity transition. */}
      {!errored && (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? "eager" : "lazy"}
          // @ts-expect-error — fetchPriority is a valid HTML attribute but
          // TypeScript's React types don't include it yet (as of React 19).
          fetchpriority={priority ? "high" : "low"}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            "transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      )}
    </div>
  );
}
