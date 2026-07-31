import { AlertCircle, CheckCircle2, Download, Loader2, Palette, RotateCcw, Save, Scan, Shield, Target, Image as ImageIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useAuthStore } from "@/lib/store";
import { DETECTION_MODELS } from "@/lib/constants";
import { canManageBrand, canManageFeatures, ROLE_LABELS } from "@/types";
import type { DetectionModel, DetectionModelId, ImageCompressionSettings, PoseThresholds, TryOnSettings } from "@/types";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { logger } from "@/lib/logger";
import { useToast } from "@/components/ui/toast";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { BrandSection } from "@/components/settings/BrandSection";
import { ThemeSection } from "@/components/settings/ThemeSection";
import { Button } from "@/components/ui/button";

/**
 * SettingsPage — control panel for brand identity, detection models, posture
 * thresholds, image compression, capture timer, and debug/telemetry.
 *
 * **Save button behavior:**
 *   - The Save button is DISABLED by default.
 *   - It becomes ENABLED only when the user changes a setting (dirty state).
 *   - On save click: shows a toast, marks the settings as saved, and DISABLES
 *     the button again. Does NOT navigate away from the page.
 *
 * **Model download behavior:**
 *   - Models do NOT auto-download. The user must click "Download now" manually.
 *   - After download, the button shows "Downloaded" (disabled, green check).
 *   - If the user tries to capture/upload without the model downloaded, a
 *     beautiful popup appears: "Download the model first".
 *
 * **TryOn AI endpoint:**
 *   - Removed from the UI — the backend proxy `/api/tryon/run` handles the
 *     AI call with server-side credentials. No API keys on the client.
 */
export function SettingsPage() {
  const { settings, updateSettings, resetSettings, user } = useAuthStore();
  const userRole = user?.role;
  const { toast } = useToast();
  const { isModelCached } = usePoseDetection();

  const canBrand = canManageBrand(userRole);
  const canFeatures = canManageFeatures(userRole);

  // ─── Dirty-state tracking for the Save button ──────────────────────────
  // Snapshot the settings when the page loads. Compare current settings to
  // the snapshot to determine if there are unsaved changes.
  const savedSnapshotRef = useRef<TryOnSettings>(structuredClone(settings));
  const [saved, setSaved] = useState(true);

  const isDirty = () => JSON.stringify(settings) !== JSON.stringify(savedSnapshotRef.current);

  const handleUpdate = (patch: Partial<TryOnSettings>) => {
    updateSettings(patch);
    setSaved(false);
  };

  const handleReset = () => {
    resetSettings();
    // After reset, the settings differ from the snapshot → dirty
    setTimeout(() => setSaved(false), 0);
  };

  const handleSave = () => {
    // Zustand-persist already wrote to localStorage on every updateSettings
    // call. This button is just a UX confirmation — update the snapshot and
    // show a toast.
    savedSnapshotRef.current = structuredClone(useAuthStore.getState().settings);
    setSaved(true);
    logger.settings("Settings saved");
    toast({ title: "Settings saved", description: "Your changes have been applied." });
  };

  const setThresholds = (patch: Partial<PoseThresholds>) =>
    handleUpdate({ poseThresholds: { ...settings.poseThresholds, ...patch } });
  const setCompression = (patch: Partial<ImageCompressionSettings>) =>
    handleUpdate({ compression: { ...settings.compression, ...patch } });

  const roleLabel = userRole ? ROLE_LABELS[userRole] : "";
  const subtitle = canBrand && canFeatures
    ? `Full access · ${roleLabel}`
    : canBrand
      ? `Brand settings · ${roleLabel}`
      : canFeatures
        ? `Feature settings · ${roleLabel}`
        : "View only";

  const dirty = !saved && isDirty();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalHeader
        title="Settings"
        subtitle={subtitle}
        backTo="/home"
        rightSlot={
          <>
            {canFeatures && (
              <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Reset
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty}
              className="gap-2"
            >
              <Save className="h-4 w-4" /> {dirty ? "Save" : "Saved"}
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

          {/* ─── Person detection model ───────────────────────────────────
              This model detects HOW MANY people are in the frame (0, 1, or >1)
              and returns their bounding boxes. It's the first stage of the
              try-on validation pipeline. */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6">
              <div className="flex items-center gap-2 mb-3">
                <Scan className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Person detection model</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Detects how many people are in the camera frame (Stage 1). Rejects 0 persons or multiple persons. Models are <strong>not</strong> auto-downloaded — click &quot;Download now&quot; to fetch the weights (one-time, ~3 MB).
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {DETECTION_MODELS.map((m) => (
                  <ModelOption
                    key={m.id}
                    model={m}
                    isActive={settings.activeModelId === m.id}
                    onSelect={() => handleUpdate({ activeModelId: m.id as DetectionModelId })}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ─── Posture estimation model ────────────────────────────────
              This model checks the user's pose (shoulders straight, face
              forward, full body visible). It uses the SAME model as person
              detection (YOLOv8-pose returns both bounding boxes AND 17 COCO
              keypoints), so it shares the download above — no separate
              download needed. */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Posture estimation model</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Checks the user&apos;s posture (Stage 3) — shoulder tilt, face yaw/pitch, body visibility. Uses the same model as person detection above (YOLOv8-pose returns both bounding boxes AND keypoints), so no separate download is needed.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                <strong>Active model:</strong> {DETECTION_MODELS.find((m) => m.id === settings.activeModelId)?.name ?? settings.activeModelId}
                <br />
                <strong>Downloaded:</strong> {isModelCached(settings.activeModelId) ? "Yes ✓" : "No — download above"}
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

          {/* Capture (no AI endpoint — handled by backend) */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div>
                <h2 className="font-display text-lg">Capture</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Set the countdown timer before the camera captures and how fast taglines rotate during AI processing. The TryOn AI endpoint is configured server-side — no API keys needed on the client.
                </p>
              </div>
              <NumberField label="Capture timer (s)" value={settings.captureTimerSeconds} step={1} min={1} max={10} onChange={(v) => handleUpdate({ captureTimerSeconds: v })} />
              <NumberField label="Tagline refresh (s)" value={settings.taglineRefreshMs / 1000} step={0.5} min={1} max={8} onChange={(v) => handleUpdate({ taglineRefreshMs: v * 1000 })} />
            </section>
          )}

          {/* Debug & Telemetry */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Debug &amp; telemetry</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Turn on detailed event logging (camera, capture, try-on, network) for troubleshooting. Only visible to managers and developers — not shown to public users. Error-level logs can also be sent to the backend for remote diagnostics.
                  </p>
                </div>
              </div>
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Enable debug logging</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Shows the Activity overlay (bottom-right). Logs camera, capture, try-on, and network events.</p>
                </div>
                <input type="checkbox" checked={settings.debugLogging} onChange={(e) => handleUpdate({ debugLogging: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Send error telemetry to backend</span>
                  <p className="text-xs text-muted-foreground mt-0.5">When ON, error-level logs are POSTed to <code className="font-mono text-[10px]">/api/telemetry</code> (fire-and-forget) so the server can track client-side failures.</p>
                </div>
                <input type="checkbox" checked={settings.telemetryEnabled} onChange={(e) => handleUpdate({ telemetryEnabled: e.target.checked })} />
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

/**
 * ModelOption — a single detection model card with download status.
 *
 * Download behavior:
 *   - Models do NOT auto-download. User must click "Download now".
 *   - After successful download, shows "Downloaded" badge (green, disabled button).
 *   - If download fails, shows an error badge + retries on next click.
 *   - Download progress bar appears during active download.
 */
function ModelOption({
  model,
  isActive,
  onSelect,
}: {
  model: DetectionModel;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { isModelCached, preloadModel, modelStatus, modelProgress, activeModelId } = usePoseDetection();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const cached = isModelCached(model.id);
  const isThisDownloading = downloading || (activeModelId === model.id && modelStatus === "loading");

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    setDownloadError(null);
    logger.settings(`Downloading model: ${model.id}`);
    // preloadModel returns true on success, false on failure (no throw).
    const ok = await preloadModel(model.id);
    setDownloading(false);
    if (ok) {
      logger.settings(`Model downloaded successfully: ${model.id}`);
    } else {
      const msg = "Download failed — check your network connection and try again.";
      setDownloadError(msg);
      logger.settings(`Model download failed: ${model.id}`, { detail: msg, level: "error" });
    }
  };

  return (
    <div
      className={`w-full text-left rounded-xl border p-4 transition ${isActive ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={onSelect} className="font-display text-sm font-medium text-left">
              {model.name}
            </button>
            {model.recommended && (
              <span className="text-accent text-[10px] uppercase tracking-wider bg-accent/10 px-1.5 py-0.5 rounded">Recommended</span>
            )}
            {/* Download status badge */}
            {cached ? (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">
                <CheckCircle2 className="h-3 w-3" /> Downloaded
              </span>
            ) : isThisDownloading ? (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">
                <Loader2 className="h-3 w-3 animate-spin" /> Downloading {Math.round(modelProgress * 100)}%
              </span>
            ) : downloadError ? (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded">
                Download failed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                <Download className="h-3 w-3" /> Not downloaded ({model.sizeMb} MB)
              </span>
            )}
            {/* Active selection radio */}
            <button
              onClick={onSelect}
              className={`h-5 w-5 rounded-full border-2 shrink-0 ${isActive ? "border-primary bg-primary" : "border-border"}`}
              aria-label="Select model"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{model.description}</p>
          <p className="text-[11px] text-muted-foreground mt-2 font-mono">~{model.speedMs}ms inference · {model.accuracy} accuracy</p>

          {/* Download progress bar */}
          {isThisDownloading && (
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round(modelProgress * 100)}%` }} />
            </div>
          )}

          {/* Download error message */}
          {downloadError && !isThisDownloading && (
            <p className="mt-2 text-[11px] text-red-600 leading-relaxed">{downloadError}</p>
          )}

          {/* Download button — only show if not downloaded and not currently downloading */}
          {!cached && !isThisDownloading && (
            <button
              onClick={handleDownload}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition"
            >
              <Download className="h-3.5 w-3.5" /> Download now ({model.sizeMb} MB)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
