import { useCallback, useMemo } from "react";
import {
  AlertCircle,
  Check,
  Palette,
  RotateCcw,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { ThemeSettings } from "@/types";

/**
 * ThemeSection — boutique-appearance customization panel.
 *
 * Issue 2 fix — ThemeSection now receives `draftTheme` + `patchDraftTheme`
 * as props instead of reading from the store directly. This means theme
 * changes update the DRAFT (not the store), so they DON'T apply
 * immediately. The parent SettingsPage commits the draft to the store
 * (which triggers ThemeApplier) only when the user clicks the header
 * Save button.
 *
 * Surface for the `settings.theme` block: primary / accent / background
 * colors, font family, and base font size. Each change is written to the
 * draft via `patchDraftTheme` so the parent can track dirty state.
 *
 * Includes:
 *   - 10 curated boutique color presets (one-tap full recolor)
 *   - 3 color pickers (primary / accent / background) with hex input
 *   - Font family select (serif / sans-serif / monospace)
 *   - 6 font size select (xs … 2xl)
 *   - Live preview block (reflects DRAFT, not the applied theme)
 *   - Reset to defaults button (resets the DRAFT only, not the store)
 */
interface ColorPreset {
  id: string;
  name: string;
  theme: Pick<ThemeSettings, "primaryColor" | "accentColor" | "backgroundColor">;
}

const COLOR_PRESETS: ColorPreset[] = [
  { id: "plum", name: "Plum Boutique", theme: { primaryColor: "#7c2d4a", accentColor: "#c9a55c", backgroundColor: "#faf8f5" } },
  { id: "noir", name: "Noir Chic", theme: { primaryColor: "#1f2937", accentColor: "#d4af37", backgroundColor: "#f9f9f9" } },
  { id: "rose", name: "Rose Couture", theme: { primaryColor: "#be185d", accentColor: "#9ca3af", backgroundColor: "#fff5f7" } },
  { id: "emerald", name: "Emerald Atelier", theme: { primaryColor: "#065f46", accentColor: "#b45309", backgroundColor: "#f5f7f3" } },
  { id: "indigo", name: "Royal Indigo", theme: { primaryColor: "#312e81", accentColor: "#c0a062", backgroundColor: "#f7f7fb" } },
  { id: "terracotta", name: "Terracotta", theme: { primaryColor: "#9a3412", accentColor: "#78716c", backgroundColor: "#fdf6f0" } },
  { id: "lavender", name: "Lavender Muse", theme: { primaryColor: "#5b21b6", accentColor: "#db2777", backgroundColor: "#faf7ff" } },
  { id: "coral", name: "Coral Reef", theme: { primaryColor: "#e11d48", accentColor: "#0ea5e9", backgroundColor: "#fff8f5" } },
  { id: "forest", name: "Forest Sage", theme: { primaryColor: "#166534", accentColor: "#a16207", backgroundColor: "#f4f7f2" } },
  { id: "champagne", name: "Champagne Gold", theme: { primaryColor: "#92400e", accentColor: "#d4af37", backgroundColor: "#fbf8f1" } },
];

const FONT_FAMILY_OPTIONS: { value: ThemeSettings["fontFamily"]; label: string }[] = [
  { value: "serif", label: "Serif (Georgia)" },
  { value: "sans-serif", label: "Sans-serif (Inter)" },
  { value: "monospace", label: "Monospace (Monaco)" },
];

const FONT_SIZE_OPTIONS: { value: ThemeSettings["baseFontSize"]; label: string }[] = [
  { value: "xs", label: "Extra small · 12px" },
  { value: "sm", label: "Small · 14px" },
  { value: "base", label: "Base · 16px" },
  { value: "lg", label: "Large · 18px" },
  { value: "xl", label: "Extra large · 20px" },
  { value: "2xl", label: "2X large · 24px" },
];

const DEFAULT_THEME: ThemeSettings = {
  primaryColor: "#7c2d4a",
  accentColor: "#c9a55c",
  backgroundColor: "#faf8f5",
  fontFamily: "serif",
  baseFontSize: "base",
};

export interface ThemeSectionProps {
  /** The DRAFT theme (pending changes, not yet committed to the store). */
  draftTheme: ThemeSettings;
  /** Update the DRAFT theme. Does NOT apply to the store until Save. */
  patchDraftTheme: (partial: Partial<ThemeSettings>) => void;
}

export function ThemeSection({ draftTheme, patchDraftTheme }: ThemeSectionProps) {
  const { toast } = useToast();

  const patch = useCallback(
    (partial: Partial<ThemeSettings>) => {
      patchDraftTheme({ ...draftTheme, ...partial });
    },
    [draftTheme, patchDraftTheme],
  );

  const activePreset = useMemo(
    () =>
      COLOR_PRESETS.find(
        (p) =>
          p.theme.primaryColor.toLowerCase() === draftTheme.primaryColor.toLowerCase() &&
          p.theme.accentColor.toLowerCase() === draftTheme.accentColor.toLowerCase() &&
          p.theme.backgroundColor.toLowerCase() === draftTheme.backgroundColor.toLowerCase(),
      ),
    [draftTheme],
  );

  const isDefault =
    draftTheme.primaryColor === DEFAULT_THEME.primaryColor &&
    draftTheme.accentColor === DEFAULT_THEME.accentColor &&
    draftTheme.backgroundColor === DEFAULT_THEME.backgroundColor &&
    draftTheme.fontFamily === DEFAULT_THEME.fontFamily &&
    draftTheme.baseFontSize === DEFAULT_THEME.baseFontSize;

  const applyPreset = (preset: ColorPreset) => {
    // Issue 2 fix — patch the DRAFT, don't call updateSettings. The theme
    // is NOT applied immediately; it's only applied when the user clicks
    // the header Save button (which commits the draft to the store).
    patch(preset.theme);
    toast({ title: `${preset.name} selected`, description: "Click Save to apply." });
  };

  const handleReset = () => {
    // Issue 2 fix — reset the DRAFT only (not the store). The user still
    // needs to click Save to commit the reset.
    patchDraftTheme({ ...DEFAULT_THEME });
    toast({ title: "Theme reset to defaults", description: "Click Save to apply." });
  };

  return (
    <div className="space-y-6 pt-2">
      {/* ─── Live preview ──────────────────────────────────────── */}
      <div className="space-y-2">
        <Label>Live preview</Label>
        <div
          className="relative w-full rounded-xl overflow-hidden border border-border/60"
          style={{ backgroundColor: draftTheme.backgroundColor }}
        >
          <div className="p-5 sm:p-6 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4" style={{ color: draftTheme.accentColor }} />
              <span className="font-display text-sm uppercase tracking-widest" style={{ color: draftTheme.primaryColor }}>
                Atelier Nova
              </span>
            </div>
            <h3
              className="font-display text-2xl sm:text-3xl"
              style={{ color: draftTheme.primaryColor, fontFamily: resolveFontFamily(draftTheme.fontFamily) }}
            >
              Try then buy
            </h3>
            <p className="text-sm text-muted-foreground">
              The live preview reflects your selected primary, accent, and background colors along with the
              current font family.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="h-9 px-4 rounded-xl text-sm font-medium"
                style={{ backgroundColor: draftTheme.primaryColor, color: "#fff" }}
              >
                Primary
              </button>
              <button
                type="button"
                className="h-9 px-4 rounded-xl text-sm font-medium"
                style={{ backgroundColor: draftTheme.accentColor, color: "#1a1a1a" }}
              >
                Accent
              </button>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Colours, fonts, and base text size apply globally across the entire app.
        </p>
      </div>

      {/* ─── Color presets ─────────────────────────────────────── */}
      <div className="space-y-2">
        <Label>Boutique colour themes</Label>
        <p className="text-xs text-muted-foreground">One-tap presets — tap to apply a complete look.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {COLOR_PRESETS.map((preset) => {
            const isActive = activePreset?.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`relative rounded-xl border p-2 flex flex-col gap-1.5 transition ${
                  isActive ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"
                }`}
                aria-label={`Apply ${preset.name} preset`}
              >
                <div className="flex gap-1 h-6">
                  <span className="flex-1 rounded" style={{ backgroundColor: preset.theme.primaryColor }} />
                  <span className="flex-1 rounded" style={{ backgroundColor: preset.theme.accentColor }} />
                  <span className="flex-1 rounded border border-border/60" style={{ backgroundColor: preset.theme.backgroundColor }} />
                </div>
                <span className="text-[10px] text-muted-foreground truncate text-center">{preset.name}</span>
                {isActive && (
                  <Check className="absolute top-1 right-1 h-3.5 w-3.5 text-primary" />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Tap a preset to recolor primary, accent, and background in one go. You can fine-tune below.
        </p>
      </div>

      {/* ─── Color pickers ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ColorField
          label="Primary"
          value={draftTheme.primaryColor}
          onChange={(v) => patchDraftTheme({ primaryColor: v })}
        />
        <ColorField
          label="Accent"
          value={draftTheme.accentColor}
          onChange={(v) => patchDraftTheme({ accentColor: v })}
        />
        <ColorField
          label="Background"
          value={draftTheme.backgroundColor}
          onChange={(v) => patchDraftTheme({ backgroundColor: v })}
        />
      </div>

      {/* ─── Font family ───────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Type className="h-3.5 w-3.5" /> Font family
        </Label>
        <Select
          value={draftTheme.fontFamily}
          onValueChange={(v) => patch({ fontFamily: v })}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Select font family" />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── Base font size ────────────────────────────────────── */}
      <div className="space-y-2">
        <Label>Base font size</Label>
        <Select
          value={draftTheme.baseFontSize}
          onValueChange={(v) => patch({ baseFontSize: v })}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Select base font size" />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Sets the root font size — all relative sizes scale from this value.
        </p>
      </div>

      {/* ─── Validation note ───────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Hex colors must be 7 characters (<code className="font-mono">#RRGGBB</code>). Invalid values
          are ignored by the browser&apos;s CSS engine.
        </span>
      </div>

      {/* ─── Reset ─────────────────────────────────────────────── */}
      {!isDefault && (
        <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2 text-xs">
          <RotateCcw className="h-3.5 w-3.5" /> Reset theme to defaults
        </Button>
      )}
    </div>
  );
}

/* ─── ColorField — color picker + hex text input ──────────────────── */

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 shrink-0 rounded-lg border border-border bg-card cursor-pointer p-1"
          aria-label={`${label} color picker`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs uppercase"
          placeholder="#000000"
          maxLength={7}
        />
      </div>
      <div
        className="h-6 rounded-md border border-border/60"
        style={{ backgroundColor: value }}
        aria-hidden
      />
    </div>
  );
}

/** Ensure hex strings are usable by <input type="color"> (which needs #RRGGBB). */
function normalizeHex(v: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return "#000000";
}

/** Map a ThemeSettings font family id to a real CSS font stack. */
function resolveFontFamily(id: ThemeSettings["fontFamily"]): string {
  switch (id) {
    case "sans-serif":
      return "Inter, sans-serif";
    case "monospace":
      return "Monaco, monospace";
    case "serif":
    default:
      return "Georgia, serif";
  }
}
