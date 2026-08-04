import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * ProductImage — graceful image loader with skeleton placeholder.
 *
 * Issue 2 fix — the wrapper div now accepts a `wrapperClassName` prop so
 * the caller can control its sizing (e.g. `h-full w-full` to fill a
 * parent with `aspect-[4/5]`). Without this, the wrapper had no explicit
 * dimensions and could collapse to 0×0, hiding the image.
 *
 * Issue 2 fix (cached images) — check `img.complete` on mount via a ref.
 * If the image is already cached, the `onLoad` event may NOT fire (React
 * doesn't fire onLoad for cached images in some cases). This caused images
 * to stay invisible (opacity-0) on first visit until a refresh.
 */
export interface ProductImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> {
  src: string;
  alt: string;
  /** Called when the image fails to load. */
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
  /** className for the OUTER wrapper div (controls sizing/positioning). */
  wrapperClassName?: string;
}

export function ProductImage({
  src,
  alt,
  onError,
  className,
  wrapperClassName,
  loading = "lazy",
  ...rest
}: ProductImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [src]);

  // Issue 2 fix — check if the image is already cached + complete.
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <div className={cn("relative overflow-hidden", wrapperClassName)}>
      {!loaded && !errored && (
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-br from-muted via-muted/70 to-muted animate-pulse",
            className,
          )}
          aria-hidden="true"
        />
      )}

      {errored && (
        <div
          className={cn(
            "absolute inset-0 grid place-items-center bg-muted text-muted-foreground",
            className,
          )}
          aria-hidden="true"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 3.75h16.5a1.5 1.5 0 011.5 1.5v13.5a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5V5.25a1.5 1.5 0 011.5-1.5zm10.5 6a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm-3 3a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
        </div>
      )}

      {!errored && (
        <img
          ref={imgRef}
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
