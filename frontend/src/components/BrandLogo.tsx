import { useAuthStore } from "@/lib/store";
import { FALLBACK_BRAND } from "@/lib/constants";
import { resolveAssetUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * BrandLogo — the SINGLE SOURCE OF TRUTH for the logo across the entire app.
 * Issue 3 fix.
 *
 * Reads the logo URL from the Zustand store (`brand.customLogoUrl ?? brand.logoUrl`).
 * If no logo is set, renders a tasteful monogram badge derived from the brand
 * name initials. Every component that needs to show the logo — BrandHeader,
 * HomePage banner, BrandedLoader, Settings preview, etc. — MUST use this
 * component instead of inline `<img>` tags. This guarantees the logo is
 * consistent everywhere and changes instantly when the manager uploads a new
 * logo in Settings.
 *
 * Variants:
 *   - `size="sm"`  — 28px (compact headers, inline badges)
 *   - `size="md"`  — 36px (default, most headers)
 *   - `size="lg"`  — 48px (settings preview, large loaders)
 *   - `size="xl"`  — 80px (full-screen boot loader)
 *
 * The `className` prop is applied to the outer element so callers can add
 * margins, shadows, etc.
 */
export interface BrandLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Extra className on the <img> / monogram element itself. */
  imgClassName?: string;
}

const SIZE_MAP = {
  sm: { px: 28, text: "text-xs" },
  md: { px: 36, text: "text-sm" },
  lg: { px: 48, text: "text-base" },
  xl: { px: 80, text: "text-2xl" },
};

export function BrandLogo({ size = "md", className, imgClassName }: BrandLogoProps) {
  const brand = useAuthStore((s) => s.brand);
  const logoUrl = resolveAssetUrl(brand?.customLogoUrl) ?? resolveAssetUrl(brand?.logoUrl) ?? resolveAssetUrl(FALLBACK_BRAND.logoUrl);
  const brandName = brand?.customName || brand?.name || FALLBACK_BRAND.name;
  const { px, text } = SIZE_MAP[size];

  // Monogram fallback — first letter of the first two words.
  const initials = brandName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${brandName} logo`}
        width={px}
        height={px}
        className={cn("rounded-full object-cover", className, imgClassName)}
        style={{ width: px, height: px }}
        onError={(e) => {
          // If the logo fails to load, hide the img so the monogram
          // fallback (rendered by the parent) can show instead.
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground grid place-items-center font-display font-medium shrink-0",
        text,
        className,
        imgClassName,
      )}
      style={{ width: px, height: px }}
      aria-label={`${brandName} logo`}
    >
      {initials || "AN"}
    </div>
  );
}
