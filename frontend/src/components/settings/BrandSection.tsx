import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Type,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveAssetUrl } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { Brand } from "@/types";

/**
 * BrandSection — manager-only settings panel for brand identity:
 * cover image, brand name, and logo.
 *
 * Issue 1+2 fix — BrandSection now receives `draftBrand` +
 * `patchDraftBrand` as props instead of reading from / writing to the
 * store directly. This means brand changes update the DRAFT (not the
 * store), so they DON'T apply immediately. The parent SettingsPage
 * commits the draft to the store only when the user clicks the header
 * Save button.
 *
 * Issue 1 fix — the per-field "Save" button next to the brand name has
 * been REMOVED. The user now uses the header Save button to persist all
 * changes (brand name, logo, cover) at once.
 */

export interface BrandSectionProps {
  /** The DRAFT brand (pending changes, not yet committed to the store). */
  draftBrand: Brand;
  /** Update the DRAFT brand. Does NOT apply to the store until Save. */
  patchDraftBrand: (patch: Partial<Brand>) => void;
}

export function BrandSection({ draftBrand, patchDraftBrand }: BrandSectionProps) {
  const { toast } = useToast();

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  // Issue 5 fix — sync nameValue with draftBrand when it changes externally
  // (e.g. after Reset). Previously nameValue was only initialized once and
  // never updated when draftBrand changed, so the reset didn't clear the
  // custom name in the input field.
  const [nameValue, setNameValue] = useState(draftBrand.customName ?? draftBrand.name);
  const [coverUrlValue, setCoverUrlValue] = useState("");
  const [logoUrlValue, setLogoUrlValue] = useState("");
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Issue 5 fix — sync nameValue when draftBrand changes (e.g. after Reset).
  useEffect(() => {
    setNameValue(draftBrand.customName ?? draftBrand.name);
  }, [draftBrand.customName, draftBrand.name]);

  const activeCoverUrl = resolveAssetUrl(draftBrand.customCoverBannerUrl) ?? resolveAssetUrl(draftBrand.coverBannerUrl);
  const activeLogoUrl = resolveAssetUrl(draftBrand.customLogoUrl) ?? resolveAssetUrl(draftBrand.logoUrl);
  const activeName = draftBrand.customName ?? draftBrand.name;

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
    try {
      const dataUrl = await readFileAsDataUrl(file);
      // Issue 2 fix — patch the DRAFT, don't call setBrandCoverImage.
      patchDraftBrand({ customCoverBannerUrl: dataUrl });
      toast({ title: "Cover image staged", description: "Click Save to apply." });
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
    // Issue 2 fix — patch the DRAFT, don't call setBrandCoverImage.
    patchDraftBrand({ customCoverBannerUrl: url });
    setCoverUrlValue("");
    toast({ title: "Cover image staged", description: "Click Save to apply." });
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
    try {
      const dataUrl = await readFileAsDataUrl(file);
      // Issue 2 fix — patch the DRAFT, don't call setBrandLogo.
      patchDraftBrand({ customLogoUrl: dataUrl });
      toast({ title: "Logo staged", description: "Click Save to apply." });
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
    // Issue 2 fix — patch the DRAFT, don't call setBrandLogo.
    patchDraftBrand({ customLogoUrl: url });
    setLogoUrlValue("");
    toast({ title: "Logo staged", description: "Click Save to apply." });
  };

  /* ─── Brand name ────────────────────────────────────────────── */
  // Issue 1 fix — the per-field Save button has been REMOVED. The brand
  // name input now patches the DRAFT on every keystroke; the header Save
  // button persists it. The "Reset to default" link also patches the draft.
  const handleNameChange = (value: string) => {
    setNameValue(value);
    patchDraftBrand({ customName: value.trim() || undefined });
  };

  /* ─── Reset all ─────────────────────────────────────────────── */
  const handleResetAll = () => {
    // Issue 2 fix — reset the DRAFT only (not the store). The user still
    // needs to click the header Save button to commit the reset.
    patchDraftBrand({
      customCoverBannerUrl: undefined,
      customLogoUrl: undefined,
      customName: undefined,
    });
    setNameValue(draftBrand.name);
    setCoverUrlValue("");
    setLogoUrlValue("");
    setError(null);
    toast({ title: "Brand reset to defaults", description: "Click Save to apply." });
  };

  const hasAnyCustom = !!(draftBrand.customCoverBannerUrl || draftBrand.customLogoUrl || draftBrand.customName);

  return (
    <div className="space-y-6 pt-2">
      {/* ─── Brand name — at the TOP of Brand Identity (Issue 2) ──── */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Type className="h-3.5 w-3.5" /> Brand name
        </Label>
        <Input
          value={nameValue}
          onChange={(e) => {
            handleNameChange(e.target.value);
            setError(null);
          }}
          placeholder={draftBrand.name}
          className="h-10"
          maxLength={50}
        />
        <p className="text-[11px] text-muted-foreground">
          Displayed in the header and footer. Default:{" "}
          <code className="font-mono">{draftBrand.name}</code>.
          {draftBrand.customName && (
            <button
              onClick={() => {
                patchDraftBrand({ customName: undefined });
                setNameValue(draftBrand.name);
                toast({ title: "Brand name reset", description: "Click Save to apply." });
              }}
              className="ml-2 text-accent hover:underline"
            >
              Reset to default
            </button>
          )}
        </p>
      </div>

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
