import { useNavigate } from "react-router-dom";
import { AlertCircle, Palette, RotateCcw, Save, Scan, Shield, Target, Image as ImageIcon } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { DETECTION_MODELS } from "@/lib/constants";
import { canManageBrand, canManageFeatures, ROLE_LABELS } from "@/types";
import type { DetectionModelId, ImageCompressionSettings, PoseThresholds } from "@/types";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { BrandSection } from "@/components/settings/BrandSection";
import { ThemeSection } from "@/components/settings/ThemeSection";
import { Button } from "@/components/ui/button";

export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSettings, resetSettings, user } = useAuthStore();
  const userRole = user?.role;

  const canBrand = canManageBrand(userRole);
  const canFeatures = canManageFeatures(userRole);

  const setThresholds = (patch: Partial<PoseThresholds>) =>
    updateSettings({ poseThresholds: { ...settings.poseThresholds, ...patch } });
  const setCompression = (patch: Partial<ImageCompressionSettings>) =>
    updateSettings({ compression: { ...settings.compression, ...patch } });

  const roleLabel = userRole ? ROLE_LABELS[userRole] : "";
  const subtitle = canBrand && canFeatures
    ? `Full access · ${roleLabel}`
    : canBrand
      ? `Brand settings · ${roleLabel}`
      : canFeatures
        ? `Feature settings · ${roleLabel}`
        : "View only";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalHeader
        title="Settings"
        subtitle={subtitle}
        backTo="/home"
        rightSlot={
          <>
            {canFeatures && (
              <Button variant="outline" size="sm" onClick={() => { resetSettings(); }} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Reset
              </Button>
            )}
            <Button size="sm" onClick={() => navigate("/home")} className="gap-2">
              <Save className="h-4 w-4" /> Save
            </Button>
          </>
        }
      />

      <main className="flex-1 px-3 sm:px-6 lg:px-10 py-6 max-w-4xl mx-auto w-full">
        <div className="space-y-4">
          {/* Brand identity — manager-only */}
          {canBrand && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Brand identity</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Upload your boutique&apos;s cover image, set the brand name, and add a logo. These appear on the home screen banner that customers see first.
                  </p>
                </div>
              </div>
              <BrandSection />
            </section>
          )}

          {/* Theme — manager-only (same RBAC gate as brand identity) */}
          {canBrand && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Theme</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Pick a colour scheme, font, and base text size. Changes apply instantly across the entire app — no refresh needed.
                  </p>
                </div>
              </div>
              <ThemeSection />
            </section>
          )}

          {/* Detection model */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6">
              <div className="flex items-center gap-2 mb-3">
                <Scan className="h-5 w-5 text-accent" />
                <h2 className="font-display text-lg">Detection model</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                Choose the AI model that detects the person and checks their pose. The recommended option (YOLOv8n) is fastest and works well on tablets and kiosks.
              </p>
              <div className="space-y-2">
                {DETECTION_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => updateSettings({ activeModelId: m.id as DetectionModelId })}
                    className={`w-full text-left rounded-xl border p-4 ${settings.activeModelId === m.id ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-display text-sm font-medium">{m.name} {m.recommended && <span className="text-accent text-[10px]">Recommended</span>}</p>
                        <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                        <p className="text-[11px] text-muted-foreground mt-2 font-mono">{m.sizeMb} MB · ~{m.speedMs}ms · {m.accuracy}</p>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${settings.activeModelId === m.id ? "border-primary bg-primary" : "border-border"}`} />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Posture thresholds */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Posture thresholds</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Control how strict the pose check is. Lower values = more lenient (accepts tilted shoulders, turned heads). Higher values = stricter (requires near-perfect posture).
                  </p>
                </div>
              </div>
              <NumberField label="Person confidence (0–1)" value={settings.poseThresholds.personScore} step={0.05} min={0.3} max={0.95} onChange={(v) => setThresholds({ personScore: v })} />
              <NumberField label="Shoulder tilt (deg)" value={settings.poseThresholds.shoulderTiltDeg} step={1} min={0} max={30} onChange={(v) => setThresholds({ shoulderTiltDeg: v })} />
              <NumberField label="Face yaw (deg)" value={settings.poseThresholds.faceYawDeg} step={1} min={0} max={35} onChange={(v) => setThresholds({ faceYawDeg: v })} />
              <NumberField label="Face pitch (deg)" value={settings.poseThresholds.facePitchDeg} step={1} min={0} max={35} onChange={(v) => setThresholds({ facePitchDeg: v })} />
              <NumberField label="Body visibility (0–1)" value={settings.poseThresholds.minBodyVisibility} step={0.05} min={0.3} max={0.95} onChange={(v) => setThresholds({ minBodyVisibility: v })} />
            </section>
          )}

          {/* Compression */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div>
                <h2 className="font-display text-lg">Image optimisation</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Before sending to the AI, captured photos are compressed to stay under the target file size. Smaller files upload faster; too small may lose detail.
                </p>
              </div>
              <NumberField label="Max file size (KB)" value={settings.compression.maxFileSizeKb} step={100} min={100} max={5000} onChange={(v) => setCompression({ maxFileSizeKb: v })} />
              <NumberField label="Min quality (0–1)" value={settings.compression.minQuality} step={0.05} min={0.3} max={0.95} onChange={(v) => setCompression({ minQuality: v })} />
              <NumberField label="Quality step" value={settings.compression.qualityStep} step={0.01} min={0.01} max={0.2} onChange={(v) => setCompression({ qualityStep: v })} />
              <NumberField label="Dimension step" value={settings.compression.dimensionStep} step={0.01} min={0.01} max={0.2} onChange={(v) => setCompression({ dimensionStep: v })} />
              <label className="flex items-center justify-between">
                <span className="text-sm">Strip EXIF metadata</span>
                <input type="checkbox" checked={settings.compression.stripMetadata} onChange={(e) => setCompression({ stripMetadata: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm">Strip PNG/EXIF chunks</span>
                <input type="checkbox" checked={settings.compression.stripChunks} onChange={(e) => setCompression({ stripChunks: e.target.checked })} />
              </label>
            </section>
          )}

          {/* Capture & AI */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div>
                <h2 className="font-display text-lg">Capture &amp; AI</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Set the countdown timer before the camera captures, how fast taglines rotate, and connect your TryOn AI provider.
                  </p>
              </div>
              <NumberField label="Capture timer (s)" value={settings.captureTimerSeconds} step={1} min={1} max={10} onChange={(v) => updateSettings({ captureTimerSeconds: v })} />
              <NumberField label="Tagline refresh (s)" value={settings.taglineRefreshMs / 1000} step={0.5} min={1} max={8} onChange={(v) => updateSettings({ taglineRefreshMs: v * 1000 })} />
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">TryOn AI endpoint</label>
                <input
                  value={settings.tryOnApiEndpoint}
                  onChange={(e) => updateSettings({ tryOnApiEndpoint: e.target.value })}
                  className="w-full h-10 mt-1 px-3 rounded-lg border border-border font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">API key</label>
                <input
                  type="password"
                  value={settings.tryOnApiKey}
                  onChange={(e) => updateSettings({ tryOnApiKey: e.target.value })}
                  placeholder="sk-…"
                  className="w-full h-10 mt-1 px-3 rounded-lg border border-border font-mono text-xs"
                />
              </div>
            </section>
          )}

          {/* Debug */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Debug &amp; activity log</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Turn on detailed event logging (camera, capture, try-on, network) for troubleshooting. Only visible to managers and developers — not shown to public users.
                  </p>
                </div>
              </div>
              <label className="flex items-center justify-between">
                <span className="text-sm">Enable debug logging</span>
                <input type="checkbox" checked={settings.debugLogging} onChange={(e) => updateSettings({ debugLogging: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm">Auto-preload model on start</span>
                <input type="checkbox" checked={settings.autoPreloadModel} onChange={(e) => updateSettings({ autoPreloadModel: e.target.checked })} />
              </label>
            </section>
          )}

          {/* Locked messages */}
          {!canFeatures && canBrand && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-6 text-center">
              <Shield className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Feature settings are developer-only</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
                Detection models, posture thresholds, image compression, and debug logging are managed by the developer role.
              </p>
            </div>
          )}
          {canFeatures && !canBrand && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-6 text-center">
              <ImageIcon className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Brand settings are manager-only</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
                Cover image, brand name, and logo are managed by the manager role.
              </p>
            </div>
          )}

          {/* Footer note */}
          <div className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              <strong>How roles work:</strong> Managers can edit brand identity (cover, name, logo). Developers can edit feature behaviour (models, thresholds, compression, AI). Super Admins can edit everything.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function NumberField({ label, value, step, min, max, onChange }: { label: string; value: number; step: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-10 mt-1 px-3 rounded-lg border border-border"
      />
    </div>
  );
}
