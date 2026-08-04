import { useCallback, useMemo } from "react";
import { AlertCircle, Check, Palette, RotateCcw, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { ThemeSettings } from "@/types";

interface ColorPreset { id: string; name: string; theme: Pick<ThemeSettings, "primaryColor" | "accentColor" | "backgroundColor">; }
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
const FONT_FAMILY_OPTIONS = [{ value: "serif", label: "Serif (Georgia)" }, { value: "sans-serif", label: "Sans-serif (Inter)" }, { value: "monospace", label: "Monospace (Monaco)" }] as const;
const FONT_SIZE_OPTIONS = [{ value: "xs", label: "Extra small · 12px" }, { value: "sm", label: "Small · 14px" }, { value: "base", label: "Base · 16px" }, { value: "lg", label: "Large · 18px" }, { value: "xl", label: "Extra large · 20px" }, { value: "2xl", label: "2X large · 24px" }] as const;
const DEFAULT_THEME: ThemeSettings = { primaryColor: "#7c2d4a", accentColor: "#c9a55c", backgroundColor: "#faf8f5", fontFamily: "serif", baseFontSize: "base" };

export interface ThemeSectionProps {
  draftTheme: ThemeSettings;
  patchDraftTheme: (partial: Partial<ThemeSettings>) => void;
}

export function ThemeSection({ draftTheme, patchDraftTheme }: ThemeSectionProps) {
  const { toast } = useToast();
  const patch = useCallback((partial: Partial<ThemeSettings>) => { patchDraftTheme({ ...draftTheme, ...partial }); }, [draftTheme, patchDraftTheme]);
  const activePreset = useMemo(() => COLOR_PRESETS.find((p) => p.theme.primaryColor.toLowerCase() === draftTheme.primaryColor.toLowerCase() && p.theme.accentColor.toLowerCase() === draftTheme.accentColor.toLowerCase() && p.theme.backgroundColor.toLowerCase() === draftTheme.backgroundColor.toLowerCase()), [draftTheme]);
  const isDefault = draftTheme.primaryColor === DEFAULT_THEME.primaryColor && draftTheme.accentColor === DEFAULT_THEME.accentColor && draftTheme.backgroundColor === DEFAULT_THEME.backgroundColor && draftTheme.fontFamily === DEFAULT_THEME.fontFamily && draftTheme.baseFontSize === DEFAULT_THEME.baseFontSize;

  const applyPreset = (preset: ColorPreset) => { patch(preset.theme); toast({ title: `${preset.name} selected`, description: "Click Save to apply." }); };
  const handleReset = () => { patchDraftTheme({ ...DEFAULT_THEME }); toast({ title: "Theme reset preview", description: "Click Save to apply." }); };

  return (
    <div className="space-y-6 pt-2">
      <div className="space-y-2">
        <Label>Live preview</Label>
        <div className="relative w-full rounded-xl overflow-hidden border border-border/60" style={{ backgroundColor: draftTheme.backgroundColor }}>
          <div className="p-5 sm:p-6 flex flex-col gap-3">
            <div className="flex items-center gap-2"><Palette className="h-4 w-4" style={{ color: draftTheme.accentColor }} /><span className="font-display text-sm uppercase tracking-widest" style={{ color: draftTheme.primaryColor }}>Atelier Nova</span></div>
            <h3 className="font-display text-2xl sm:text-3xl" style={{ color: draftTheme.primaryColor, fontFamily: resolveFontFamily(draftTheme.fontFamily) }}>Try then buy</h3>
            <p className="text-sm text-muted-foreground">Preview reflects your selected colours + font.</p>
            <div className="flex gap-2 pt-1"><button type="button" className="h-9 px-4 rounded-xl text-sm font-medium" style={{ backgroundColor: draftTheme.primaryColor, color: "#fff" }}>Primary</button><button type="button" className="h-9 px-4 rounded-xl text-sm font-medium" style={{ backgroundColor: draftTheme.accentColor, color: "#1a1a1a" }}>Accent</button></div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Boutique colour themes</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {COLOR_PRESETS.map((preset) => {
            const isActive = activePreset?.id === preset.id;
            return <button key={preset.id} type="button" onClick={() => applyPreset(preset)} className={`relative rounded-xl border p-2 flex flex-col gap-1.5 transition ${isActive ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"}`}><div className="flex gap-1 h-6"><span className="flex-1 rounded" style={{ backgroundColor: preset.theme.primaryColor }} /><span className="flex-1 rounded" style={{ backgroundColor: preset.theme.accentColor }} /><span className="flex-1 rounded border border-border/60" style={{ backgroundColor: preset.theme.backgroundColor }} /></div><span className="text-[10px] text-muted-foreground truncate text-center">{preset.name}</span>{isActive && <Check className="absolute top-1 right-1 h-3.5 w-3.5 text-primary" />}</button>;
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ColorField label="Primary" value={draftTheme.primaryColor} onChange={(v) => patch({ primaryColor: v })} />
        <ColorField label="Accent" value={draftTheme.accentColor} onChange={(v) => patch({ accentColor: v })} />
        <ColorField label="Background" value={draftTheme.backgroundColor} onChange={(v) => patch({ backgroundColor: v })} />
      </div>
      <div className="space-y-2"><Label className="flex items-center gap-1.5"><Type className="h-3.5 w-3.5" /> Font family</Label><Select value={draftTheme.fontFamily} onValueChange={(v) => patch({ fontFamily: v })}><SelectTrigger className="h-10"><SelectValue placeholder="Select font family" /></SelectTrigger><SelectContent>{FONT_FAMILY_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Base font size</Label><Select value={draftTheme.baseFontSize} onValueChange={(v) => patch({ baseFontSize: v })}><SelectTrigger className="h-10"><SelectValue placeholder="Select base font size" /></SelectTrigger><SelectContent>{FONT_SIZE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>Hex colours must be 7 characters (<code className="font-mono">#RRGGBB</code>).</span></div>
      {!isDefault && <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2 text-xs"><RotateCcw className="h-3.5 w-3.5" /> Reset theme to defaults</Button>}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><div className="flex items-center gap-2"><input type="color" value={normalizeHex(value)} onChange={(e) => onChange(e.target.value)} className="h-10 w-10 shrink-0 rounded-lg border border-border bg-card cursor-pointer p-1" /><Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs uppercase" placeholder="#000000" maxLength={7} /></div><div className="h-6 rounded-md border border-border/60" style={{ backgroundColor: value }} aria-hidden /></div>;
}
function normalizeHex(v: string): string { if (/^#[0-9a-fA-F]{6}$/.test(v)) return v; if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`; return "#000000"; }
function resolveFontFamily(id: ThemeSettings["fontFamily"]): string { switch (id) { case "sans-serif": return "Inter, sans-serif"; case "monospace": return "Monaco, monospace"; default: return "Georgia, serif"; } }
