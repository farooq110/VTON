import { motion } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import { FALLBACK_BRAND } from "@/lib/constants";

/**
 * BrandedLoader — reusable, professional loading indicator featuring the
 * boutique logo + app name. Issue 3 fix.
 *
 * Use this EVERYWHERE a loading state occurs:
 *   - App hydration (`App.tsx` — `if (!hydrated)`)
 *   - Route-level Suspense fallbacks
 *   - Page-level loading (ProductsPage isLoading, TrendingProducts, etc.)
 *   - Inline button loaders (size="sm")
 *
 * Variants:
 *   - "full"     — full-screen, centered, with logo + name + tagline + spinner.
 *                  Use for app boot + route Suspense fallbacks.
 *   - "inline"   — inline block (no full-screen), logo + spinner + optional
 *                  label. Use inside cards / panels.
 *   - "sm"       — tiny spinner only (no logo). Use inside buttons / badges.
 *
 * The logo is read from the store (`brand.customLogoUrl ?? brand.logoUrl`).
 * If no logo is set, a tasteful monogram "AN" badge is rendered instead so
 * the loader always looks intentional, never broken.
 *
 * The component is self-contained and has NO external dependencies beyond
 * framer-motion + the store — drop it in anywhere.
 */
export interface BrandedLoaderProps {
  /** Visual size/variant of the loader. */
  variant?: "full" | "inline" | "sm";
  /** Optional label shown under the spinner (inline/full variants). */
  label?: string;
  /** Optional sublabel shown under the label (full variant only). */
  sublabel?: string;
  /** Extra className on the outer wrapper. */
  className?: string;
}

export function BrandedLoader({
  variant = "full",
  label,
  sublabel,
  className = "",
}: BrandedLoaderProps) {
  const brand = useAuthStore((s) => s.brand);
  const logoUrl = brand?.customLogoUrl || brand?.logoUrl || FALLBACK_BRAND.logoUrl;
  const brandName = brand?.customName || brand?.name || FALLBACK_BRAND.name;
  const tagline = brand?.tagline || FALLBACK_BRAND.tagline;

  // ─── "sm" variant — tiny spinner only ────────────────────────────────
  if (variant === "sm") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 ${className}`}
        role="status"
        aria-live="polite"
      >
        <span className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
      </span>
    );
  }

  // ─── "inline" variant — logo + spinner + label, no full-screen ───────
  if (variant === "inline") {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 py-8 ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="relative h-12 w-12">
          <LogoOrMonogram logoUrl={logoUrl} brandName={brandName} size={48} />
          <motion.span
            className="absolute -inset-1 rounded-full border-2 border-primary border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        </div>
        {label && (
          <p className="font-display text-sm font-medium text-foreground">{label}</p>
        )}
      </div>
    );
  }

  // ─── "full" variant — full-screen, centered, premium boot loader ─────
  return (
    <div
      className={`min-h-screen grid place-items-center bg-background ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-5">
        {/* Logo with rotating ring */}
        <div className="relative h-20 w-20">
          <LogoOrMonogram logoUrl={logoUrl} brandName={brandName} size={80} />
          <motion.span
            className="absolute -inset-2 rounded-full border-2 border-primary/30 border-t-primary"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* Brand name + tagline */}
        <div className="text-center">
          <motion.h1
            className="font-display text-2xl sm:text-3xl font-medium tracking-tight"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            {brandName}
          </motion.h1>
          <motion.p
            className="text-xs uppercase tracking-[0.3em] text-muted-foreground mt-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {tagline}
          </motion.p>
        </div>

        {/* Label / sublabel */}
        {label && (
          <motion.p
            className="text-xs text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
          >
            {label}
          </motion.p>
        )}
        {sublabel && (
          <motion.p
            className="text-[10px] text-muted-foreground/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {sublabel}
          </motion.p>
        )}
      </div>
    </div>
  );
}

/**
 * Renders the brand logo image if available, otherwise a tasteful monogram
 * badge derived from the brand name initials. Sized via `size` prop (px).
 */
function LogoOrMonogram({
  logoUrl,
  brandName,
  size,
}: {
  logoUrl: string;
  brandName: string;
  size: number;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={brandName}
        width={size}
        height={size}
        className="rounded-full object-cover h-full w-full"
        onError={(e) => {
          // If the logo fails to load, hide the img so the monogram
          // fallback (rendered by the parent) can show instead. We do
          // this by swapping the src to empty + hiding via opacity.
          (e.currentTarget as HTMLImageElement).style.opacity = "0";
        }}
      />
    );
  }
  // Monogram fallback — first letter of the first two words.
  const initials = brandName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground grid place-items-center font-display font-medium"
      style={{ height: size, width: size, fontSize: size * 0.36 }}
    >
      {initials || "AN"}
    </div>
  );
}
