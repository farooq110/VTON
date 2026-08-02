import { AlertCircle, CheckCircle2, Download, Loader2, Palette, RotateCcw, Save, Scan, Shield, Target, Trash2, Image as ImageIcon, HardDrive, DollarSign } from "lucide-react";
import { useRef, useState } from "react";
import { useAuthStore } from "@/lib/store";
import { DETECTION_MODELS } from "@/lib/constants";
import { canManageBrand, canManageFeatures, ROLE_LABELS, DEFAULT_PRICE_RANGE } from "@/types";
import type { DetectionModel, DetectionModelId, ImageCompressionSettings, PersonDetectionParams, PoseThresholds, PriceRangeSettings, TryOnSettings } from "@/types";
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
 * ─── NEW MODEL ARCHITECTURE ─────────────────────────────────────────────
 * The settings page now has THREE separate model-related sections:
 *
 *   1. MODEL DOWNLOADS (top, shared) — lists every available model with a
 *      Download / Uninstall button. Downloading a model here makes it
 *      available for BOTH person detection AND posture estimation. The
 *      download state is PERSISTENT (survives page refresh) via the
 *      model-persistence layer.
 *
 *   2. PERSON DETECTION MODEL (Stage 1) — select which downloaded model to
 *      use for person detection, plus its own tuning parameters
 *      (confidence threshold, NMS IoU, max persons). Click anywhere on a
 *      model's card to select it.
 *
 *   3. POSTURE ESTIMATION MODEL (Stage 3) — select which downloaded model
 *      to use for posture checks, plus the pose thresholds (shoulder tilt,
 *      face yaw, etc.). Click anywhere on a model's card to select it.
 *
 * Both selection sections draw from the SAME list of models, and both can
 * pick the same or different models. The download is shared.
 */
export function SettingsPage() {
  const { settings, updateSettings, resetSettings, user } = useAuthStore();
  const userRole = user?.role;
  const { toast } = useToast();

  const canBrand = canManageBrand(userRole);
  const canFeatures = canManageFeatures(userRole);

  const savedSnapshotRef = useRef<TryOnSettings>(structuredClone(settings));
  const [saved, setSaved] = useState(true);

  const isDirty = () => JSON.stringify(settings) !== JSON.stringify(savedSnapshotRef.current);

  const handleUpdate = (patch: Partial<TryOnSettings>) => {
    updateSettings(patch);
    setSaved(false);
    logger.interaction(`Setting changed: ${Object.keys(patch).join(", ")}`, {
      component: "SettingsPage",
      detail: JSON.stringify(patch).slice(0, 120),
    });
  };

  const handleReset = () => {
    logger.interaction("Reset settings clicked", { component: "SettingsPage" });
    resetSettings();
    setTimeout(() => setSaved(false), 0);
  };

  const handleSave = () => {
    savedSnapshotRef.current = structuredClone(useAuthStore.getState().settings);
    setSaved(true);
    logger.settings("Settings saved");
    toast({ title: "Settings saved", description: "Your changes have been applied." });
  };

  const setThresholds = (patch: Partial<PoseThresholds>) =>
    handleUpdate({ poseThresholds: { ...settings.poseThresholds, ...patch } });
  const setCompression = (patch: Partial<ImageCompressionSettings>) =>
    handleUpdate({ compression: { ...settings.compression, ...patch } });
  const setPersonParams = (patch: Partial<PersonDetectionParams>) =>
    handleUpdate({ personDetectionParams: { ...settings.personDetectionParams, ...patch } });
  // Price range — drives the min/max bounds of the FiltersModal slider.
  // Always coerced to rounded, non-negative integers, and max >= min so
  // the slider can never render with an invalid range.
  const setPriceRange = (patch: Partial<PriceRangeSettings>) => {
    const next: PriceRangeSettings = {
      min: Math.max(0, Math.round(patch.min ?? settings.priceRange.min)),
      max: Math.max(0, Math.round(patch.max ?? settings.priceRange.max)),
    };
    if (next.max < next.min) next.max = next.min;
    handleUpdate({ priceRange: next });
  };

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

          {/* Theme — manager-only */}
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

          {/* ─── MODEL DOWNLOADS (shared, top of feature settings) ───────
              This section lists every available model with a Download /
              Uninstall button. Downloading a model here makes it available
              for BOTH the person-detection section AND the posture-estimation
              section below — the download is shared.

              The download state is PERSISTENT (survives page refresh) via
              the model-persistence layer (localStorage + Cache Storage
              verification). */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Model downloads</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Download model weights once — they&apos;re cached in your browser and <strong>survive page refreshes</strong>. Each downloaded model becomes available for both person detection (Stage 1) and posture estimation (Stage 3). Use <strong>Uninstall</strong> to remove a model and free up space.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {DETECTION_MODELS.map((m) => (
                  <ModelDownloadRow key={m.id} model={m} />
                ))}
              </div>
            </section>
          )}

          {/* ─── PERSON DETECTION MODEL (Stage 1) ─────────────────────────
              Select which downloaded model to use for person detection.
              Click anywhere on the card to select it (not just the radio).
              Has its OWN tuning parameters below the selection. */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Scan className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Person detection model</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Stage 1 — detects how many people are in the camera frame. Rejects 0 persons or multiple persons. Pick any downloaded model below; its parameters are configured in the section underneath.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {DETECTION_MODELS.map((m) => (
                  <SelectableModelCard
                    key={m.id}
                    model={m}
                    isActive={settings.personDetectionModelId === m.id}
                    onSelect={() => {
                      handleUpdate({ personDetectionModelId: m.id as DetectionModelId });
                      logger.interaction(`Person-detection model selected: ${m.name}`, {
                        component: "PersonDetectionSection",
                      });
                    }}
                  />
                ))}
              </div>

              {/* Person-detection-specific parameters */}
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Person detection parameters
                </p>
                <NumberField
                  label="Confidence threshold (0–1)"
                  value={settings.personDetectionParams.confidenceThreshold}
                  step={0.05}
                  min={0.3}
                  max={0.95}
                  onChange={(v) => setPersonParams({ confidenceThreshold: v })}
                />
                <NumberField
                  label="NMS IoU threshold (0–1)"
                  value={settings.personDetectionParams.nmsIouThreshold}
                  step={0.05}
                  min={0.1}
                  max={0.9}
                  onChange={(v) => setPersonParams({ nmsIouThreshold: v })}
                />
                <NumberField
                  label="Max persons returned"
                  value={settings.personDetectionParams.maxPersons}
                  step={1}
                  min={1}
                  max={50}
                  onChange={(v) => setPersonParams({ maxPersons: v })}
                />
              </div>
            </section>
          )}

          {/* ─── POSTURE ESTIMATION MODEL (Stage 3) ──────────────────────
              Select which downloaded model to use for posture checks.
              Independent from the person-detection model — you can use
              YOLOv8n for detection and YOLOv8s for posture, or any
              combination. Has its OWN threshold parameters below. */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Posture estimation model</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Stage 3 — checks the user&apos;s posture (shoulder tilt, face yaw/pitch, body visibility). Independent from the person-detection model above; pick any downloaded model.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {DETECTION_MODELS.map((m) => (
                  <SelectableModelCard
                    key={m.id}
                    model={m}
                    isActive={settings.postureModelId === m.id}
                    onSelect={() => {
                      handleUpdate({ postureModelId: m.id as DetectionModelId });
                      logger.interaction(`Posture model selected: ${m.name}`, {
                        component: "PostureSection",
                      });
                    }}
                  />
                ))}
              </div>

              {/* Posture thresholds */}
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Posture thresholds
                </p>
                <NumberField label="Shoulder tilt (deg)" value={settings.poseThresholds.shoulderTiltDeg} step={1} min={0} max={30} onChange={(v) => setThresholds({ shoulderTiltDeg: v })} />
                <NumberField label="Face yaw (deg)" value={settings.poseThresholds.faceYawDeg} step={1} min={0} max={35} onChange={(v) => setThresholds({ faceYawDeg: v })} />
                <NumberField label="Face pitch (deg)" value={settings.poseThresholds.facePitchDeg} step={1} min={0} max={35} onChange={(v) => setThresholds({ facePitchDeg: v })} />
                <NumberField label="Body visibility (0–1)" value={settings.poseThresholds.minBodyVisibility} step={0.05} min={0.3} max={0.95} onChange={(v) => setThresholds({ minBodyVisibility: v })} />
              </div>
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

          {/* Capture */}
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

          {/* ─── PRICE RANGE BOUNDS ──────────────────────────────────────
              Controls the min/max bounds of the price slider in the
              FiltersModal. Defaults to { min: 0, max: 10000 } (rounded).
              The boutique manager can narrow or widen this range to match
              the catalogue's actual price distribution. Values are always
              coerced to non-negative integers, and max is clamped to be
              >= min so the slider can never render with an invalid range. */}
          {canFeatures && (
            <section className="rounded-2xl bg-card border border-border p-6 space-y-5">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-lg">Price range bounds</h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Controls the min/max bounds of the price slider shown in the product Filters modal. Defaults to <strong>$0 – $10,000</strong> (rounded). Adjust to match your catalogue&apos;s actual price distribution. The FiltersModal slider always uses these bounds — customers can pick any value inside them.
                  </p>
                </div>
              </div>
              <NumberField
                label="Min price ($)"
                value={settings.priceRange.min}
                step={1}
                min={0}
                max={settings.priceRange.max}
                onChange={(v) => setPriceRange({ min: v })}
              />
              <NumberField
                label="Max price ($)"
                value={settings.priceRange.max}
                step={1}
                min={settings.priceRange.min}
                max={1_000_000}
                onChange={(v) => setPriceRange({ max: v })}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPriceRange({ ...DEFAULT_PRICE_RANGE })}
                className="gap-1.5 h-8 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults ($0 – $10,000)
              </Button>
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
                    Turn on detailed event logging (navigation, interactions, camera, capture, try-on, network) for troubleshooting. Only visible to managers and developers. Error logs include actionable fix tips. Error-level logs can also be sent to the backend for remote diagnostics.
                  </p>
                </div>
              </div>
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Enable debug logging</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Shows the Activity overlay (bottom-right). Logs navigation, interactions, camera, capture, try-on, and network events.</p>
                </div>
                <input type="checkbox" checked={settings.debugLogging} onChange={(e) => handleUpdate({ debugLogging: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Send error telemetry to backend</span>
                  <p className="text-xs text-muted-foreground mt-0.5">When ON, error-level logs (with fix tips) are POSTed to <code className="font-mono text-[10px]">/api/telemetry</code> (fire-and-forget).</p>
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
 * ModelDownloadRow — a single model in the shared "Model downloads" section.
 *
 * Shows the model name, size, and a Download / Uninstall button. The
 * download state is read from the persistence layer (survives page refresh).
 * Uninstall removes the model from the browser's Cache Storage.
 *
 * This row does NOT select the model for any stage — it only manages the
 * download. Selection happens in the SelectableModelCard components below.
 */
function ModelDownloadRow({ model }: { model: DetectionModel }) {
  const { isModelCached, preloadModel, uninstallModel, modelStatus, modelProgress, activeModelId } = usePoseDetection();
  const [downloading, setDownloading] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const cached = isModelCached(model.id);
  const isThisDownloading = downloading || (activeModelId === model.id && modelStatus === "loading");

  const handleDownload = async () => {
    logger.interaction(`Download model clicked: ${model.name}`, { component: "ModelDownloadRow" });
    setDownloading(true);
    setDownloadError(null);
    const ok = await preloadModel(model.id);
    setDownloading(false);
    if (ok) {
      logger.settings(`Model downloaded: ${model.id}`);
    } else {
      const msg = "Download failed — check your network connection and try again.";
      setDownloadError(msg);
    }
  };

  const handleUninstall = async () => {
    logger.interaction(`Uninstall model clicked: ${model.name}`, { component: "ModelDownloadRow" });
    setUninstalling(true);
    await uninstallModel(model.id);
    setUninstalling(false);
  };

  return (
    <div className="w-full text-left rounded-xl border border-border p-4 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-sm font-medium">{model.name}</span>
          {model.recommended && (
            <span className="text-accent text-[10px] uppercase tracking-wider bg-accent/10 px-1.5 py-0.5 rounded">Recommended</span>
          )}
          {cached ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">
              <CheckCircle2 className="h-3 w-3" /> Downloaded
            </span>
          ) : isThisDownloading ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">
              <Loader2 className="h-3 w-3 animate-spin" /> {Math.round(modelProgress * 100)}%
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              <Download className="h-3 w-3" /> {model.sizeMb} MB
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{model.description}</p>
        <p className="text-[11px] text-muted-foreground mt-2 font-mono">~{model.speedMs}ms · {model.accuracy}</p>

        {isThisDownloading && (
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round(modelProgress * 100)}%` }} />
          </div>
        )}
        {downloadError && !isThisDownloading && (
          <p className="mt-2 text-[11px] text-red-600 leading-relaxed">{downloadError}</p>
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-1.5">
        {!cached && !isThisDownloading && (
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        )}
        {cached && (
          <button
            onClick={handleUninstall}
            disabled={uninstalling}
            className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition disabled:opacity-50"
          >
            {uninstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {uninstalling ? "Removing…" : "Uninstall"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * SelectableModelCard — a model card used in the person-detection and
 * posture-estimation selection sections.
 *
 * CLICK-ANYWHERE-TO-SELECT: the entire card is a button that calls onSelect.
 * There's no separate radio button to click — the whole card is the target.
 * The visual radio indicator on the right is just a status display, not an
 * interactive element.
 *
 * Shows a "Download first" hint if the model isn't downloaded yet, but
 * still allows selection (the download will happen automatically on first
 * use, or the user can download it from the "Model downloads" section above).
 */
function SelectableModelCard({
  model,
  isActive,
  onSelect,
}: {
  model: DetectionModel;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { isModelCached } = usePoseDetection();
  const cached = isModelCached(model.id);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-4 transition cursor-pointer ${
        isActive
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border hover:border-foreground/30 hover:bg-muted/30"
      }`}
      aria-pressed={isActive}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-sm font-medium">{model.name}</span>
            {model.recommended && (
              <span className="text-accent text-[10px] uppercase tracking-wider bg-accent/10 px-1.5 py-0.5 rounded">Recommended</span>
            )}
            {cached ? (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                <Download className="h-3 w-3" /> Download first
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{model.description}</p>
          <p className="text-[11px] text-muted-foreground mt-2 font-mono">~{model.speedMs}ms · {model.accuracy} · {model.sizeMb} MB</p>
        </div>
        {/* Visual selection indicator — NOT interactive (the whole card is
            the button). Just shows the selected/unselected state. */}
        <div
          className={`h-5 w-5 rounded-full border-2 shrink-0 mt-0.5 grid place-items-center transition ${
            isActive ? "border-primary bg-primary" : "border-border"
          }`}
          aria-hidden="true"
        >
          {isActive && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
        </div>
      </div>
    </button>
  );
}
