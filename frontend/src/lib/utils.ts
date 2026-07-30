import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Product } from "@/types";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(price);
}

export function formatBytes(kb: number): string {
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function searchProducts(products: Product[], query: string): Product[] {
  // Defensive: tolerate non-array inputs (bad server payload, stale store)
  // so the page never crashes with "products.filter is not a function".
  if (!Array.isArray(products)) return [];
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter(
    (p) =>
      p?.name?.toLowerCase().includes(q) ||
      p?.sku?.toLowerCase().includes(q) ||
      p?.code?.toLowerCase().includes(q) ||
      p?.description?.toLowerCase().includes(q) ||
      p?.category?.toLowerCase().includes(q),
  );
}

export function getNewArrivals(products: Product[]): Product[] {
  if (!Array.isArray(products)) return [];
  return products.filter((p) => p?.isNew);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function dataUrlSizeKb(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length * 3) / 4 - padding / 1024;
}

/**
 * Dummy garment image pool — stable Unsplash photos of fashion garments.
 * Used as fallback when a product's imageUrl / garmentOverlayUrl is empty or
 * fails to load, so the UI never shows a broken-image or empty-src warning.
 *
 * Images are chosen deterministically by hashing the product SKU so each
 * product always maps to the same photo (no flicker on re-render).
 *
 * These URLs use the `images.unsplash.com/photo-<id>` format with stable
 * photo IDs that have been live for years.
 */
const DUMMY_GARMENT_IMAGES: string[] = [
  "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1551232864-3f0890e580d9?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1572804013427-4d7ca7268217?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1622495966524-6c3f8a0aa8a0?auto=format&fit=crop&w=800&q=80",
];

/**
 * Local SVG placeholder — used as the ultimate fallback when ALL image URLs
 * fail (network down, Unsplash blocked, etc.). Inline data URL so it works
 * offline with no external request.
 */
const PLACEHOLDER_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#f5f0e6"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Georgia,serif" font-size="24" fill="#9a8c7a">Garment</text></svg>',
)}`;

/** Hash a string → stable index. Same input always yields same output. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Resolve a product's display image URL.
 *
 * - If the product has a non-empty `imageUrl`, use it.
 * - Otherwise, fall back to a deterministic dummy garment photo (based on the
 *   SKU so each product always gets the same image).
 *
 * Never returns an empty string — prevents the browser warning
 * "An empty string was passed to the src attribute".
 */
export function resolveProductImage(product: { imageUrl?: string; sku?: string }): string {
  const url = product?.imageUrl;
  if (typeof url === "string" && url.trim() !== "") return url;
  const key = product?.sku || "default";
  return DUMMY_GARMENT_IMAGES[hashStr(key) % DUMMY_GARMENT_IMAGES.length];
}

/**
 * Resolve a brand asset URL (logo / cover banner).
 * Returns null when the value is empty so the caller can render a fallback
 * element instead of an <img src="">.
 */
export function resolveAssetUrl(url: string | undefined | null): string | null {
  if (typeof url === "string" && url.trim() !== "") return url;
  return null;
}

/**
 * Get the local SVG placeholder (for use as an <img src> when all else fails).
 */
export function getPlaceholderImage(): string {
  return PLACEHOLDER_SVG;
}

/**
 * onError handler for <img> elements — swaps the failed src to a dummy garment
 * photo (deterministic by SKU), then to a local SVG placeholder if that also
 * fails. Prevents broken-image icons.
 *
 * Usage: `<img src={resolveProductImage(product)} onError={(e) => onImageError(e, product.sku)} />`
 */
export function onImageError(e: React.SyntheticEvent<HTMLImageElement>, sku?: string): void {
  const img = e.currentTarget;
  const failed = img.src;
  // If the failed src is already the placeholder, stop (prevent infinite loop).
  if (failed === PLACEHOLDER_SVG) return;
  // If the failed src was a dummy garment, fall back to the local SVG.
  if (failed.includes("images.unsplash.com")) {
    img.src = PLACEHOLDER_SVG;
    return;
  }
  // Otherwise try a dummy garment first (deterministic by SKU).
  const key = sku || "default";
  img.src = DUMMY_GARMENT_IMAGES[hashStr(key) % DUMMY_GARMENT_IMAGES.length];
}
