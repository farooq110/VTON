import { useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Type,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/store";
import { resolveAssetUrl } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

/**
 * BrandSection — manager-only settings panel for brand identity:
 * cover image, brand name, and logo.
 *
 * Ported from the Next.js preview's tryon/settings/brand-section.tsx and
 * adapted to the frontend's `useAuthStore` + `@/components/ui/toast`. The
 * preview's `useUILogger` is replaced with the store's `logActivity`
 * (which writes to the same ActivityLogPanel surface).
 *
 * Spec:
 *   - "the cover image should set by manager from settings and from server side"
 *   - "Set logo brand name from setting too control by manager"
 *   - "The manager should control app settings like cover image, brand name,
 *      logo etc"
 *
 * Each field can be set by:
 *   1. Uploading a local file (converted to a data URL for preview-only storage)
 *   2. Pasting a CDN URL (recommended for production — points at a backend-
 *      hosted asset)
 *
 * All overrides are persisted across refreshes via the store's `partialize`.
 * The home screen reads `customX ?? defaultX`.
 */
export function BrandSection() {
  const brand = useAuthStore((s) => s.brand);
  const setBrandCoverImage = useAuthStore((s) => s.setBrandCoverImage);
  const setBrandName = useAuthStore((s) => s.setBrandName);
  const setBrandLogo = useAuthStore((s) => s.setBrandLogo);
  const logActivity = useAuthStore((s) => s.logActivity);
  const { toast } = useToast();

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [nameValue, setNameValue] = useState(brand.customName ?? brand.name);
  const [coverUrlValue, setCoverUrlValue] = useState("");
  const [logoUrlValue, setLogoUrlValue] = useState("");
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCoverUrl = resolveAssetUrl(brand.customCoverBannerUrl) ?? resolveAssetUrl(brand.coverBannerUrl);
  const activeLogoUrl = resolveAssetUrl(brand.customLogoUrl) ?? resolveAssetUrl(brand.logoUrl);
  const activeName = brand.customName ?? brand.name;

  /* ─── Cover image ───────────────────────────────────────────── */
  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Cover image must be under 8 MB.");
      return;
    }
    setError(null);
    setIsUploadingCover(true);
    logActivity({
      category: "settings",
      label: "Cover image upload started",
      detail: `${file.name} · ${(file.size / 1024).toFixed(0)} KB`,
    });
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBrandCoverImage(dataUrl);
      toast({ title: "Cover image updated" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read image.");
    } finally {
      setIsUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handleCoverUrlSubmit = () => {
    const url = coverUrlValue.trim();
    if (!url) {
      setError("Please paste a cover image URL.");
      return;
    }
    try {
      new URL(url);
    } catch {
      setError("Invalid cover image URL.");
      return;
    }
    setError(null);
    logActivity({
      category: "settings",
      label: "Cover image URL set",
      detail: url.slice(0, 80),
    });
    setBrandCoverImage(url);
    setCoverUrlValue("");
    toast({ title: "Cover image updated" });
  };

  /* ─── Logo image ────────────────────────────────────────────── */
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file for the logo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be under 2 MB (use SVG or a small PNG).");
      return;
    }
    setError(null);
    setIsUploadingLogo(true);
    logActivity({
      category: "settings",
      label: "Logo upload started",
      detail: `${file.name} · ${(file.size / 1024).toFixed(0)} KB`,
    });
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBrandLogo(dataUrl);
      toast({ title: "Logo updated" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read logo.");
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleLogoUrlSubmit = () => {
    const url = logoUrlValue.trim();
    if (!url) {
      setError("Please paste a logo URL.");
      return;
    }
    try {
      new URL(url);
    } catch {
      setError("Invalid logo URL.");
      return;
    }
    setError(null);
    logActivity({
      category: "settings",
      label: "Logo URL set",
      detail: url.slice(0, 80),
    });
    setBrandLogo(url);
    setLogoUrlValue("");
    toast({ title: "Logo updated" });
  };

  /* ─── Brand name ────────────────────────────────────────────── */
  const handleNameSave = () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setError("Brand name cannot be empty.");
      return;
    }
    setError(null);
    logActivity({
      category: "settings",
      label: "Brand name set",
      detail: trimmed,
    });
    setBrandName(trimmed);
    toast({ title: "Brand name updated" });
  };

  /* ─── Reset all ─────────────────────────────────────────────── */
  const handleResetAll = () => {
    logActivity({ category: "settings", label: "Reset all brand customizations" });
    setBrandCoverImage(null);
    setBrandLogo(null);
    setBrandName(null);
    setNameValue(brand.name);
    setCoverUrlValue("");
    setLogoUrlValue("");
    setError(null);
    toast({ title: "Reverted all brand customizations to defaults" });
  };

  const hasAnyCustom = !!(brand.customCoverBannerUrl || brand.customLogoUrl || brand.customName);

  return (
    <div className="space-y-6 pt-2">
      {/* ─── Live preview ──────────────────────────────────────── */}
      <div className="space-y-2">
        <Label>Live preview</Label>
        <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden bg-muted border border-border/60">
          {activeCoverUrl && (
            <img
              src={activeCoverUrl}
              alt="Cover preview"
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2.5">
            {activeLogoUrl && (
              <img
                src={activeLogoUrl}
                alt="Logo preview"
                className="h-7 w-auto rounded bg-background/50 backdrop-blur-sm p-0.5"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span className="font-display text-base sm:text-lg font-medium text-primary-foreground truncate">
              {activeName}
            </span>
            {hasAnyCustom && (
              <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-mono text-accent-foreground">
                Customized
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Shows the current cover image, logo, and brand name as they appear on the home screen.
        </p>
      </div>

      {/* ─── Brand name ────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Type className="h-3.5 w-3.5" /> Brand name
        </Label>
        <div className="flex gap-2">
          <Input
            value={nameValue}
            onChange={(e) => {
              setNameValue(e.target.value);
              setError(null);
            }}
            placeholder={brand.name}
            className="h-10"
            maxLength={50}
          />
          <Button
            onClick={handleNameSave}
            disabled={!nameValue.trim() || nameValue.trim() === (brand.customName ?? brand.name)}
            className="h-10 gap-2 shrink-0"
          >
            <Check className="h-4 w-4" /> Save
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Displayed in the header and footer. Default:{" "}
          <code className="font-mono">{brand.name}</code>.
          {brand.customName && (
            <button
              onClick={() => {
                setBrandName(null);
                setNameValue(brand.name);
                toast({ title: "Brand name reset" });
              }}
              className="ml-2 text-accent hover:underline"
            >
              Reset to default
            </button>
          )}
        </p>
      </div>

      {/* ─── Cover image ───────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" /> Cover image
        </Label>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={handleCoverFileChange}
          className="hidden"
        />
        <Button
          variant="outline"
          onClick={() => coverInputRef.current?.click()}
          disabled={isUploadingCover}
          className="w-full h-11 gap-2 border-dashed"
        >
          {isUploadingCover ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Reading cover…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Upload cover image
            </>
          )}
        </Button>
        <div className="flex gap-2">
          <Input
            value={coverUrlValue}
            onChange={(e) => {
              setCoverUrlValue(e.target.value);
              setError(null);
            }}
            placeholder="https://cdn.your-brand.com/cover.jpg"
            className="h-10 text-xs font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCoverUrlSubmit();
            }}
          />
          <Button
            onClick={handleCoverUrlSubmit}
            disabled={!coverUrlValue.trim()}
            className="h-10 gap-2 shrink-0"
            size="sm"
          >
            Set
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Recommended aspect ratio: 16:9 or 2.8:1. Max 8 MB.
        </p>
      </div>

      {/* ─── Logo image ────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" /> Logo image
        </Label>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted border border-border/60 grid place-items-center shrink-0">
            {activeLogoUrl ? (
              <img src={activeLogoUrl} alt="Logo preview" className="h-full w-full object-contain p-1" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/svg+xml,image/png,image/webp,image/jpeg"
            onChange={handleLogoFileChange}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => logoInputRef.current?.click()}
            disabled={isUploadingLogo}
            className="h-11 gap-2 border-dashed flex-1"
          >
            {isUploadingLogo ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Reading logo…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Upload logo
              </>
            )}
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            value={logoUrlValue}
            onChange={(e) => {
              setLogoUrlValue(e.target.value);
              setError(null);
            }}
            placeholder="https://cdn.your-brand.com/logo.svg"
            className="h-10 text-xs font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogoUrlSubmit();
            }}
          />
          <Button
            onClick={handleLogoUrlSubmit}
            disabled={!logoUrlValue.trim()}
            className="h-10 gap-2 shrink-0"
            size="sm"
          >
            Set
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          SVG or PNG with transparent background. Max 2 MB.
        </p>
      </div>

      {/* ─── Error ─────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── Reset all ─────────────────────────────────────────── */}
      {hasAnyCustom && (
        <Button variant="ghost" size="sm" onClick={handleResetAll} className="gap-2 text-xs">
          <RotateCcw className="h-3.5 w-3.5" /> Reset all to brand defaults
        </Button>
      )}
    </div>
  );
}

/** Read a File as a data URL — Promise wrapper around FileReader. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}
