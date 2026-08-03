import { AlertCircle, CheckCircle2, Download, Loader2, Palette, RotateCcw, Save, Scan, Shield, Target, Trash2, Image as ImageIcon, HardDrive, DollarSign } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store";
import { DETECTION_MODELS, DEFAULT_SETTINGS } from "@/lib/constants";
import { canManageBrand, canManageFeatures, ROLE_LABELS, DEFAULT_PRICE_RANGE } from "@/types";
import type { DetectionModel, DetectionModelId, ImageCompressionSettings, PersonDetectionParams, PoseThresholds, PriceRangeSettings, TryOnSettings, Brand } from "@/types";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { logger } from "@/lib/logger";
import { useToast } from "@/components/ui/toast";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { BrandSection } from "@/components/settings/BrandSection";
import { ThemeSection } from "@/components/settings/ThemeSection";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import apiClient from "@/lib/api-client";

/**
 * SettingsPage — control panel for brand identity, detection models, posture
 * thresholds, image compression, capture timer, and debug/telemetry.
 *
 * ─── DRAFT / COMMIT PATTERN (Issues 2, 3, 4) ───────────────────────────
 * All settings changes go into a LOCAL DRAFT state (`draftSettings` +
 * `draftBrand`). The draft is only committed to the global store (which
 * triggers ThemeApplier + BrandLogo re-renders) when the user clicks the
 * header "Save" button. This means:
 *
 *   - Selecting a theme preset marks the settings as dirty (Save button
 *     activates) but does NOT apply the theme immediately.
 *   - The theme is only applied when the user clicks Save → the draft is
 *     committed to the store → ThemeApplier picks up the change.
 *   - Save also POSTs the settings + brand to the server.
 *   - On app load, settings are fetched from the server (see App.tsx).
 *
 * Reset: applies defaults immediately (commits to store + sends to server)
 * AND clears any uploaded images (customLogoUrl, customCoverBannerUrl).
 */
export function SettingsPage() {
  const { settings, updateSettings, resetSettings, user, brand } = useAuthStore();
  const userRole = user?.role;
  const { toast } = useToast();

  const canBrand = canManageBrand(userRole);
  const canFeatures = canManageFeatures(userRole);

  // ─── DRAFT STATE ──────────────────────────────────────────────────────
  // The draft holds pending changes that haven't been committed to the
  // store yet. The user edits the draft; the header Save button commits
  // it. This prevents theme/brand changes from applying immediately.
  const [draftSettings, setDraftSettings] = useState<TryOnSettings>(settings);
  const [draftBrand, setDraftBrand] = useState<Brand>(brand);

  // Sync the draft from the store when the store changes externally (e.g.
  // after a server fetch on app load). This runs on mount + whenever the
  // store's settings/brand change identity (but NOT when we ourselves
  // commit — because committing updates the store, which would re-sync
  // the draft to the just-committed value, which is correct).
  useEffect(() => {
    setDraftSettings(settings);
  }, [settings]);
  useEffect(() => {
    setDraftBrand(brand);
  }, [brand]);

  const isDirty = () =>
    JSON.stringify(draftSettings) !== JSON.stringify(settings) ||
    JSON.stringify(draftBrand) !== JSON.stringify(brand);

  // ─── DRAFT UPDATERS ───────────────────────────────────────────────────
  // These update the DRAFT (not the store). The ThemeApplier doesn't see
  // these changes until the user clicks Save.
  const patchDraftSettings = useCallback((patch: Partial<TryOnSettings>) => {
    setDraftSettings((prev) => ({ ...prev, ...patch }));
    logger.interaction(`Draft setting changed: ${Object.keys(patch).join(", ")}`, {
      component: "SettingsPage",
      detail: JSON.stringify(patch).slice(0, 120),
    });
  }, []);

  const patchDraftBrand = useCallback((patch: Partial<Brand>) => {
    setDraftBrand((prev) => ({ ...prev, ...patch }));
  }, []);

  // ─── SAVE (commit draft → store → server) ─────────────────────────────
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Commit the draft to the store — this triggers ThemeApplier +
      //    BrandLogo to re-render with the new values.
      updateSettings(draftSettings);
      // Update brand fields individually so the store's brand setters fire.
      const state = useAuthStore.getState();
      if (draftBrand.customName !== state.brand.customName) {
        state.setBrandName(draftBrand.customName ?? null);
      }
      if (draftBrand.customLogoUrl !== state.brand.customLogoUrl) {
        state.setBrandLogo(draftBrand.customLogoUrl ?? null);
      }
      if (draftBrand.customCoverBannerUrl !== state.brand.customCoverBannerUrl) {
        state.setBrandCoverImage(draftBrand.customCoverBannerUrl ?? null);
      }

      // 2. POST to the server (fire-and-forget — best-effort).
      await Promise.allSettled([
        apiClient.put("/settings", draftSettings),
        apiClient.put("/brand", draftBrand),
      ]);

      logger.settings("Settings saved to server");
      toast({ title: "Settings saved", description: "Your changes have been applied across the app and saved to the server." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save settings.";
      logger.settings("Settings save failed", { detail: msg, level: "error" });
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── RESET (apply defaults immediately + clear uploads from server) ───
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    logger.interaction("Reset settings clicked", { component: "SettingsPage" });
    try {
      // 1. Apply defaults to the DRAFT immediately.
      const defaultSettings = structuredClone(DEFAULT_SETTINGS);
      const defaultBrand: Brand = {
        ...brand,
        customName: undefined,
        customLogoUrl: undefined,
        customCoverBannerUrl: undefined,
      };
      setDraftSettings(defaultSettings);
      setDraftBrand(defaultBrand);

      // 2. Commit to the store immediately (so the UI reflects defaults).
      resetSettings();
      const state = useAuthStore.getState();
      state.setBrandName(null);
      state.setBrandLogo(null);
      state.setBrandCoverImage(null);

      // 3. DELETE uploaded images from the server + persist defaults.
      await Promise.allSettled([
        apiClient.put("/settings", defaultSettings),
        apiClient.put("/brand", defaultBrand),
        apiClient.delete("/brand/logo"),
        apiClient.delete("/brand/cover"),
      ]);

      toast({ title: "Settings reset", description: "All settings reverted to defaults. Uploaded images removed." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reset settings.";
      toast({ title: "Reset failed", description: msg, variant: "destructive" });
    } finally {
      setIsResetting(false);
    }
  };

  // ─── Convenience setters for the draft ────────────────────────────────
  const setThresholds = (patch: Partial<PoseThresholds>) =>
    patchDraftSettings({ poseThresholds: { ...draftSettings.poseThresholds, ...patch } });
  const setCompression = (patch: Partial<ImageCompressionSettings>) =>
    patchDraftSettings({ compression: { ...draftSettings.compression, ...patch } });
  const setPersonParams = (patch: Partial<PersonDetectionParams>) =>
    patchDraftSettings({ personDetectionParams: { ...draftSettings.personDetectionParams, ...patch } });
  const setPriceRange = (patch: Partial<PriceRangeSettings>) => {
    const next: PriceRangeSettings = {
      min: Math.max(0, Math.round(patch.min ?? draftSettings.priceRange.min)),
      max: Math.max(0, Math.round(patch.max ?? draftSettings.priceRange.max)),
    };
    if (next.max < next.min) next.max = next.min;
    patchDraftSettings({ priceRange: next });
  };

  const roleLabel = userRole ? ROLE_LABELS[userRole] : "";
  const subtitle = canBrand && canFeatures
    ? `Full access · ${roleLabel}`
    : canBrand
      ? `Brand settings · ${roleLabel}`
      : canFeatures
        ? `Feature settings · ${roleLabel}`
        : "View only";

  const dirty = isDirty();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalHeader
        title="Settings"
        subtitle={subtitle}
        backTo="/home"
        rightSlot={
          <>
            {canFeatures && (
              <Button variant="outline" size="sm" onClick={handleReset} disabled={isResetting || isSaving} className="gap-2">
                {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {isResetting ? "Resetting…" : "Reset"}
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty || isSaving}
              className="gap-2"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? "Saving…" : dirty ? "Save" : "Saved"}
            </Button>
          </>
        }
      />

      <main className="flex-1 px-3 sm:px-6 lg:px-10 py-6 max-w-4xl mx-auto w-full">
        <Accordion>
          {/* Brand identity — manager-only */}
          {canBrand && (
            <AccordionItem
              title="Brand identity"
              description="Upload your boutique's cover image, set the brand name, and add a logo."
              icon={<ImageIcon className="h-5 w-5" />}
              defaultOpen
            >
              {/* Issue 1 fix — BrandSection now receives the DRAFT brand +
                  a patchDraftBrand callback. It no longer has its own Save
                  button; the header Save button handles persistence. */}
              <BrandSection
                draftBrand={draftBrand}
                patchDraftBrand={patchDraftBrand}
              />
            </AccordionItem>
          )}

          {/* Theme — manager-only */}
          {canBrand && (
            <AccordionItem
              title="Theme"
              description="Pick a colour scheme, font, and base text size. Changes apply on Save."
              icon={<Palette className="h-5 w-5" />}
            >
              {/* Issue 2 fix — ThemeSection now receives the DRAFT theme +
                  a patchDraftTheme callback. Theme changes update the draft
                  (not the store), so they DON'T apply immediately. The
                  header Save button commits the draft → ThemeApplier picks
                  it up → the theme changes. */}
              <ThemeSection
                draftTheme={draftSettings.theme}
                patchDraftTheme={(partial) => patchDraftSettings({ theme: { ...draftSettings.theme, ...partial } })}
              />
            </AccordionItem>
          )}

          {/* ─── MODEL DOWNLOADS (shared, top of feature settings) ─────── */}
          {canFeatures && (
            <AccordionItem
              title="Model downloads"
              description="Download model weights once — cached in your browser, survive page refreshes."
              icon={<HardDrive className="h-5 w-5" />}
            >
              <div className="space-y-2">
                {DETECTION_MODELS.map((m) => (
                  <ModelDownloadRow key={m.id} model={m} />
                ))}
              </div>
            </AccordionItem>
          )}

          {/* ─── PERSON DETECTION MODEL (Stage 1) ───────────────────────── */}
          {canFeatures && (
            <AccordionItem
              title="Person detection model"
              description="Stage 1 — detects how many people are in the camera frame. Pick any downloaded model."
              icon={<Scan className="h-5 w-5" />}
            >
              <div className="space-y-2">
                {DETECTION_MODELS.map((m) => (
                  <SelectableModelCard
                    key={m.id}
                    model={m}
                    isActive={draftSettings.personDetectionModelId === m.id}
                    onSelect={() => {
                      patchDraftSettings({ personDetectionModelId: m.id as DetectionModelId });
                      logger.interaction(`Person-detection model selected: ${m.name}`, {
                        component: "PersonDetectionSection",
                      });
                    }}
                  />
                ))}
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Person detection parameters
                </p>
                <NumberField label="Confidence threshold (0–1)" value={draftSettings.personDetectionParams.confidenceThreshold} step={0.05} min={0.3} max={0.95} onChange={(v) => setPersonParams({ confidenceThreshold: v })} />
                <NumberField label="NMS IoU threshold (0–1)" value={draftSettings.personDetectionParams.nmsIouThreshold} step={0.05} min={0.1} max={0.9} onChange={(v) => setPersonParams({ nmsIouThreshold: v })} />
                <NumberField label="Max persons returned" value={draftSettings.personDetectionParams.maxPersons} step={1} min={1} max={50} onChange={(v) => setPersonParams({ maxPersons: v })} />
              </div>
            </AccordionItem>
          )}

          {/* ─── POSTURE ESTIMATION MODEL (Stage 3) ────────────────────── */}
          {canFeatures && (
            <AccordionItem
              title="Posture estimation model"
              description="Stage 3 — checks shoulder tilt, face yaw/pitch, body visibility. Independent from person detection."
              icon={<Target className="h-5 w-5" />}
            >
              <div className="space-y-2">
                {DETECTION_MODELS.map((m) => (
                  <SelectableModelCard
                    key={m.id}
                    model={m}
                    isActive={draftSettings.postureModelId === m.id}
                    onSelect={() => {
                      patchDraftSettings({ postureModelId: m.id as DetectionModelId });
                      logger.interaction(`Posture model selected: ${m.name}`, {
                        component: "PostureSection",
                      });
                    }}
                  />
                ))}
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Posture thresholds
                </p>
                <NumberField label="Shoulder tilt (deg)" value={draftSettings.poseThresholds.shoulderTiltDeg} step={1} min={0} max={30} onChange={(v) => setThresholds({ shoulderTiltDeg: v })} />
                <NumberField label="Face yaw (deg)" value={draftSettings.poseThresholds.faceYawDeg} step={1} min={0} max={35} onChange={(v) => setThresholds({ faceYawDeg: v })} />
                <NumberField label="Face pitch (deg)" value={draftSettings.poseThresholds.facePitchDeg} step={1} min={0} max={35} onChange={(v) => setThresholds({ facePitchDeg: v })} />
                <NumberField label="Body visibility (0–1)" value={draftSettings.poseThresholds.minBodyVisibility} step={0.05} min={0.3} max={0.95} onChange={(v) => setThresholds({ minBodyVisibility: v })} />
              </div>
            </AccordionItem>
          )}

          {/* Image optimisation */}
          {canFeatures && (
            <AccordionItem
              title="Image optimisation"
              description="Compress captured photos before sending to the AI. Smaller files upload faster."
              icon={<ImageIcon className="h-5 w-5" />}
            >
              <NumberField label="Max file size (KB)" value={draftSettings.compression.maxFileSizeKb} step={100} min={100} max={5000} onChange={(v) => setCompression({ maxFileSizeKb: v })} />
              <NumberField label="Min quality (0–1)" value={draftSettings.compression.minQuality} step={0.05} min={0.3} max={0.95} onChange={(v) => setCompression({ minQuality: v })} />
              <NumberField label="Quality step" value={draftSettings.compression.qualityStep} step={0.01} min={0.01} max={0.2} onChange={(v) => setCompression({ qualityStep: v })} />
              <NumberField label="Dimension step" value={draftSettings.compression.dimensionStep} step={0.01} min={0.01} max={0.2} onChange={(v) => setCompression({ dimensionStep: v })} />
              <label className="flex items-center justify-between">
                <span className="text-sm">Strip EXIF metadata</span>
                <input type="checkbox" checked={draftSettings.compression.stripMetadata} onChange={(e) => setCompression({ stripMetadata: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm">Strip PNG/EXIF chunks</span>
                <input type="checkbox" checked={draftSettings.compression.stripChunks} onChange={(e) => setCompression({ stripChunks: e.target.checked })} />
              </label>
            </AccordionItem>
          )}

          {/* Capture */}
          {canFeatures && (
            <AccordionItem
              title="Capture"
              description="Set the countdown timer before the camera captures + tagline rotation speed."
              icon={<Scan className="h-5 w-5" />}
            >
              <NumberField label="Capture timer (s)" value={draftSettings.captureTimerSeconds} step={1} min={1} max={10} onChange={(v) => patchDraftSettings({ captureTimerSeconds: v })} />
              <NumberField label="Tagline refresh (s)" value={draftSettings.taglineRefreshMs / 1000} step={0.5} min={1} max={8} onChange={(v) => patchDraftSettings({ taglineRefreshMs: v * 1000 })} />
            </AccordionItem>
          )}

          {/* ─── CURRENCY ──────────────────────────────────────────────── */}
          {canFeatures && (
            <AccordionItem
              title="Currency"
              description="Dynamic currency code (ISO 4217) for all price displays. Defaults to PKR."
              icon={<DollarSign className="h-5 w-5" />}
            >
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Currency code</label>
                <input
                  type="text"
                  value={draftSettings.currency}
                  onChange={(e) => patchDraftSettings({ currency: e.target.value.toUpperCase().slice(0, 3) })}
                  placeholder="PKR"
                  className="w-full h-10 mt-1 px-3 rounded-lg border border-border font-mono uppercase"
                  maxLength={3}
                />
              </div>
            </AccordionItem>
          )}

          {/* ─── PRICE RANGE BOUNDS ────────────────────────────────────── */}
          {canFeatures && (
            <AccordionItem
              title="Price range bounds"
              description="Controls the min/max bounds of the price slider in the Filters modal. Defaults to $0 – $10,000."
              icon={<DollarSign className="h-5 w-5" />}
            >
              <NumberField
                label="Min price ($)"
                value={draftSettings.priceRange.min}
                step={1}
                min={0}
                max={draftSettings.priceRange.max}
                onChange={(v) => setPriceRange({ min: v })}
              />
              <NumberField
                label="Max price ($)"
                value={draftSettings.priceRange.max}
                step={1}
                min={draftSettings.priceRange.min}
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
            </AccordionItem>
          )}

          {/* Debug & Telemetry */}
          {canFeatures && (
            <AccordionItem
              title="Debug & telemetry"
              description="Detailed event logging + error telemetry to the backend. Only visible to managers + developers."
              icon={<Shield className="h-5 w-5" />}
            >
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Enable debug logging</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Shows the Activity overlay (bottom-right). Logs navigation, interactions, camera, capture, try-on, and network events.</p>
                </div>
                <input type="checkbox" checked={draftSettings.debugLogging} onChange={(e) => patchDraftSettings({ debugLogging: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Send error telemetry to backend</span>
                  <p className="text-xs text-muted-foreground mt-0.5">When ON, error-level logs (with fix tips) are POSTed to <code className="font-mono text-[10px]">/api/telemetry</code> (fire-and-forget).</p>
                </div>
                <input type="checkbox" checked={draftSettings.telemetryEnabled} onChange={(e) => patchDraftSettings({ telemetryEnabled: e.target.checked })} />
              </label>
            </AccordionItem>
          )}
        </Accordion>

        {/* Locked messages */}
        {!canFeatures && canBrand && (
          <div className="mt-4 rounded-2xl border border-dashed border-border/60 bg-muted/30 p-6 text-center">
            <Shield className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Feature settings are developer-only</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
              Detection models, posture thresholds, image compression, and debug logging are managed by the developer role.
            </p>
          </div>
        )}
        {canFeatures && !canBrand && (
          <div className="mt-4 rounded-2xl border border-dashed border-border/60 bg-muted/30 p-6 text-center">
            <ImageIcon className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Brand settings are manager-only</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
              Cover image, brand name, and logo are managed by the manager role.
            </p>
          </div>
        )}

        {/* Footer note */}
        <div className="mt-4 flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            <strong>How roles work:</strong> Managers can edit brand identity (cover, name, logo). Developers can edit feature behaviour (models, thresholds, compression, AI). Super Admins can edit everything.
          </p>
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
