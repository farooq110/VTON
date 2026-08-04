import { useAuthStore } from "@/lib/store";
import { BrandLogo } from "@/components/BrandLogo";

/**
 * Compact brand lockup — logo + wordmark. Reused on every authed screen header.
 *
 * Issue 3 fix — reads from the Zustand store (not TanStack Query) so brand
 * changes (logo, cover, name) saved in Settings reflect immediately across
 * the app. Previously this read from `useBrand()` (a query that fetches from
 * `/api/brand`), so changes saved to the store didn't update the header
 * until the query was refetched.
 */
export function BrandHeader({ compact = false }: { compact?: boolean }) {
  const brand = useAuthStore((s) => s.brand);
  const brandName = brand?.customName || brand?.name || "Atelier Nova";
  return (
    <div className="flex items-center gap-3">
      <BrandLogo size={compact ? "sm" : "md"} />
      <span className="font-display text-xl">{brandName}</span>
    </div>
  );
}
