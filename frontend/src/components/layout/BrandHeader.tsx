import { useBrand } from "@/hooks/useProducts";
import { resolveAssetUrl } from "@/lib/utils";

/** Compact brand lockup — logo + wordmark. Reused on every authed screen header. */
export function BrandHeader({ compact = false }: { compact?: boolean }) {
  const { data: brand } = useBrand();
  const logoUrl = resolveAssetUrl(brand?.logoUrl);
  return (
    <div className="flex items-center gap-3">
      {logoUrl ? (
        <img src={logoUrl} alt={`${brand?.name ?? "Brand"} logo`} className={compact ? "h-7" : "h-9"} />
      ) : (
        <div className={`rounded-full bg-primary text-primary-foreground grid place-items-center font-display italic ${compact ? "h-7 w-7 text-sm" : "h-9 w-9 text-base"}`}>
          N
        </div>
      )}
      <span className="font-display text-xl">{brand?.name ?? "Atelier Nova"}</span>
    </div>
  );
}
