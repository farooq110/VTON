import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Check, CheckSquare, Download, Image as ImageIcon, Loader2, Maximize2, Plus, RefreshCw, Square, Trash2, UserPlus, X } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { useAuthStore } from "@/lib/store";
import { useProducts } from "@/hooks/useProducts";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddCapturePanel } from "@/components/tryon/AddCapturePanel";
import { formatBytes, formatRelativeTime, resolveProductImage, onImageError } from "@/lib/utils";
import { DETECTION_MODELS } from "@/lib/constants";
import type { SavedCaptureImage } from "@/types";

type Phase = "intro" | "camera" | "countdown" | "captured-preview";

export function TryOnCameraPage() {
  const navigate = useNavigate();
  const { data: products } = useProducts();
  const { savedImages, removeSavedImage, setActiveCapture, settings, selectedProductId } = useAuthStore();
  const { toast } = useToast();
  const { isModelCached, preloadModel, modelProgress } = usePoseDetection();

  // ─── Model download gate ──────────────────────────────────────────────
  // The inline "model not downloaded" banner is visible ONLY when the model
  // is NOT cached. Once download succeeds, the banner hides automatically
  // (single-source-of-truth: `modelReady` reads from `isModelCached` which
  // is backed by the global `loadedModels` set + pub/sub).
  const [downloadingModel, setDownloadingModel] = useState(false);
  const activeModel = DETECTION_MODELS.find((m) => m.id === settings.personDetectionModelId);
  const modelReady = isModelCached(settings.personDetectionModelId);

  const downloadModel = async () => {
    setDownloadingModel(true);
    // preloadModel returns true on success, false on failure (no throw).
    const ok = await preloadModel(settings.personDetectionModelId);
    setDownloadingModel(false);
    if (ok) {
      toast({ title: "Model downloaded", description: "You can now capture and try on." });
    } else {
      toast({
        title: "Download failed",
        description: "Could not download the model. Check your network connection and try again.",
        variant: "destructive",
      });
    }
    return ok;
  };

  /** Checks if the model is ready. If not, returns false (the inline banner
   *  is already visible — no separate popup needed). */
  const ensureModelReady = (): boolean => {
    return modelReady;
  };

  // Defensive: ensure products is always an array before .find
  const safeProducts = Array.isArray(products) ? products : [];
  const product = safeProducts.find((p) => p.id === selectedProductId);

  const { videoRef, active: cameraActive, error: cameraError, start: startCamera, stop: stopCamera, captureStill } = useCamera();
  const [phase, setPhase] = useState<Phase>("intro");
  const [countdown, setCountdown] = useState(settings.captureTimerSeconds);
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [lastSizeKb, setLastSizeKb] = useState(0);
  const [showCaptures, setShowCaptures] = useState(false);
  const [confirmImage, setConfirmImage] = useState<SavedCaptureImage | null>(null);
  // Add-person modal — opens the AddCapturePanel so the user can add a
  // person image from disk or URL directly from the camera page sidebar.
  const [showAddPerson, setShowAddPerson] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Entry guard — must have a selected garment before opening camera ──
  // Issue 2 fix — friendly warning (not red error) when no garment is
  // selected. The user is just being redirected back to pick a garment;
  // that's an info situation, not an error.
  useEffect(() => {
    const currentSelected = useAuthStore.getState().selectedProductId;
    if (!currentSelected) {
      // Issue 4 fix — use variant: "warning" (amber) so the toast is
      // clearly a friendly warning, not a red error.
      toast({
        title: "Please select a garment first",
        description: "Browse the collection and pick a piece to try on before opening the camera.",
        variant: "warning",
      });
      navigate("/products", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Camera start/stop lifecycle ──────────────────────────────────────
  useEffect(() => {
    if (phase === "camera" && !cameraActive) {
      startCamera("user");
    }
    return () => {
      if (phase !== "camera" && phase !== "countdown") stopCamera();
    };
  }, [phase, cameraActive, startCamera, stopCamera]);

  useEffect(() => () => {
    stopCamera();
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, [stopCamera]);

  // ─── Camera auto-close on focus loss / tab switch ─────────────────────
  // Only fires when the camera stream is actually active (after permission).
  useEffect(() => {
    const handleClose = () => {
      if (cameraActive) {
        stopCamera();
        setPhase("intro");
      }
    };
    const handleVisibility = () => { if (document.hidden) handleClose(); };
    const handleBlur = () => handleClose();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
    };
  }, [cameraActive, stopCamera]);

  // ─── When sidebar opens → close camera on ALL screen sizes ────────────
  useEffect(() => {
    if (showCaptures && cameraActive) {
      stopCamera();
      setPhase("intro");
    }
  }, [showCaptures, cameraActive, stopCamera]);

  // ─── When camera opens (phase → camera) → close sidebar on ALL screens ─
  useEffect(() => {
    if (phase === "camera" && showCaptures) {
      setShowCaptures(false);
    }
  }, [phase, showCaptures]);

  // ─── Capture flow ─────────────────────────────────────────────────────
  // Gate: the model must be downloaded before the user can open the camera.
  // If not, the "Download model first" popup appears.
  const openCamera = () => {
    if (!ensureModelReady()) return;
    setPhase("camera");
  };

  const startCountdown = () => {
    setPhase("countdown");
    setCountdown(settings.captureTimerSeconds);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          captureNow();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const captureNow = async () => {
    const dataUrl = await captureStill();
    if (!dataUrl) {
      // Capture failed (video not ready) — go back to camera phase.
      setPhase("camera");
      return;
    }
    const comma = dataUrl.indexOf(",");
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    setLastSizeKb((b64.length * 3) / 4 / 1024);
    setLastCapture(dataUrl);
    setPhase("captured-preview");
    stopCamera();
  };

  const retake = () => {
    setLastCapture(null);
    setPhase("camera");
  };

  const closeCapturedPreview = () => {
    stopCamera();
    setLastCapture(null);
    setPhase("intro");
  };

  // Save the captured image + immediately start the try-on pipeline.
  // The validation (stages 1+2+3) runs during processing. The image is
  // NOT saved to the gallery yet — it's stored as a "pending capture" in
  // sessionStorage. The orchestrator saves it to the gallery ONLY if
  // validation passes. If validation fails, the image is discarded.
  //
  // MODEL CHECK: Before proceeding, verify the model is downloaded. If not,
  // show a toast "Please download the model first" and don't proceed.
  const saveAndTryOn = () => {
    if (!lastCapture) return;
    if (!modelReady) {
      toast({
        title: "Please download the model first",
        description: "Go to Settings → Model downloads and download a model before capturing.",
        variant: "destructive",
      });
      return;
    }
    // Store the pending capture — the orchestrator will save it to the
    // gallery after validation passes (with passedAllStages: true).
    sessionStorage.setItem(
      "nova_pending_capture",
      JSON.stringify({
        dataUrl: lastCapture,
        sizeKb: lastSizeKb,
        capturedAt: Date.now(),
      }),
    );
    // Don't addSavedImage here — wait for validation.
    // Don't skip stages — the camera-captured image needs full validation.
    sessionStorage.removeItem("nova_skip_stages");
    navigate("/tryon/processing");
  };

  // ─── Try-on with saved image — shows confirmation modal ───────────────
  const tryWithSavedImage = useCallback((img: SavedCaptureImage) => {
    stopCamera();
    if (!product) {
      // Issue 4 fix — use variant: "warning" (amber) so the toast is
      // clearly a friendly warning, not a red error.
      toast({
        title: "Please select a garment first",
        description: "Browse the collection and pick a garment to try on.",
        variant: "warning",
      });
      return; // stay on the camera page — don't navigate away
    }
    setConfirmImage(img);
  }, [product, stopCamera, toast]);

  const confirmTryOn = () => {
    if (!confirmImage) return;
    if (!product) {
      setConfirmImage(null);
      navigate("/products");
      return;
    }
    setActiveCapture(confirmImage.id);
    sessionStorage.setItem("nova_skip_stages", "true");
    setConfirmImage(null);
    navigate("/tryon/processing");
  };

  if (!product) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-4">
        <div className="text-center max-w-sm">
          <div className="h-14 w-14 rounded-full bg-accent/15 text-accent grid place-items-center mx-auto mb-4">
            <Camera className="h-7 w-7" />
          </div>
          <h2 className="font-display text-xl font-medium">Select a product first</h2>
          <p className="text-sm text-muted-foreground mt-2">
            You need to pick a garment before you can try it on.
          </p>
          <button onClick={() => navigate("/products")} className="mt-5 px-6 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
            Browse collection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalHeader
        title={product.name}
        subtitle="Trying on"
        backTo="/products"
      />

      <main className="flex-1 relative overflow-hidden">
        {/* Camera section — full width when sidebar is hidden */}
        <section className="relative bg-foreground/95 overflow-hidden h-[calc(100vh-80px)]">
          <div className="relative h-full w-full">
            <video
              ref={videoRef as React.RefObject<HTMLVideoElement>}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full object-cover ${phase === "camera" || phase === "countdown" ? "opacity-100" : "opacity-0"}`}
            />

            {/* Top overlay — close camera button */}
            {(phase === "camera" || phase === "countdown") && (
              <div className="absolute top-3 left-3 right-3 z-10 flex items-start justify-between gap-2">
                <div className="rounded-full bg-foreground/40 backdrop-blur-md text-primary-foreground px-3 py-1.5 text-[11px] uppercase tracking-widest">
                  {phase === "countdown" ? `Capturing in ${countdown}…` : "Position yourself in frame"}
                </div>
                <button
                  onClick={() => { stopCamera(); setPhase("intro"); }}
                  className="h-9 w-9 rounded-full bg-foreground/40 backdrop-blur-md text-primary-foreground grid place-items-center hover:bg-foreground/60 transition shrink-0"
                  aria-label="Close camera"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Toggle button for saved captures — visible on ALL screen sizes when sidebar is hidden */}
            {!showCaptures && (
              <button
                onClick={() => setShowCaptures(true)}
                className="absolute top-3 right-3 z-10 h-10 px-3 rounded-full bg-foreground/40 backdrop-blur-md text-primary-foreground flex items-center gap-2 text-xs hover:bg-foreground/60 transition"
                style={{ right: phase === "camera" || phase === "countdown" ? "3rem" : "0.75rem" }}
                aria-label="Show saved captures"
              >
                <ImageIcon className="h-4 w-4" />
                <span className="font-medium">{savedImages.length}</span>
              </button>
            )}

            {/* Intro phase */}
            {phase === "intro" && (
              <div className="absolute inset-0 grid place-items-center bg-foreground text-primary-foreground p-6">
                <div className="text-center max-w-md">
                  <h2 className="font-display text-3xl">Ready to try it on?</h2>
                  <p className="text-sm text-primary-foreground/70 mt-3">3-second countdown, then posture check, compression, and AI render.</p>
                  {/* Model status indicator in the intro phase */}
                  {!modelReady && (
                    <div className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs text-accent-foreground flex items-center justify-between gap-3">
                      <div className="text-left">
                        <p className="font-medium text-accent">Model not downloaded</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{activeModel?.name} ({activeModel?.sizeMb} MB) — required for pose validation</p>
                      </div>
                      <button
                        onClick={downloadModel}
                        disabled={downloadingModel}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium disabled:opacity-50"
                      >
                        {downloadingModel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {downloadingModel ? `${Math.round(modelProgress * 100)}%` : "Download"}
                      </button>
                    </div>
                  )}
                  {cameraError && <p className="mt-4 text-xs bg-destructive/15 text-destructive px-3 py-2 rounded">{cameraError}</p>}
                  <button onClick={openCamera} className="mt-6 px-8 h-14 rounded-xl bg-primary text-primary-foreground font-medium">
                    Open camera
                  </button>
                </div>
              </div>
            )}

            {/* Captured preview phase — matches preview app: image + badges + Retake/Save buttons */}
            {phase === "captured-preview" && lastCapture && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-foreground"
              >
                <img src={lastCapture} alt="Your capture" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/95 via-foreground/20 to-foreground/40" />

                {/* Close button — top-right; closes the captured preview and returns to intro */}
                <button
                  onClick={closeCapturedPreview}
                  className="absolute top-3 right-3 sm:top-5 sm:right-5 h-10 w-10 rounded-full bg-foreground/40 backdrop-blur-md text-primary-foreground grid place-items-center hover:bg-foreground/60 transition z-20"
                  aria-label="Close captured preview"
                >
                  <X className="h-5 w-5" />
                </button>

                {/* Captured + size badges — top-left */}
                <div className="absolute top-3 left-3 sm:top-5 sm:left-5 flex items-center gap-2">
                  <span className="rounded-full bg-accent text-accent-foreground px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest">Captured</span>
                  <span className="rounded-full bg-foreground/40 backdrop-blur-md text-primary-foreground px-2.5 py-1 text-[10px] border border-primary-foreground/20">
                    {formatBytes(lastSizeKb)}
                  </span>
                </div>

                {/* Fixed bottom action bar — Retake + Save & Try On (matches preview app) */}
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-6 bg-gradient-to-t from-foreground/90 to-transparent flex gap-2 sm:gap-3">
                  <button
                    onClick={retake}
                    className="flex-1 h-14 rounded-xl bg-foreground/30 backdrop-blur-md text-primary-foreground border border-primary-foreground/30 font-medium flex items-center justify-center gap-2 hover:bg-foreground/40 transition text-sm sm:text-base"
                  >
                    <RefreshCw className="h-5 w-5" /> Retake
                  </button>
                  <button
                    onClick={saveAndTryOn}
                    className="flex-[1.4] h-14 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 text-sm sm:text-base"
                  >
                    <Check className="h-5 w-5" /> Save &amp; try on
                  </button>
                </div>
              </motion.div>
            )}

            {/* Big countdown overlay — centered number + ring, matching preview app */}
            <AnimatePresence>
              {phase === "countdown" && countdown > 0 && (
                <motion.div
                  key={countdown}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.6 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 grid place-items-center pointer-events-none"
                >
                  <div className="relative grid place-items-center">
                    <svg className="absolute h-32 w-32 sm:h-40 sm:w-40 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="oklch(0.98 0.005 60)" strokeWidth="2" strokeOpacity="0.2" />
                      <circle
                        cx="50" cy="50" r="45" fill="none"
                        stroke="oklch(0.78 0.13 80)" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray="283"
                        strokeDashoffset={283 - (283 * countdown) / settings.captureTimerSeconds}
                        style={{ transition: "stroke-dashoffset 1s linear" }}
                      />
                    </svg>
                    <span className="font-display text-6xl sm:text-7xl font-light text-primary-foreground drop-shadow-lg">
                      {countdown}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Capture button */}
            {phase === "camera" && (
              <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                <button
                  onClick={startCountdown}
                  className="h-16 w-16 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-elevated"
                  aria-label="Capture photo"
                >
                  <Camera className="h-7 w-7" />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Slide-in sidebar — SAME pattern on ALL screen sizes (mobile + desktop) */}
        {/* Hidden by default. Opens via the toggle button. Consistent with mobile. */}
        <AnimatePresence>
          {showCaptures && (
            <>
              {/* Backdrop — click to close */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowCaptures(false)}
                className="absolute inset-0 z-20 bg-foreground/50 backdrop-blur-sm"
              />

              {/* Slide-in panel — slides from right on ALL screens */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                className="absolute right-0 top-0 bottom-0 w-[85%] max-w-sm bg-card border-l border-border flex flex-col z-30 shadow-elevated"
              >
                <SavedCapturesPanel
                  savedImages={savedImages}
                  onUse={tryWithSavedImage}
                  onRemove={removeSavedImage}
                  onClose={() => setShowCaptures(false)}
                  onAddPerson={() => setShowAddPerson(true)}
                  showClose={true}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </main>

      {/* ─── Try-on confirmation modal — dual image (garment + photo) ───── */}
      <AnimatePresence>
        {confirmImage && product && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-foreground/70 backdrop-blur-sm p-4"
            onClick={() => setConfirmImage(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-card rounded-2xl shadow-elevated max-w-sm w-full overflow-hidden max-h-[90vh] overflow-y-auto overscroll-contain"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-3 bg-muted">
                {/* Left — garment */}
                <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-card">
                  <img
                    src={resolveProductImage(product)}
                    alt={product.name}
                    onError={(e) => onImageError(e, product.sku)}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  <div className="absolute bottom-1 left-1 right-1 bg-foreground/70 backdrop-blur-md text-primary-foreground text-[9px] px-1.5 py-0.5 rounded text-center truncate">
                    {product.name}
                  </div>
                </div>
                {/* Right — your photo */}
                <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-card">
                  <img
                    src={confirmImage.thumbnailUrl}
                    alt="Your capture"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  <div className="absolute bottom-1 left-1 right-1 bg-foreground/70 backdrop-blur-md text-primary-foreground text-[9px] px-1.5 py-0.5 rounded text-center truncate">
                    Your photo
                  </div>
                </div>
              </div>
              <div className="p-5 text-center">
                <h3 className="font-display text-base font-medium">Try on with this image?</h3>
                <p className="text-xs text-muted-foreground mt-1.5">
                  This will skip validation and go directly to the TryOn AI with{" "}
                  <strong>{product.name}</strong>.
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setConfirmImage(null)}
                    className="flex-1 h-11 rounded-xl border border-border text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmTryOn}
                    className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Camera className="h-4 w-4" /> Yes, try on
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The inline "model not downloaded" banner in the intro phase is the
          single UI for model download status. It hides automatically when
          `modelReady` becomes true (single-source-of-truth via the global
          `loadedModels` set + pub/sub in usePoseDetection). No separate
          popup needed. */}

      {/* ─── Add Person Image modal ──────────────────────────────────────
          Opens the AddCapturePanel (the SAME reusable component used in the
          Captures Gallery) in CONTROLLED mode — the camera page controls
          visibility via `showAddPerson`. The panel runs the same 3-stage
          validation pipeline (person detection → compression → posture)
          and only saves the image when all stages pass. */}
      <AddCapturePanel
        open={showAddPerson}
        onModalOpen={() => stopCamera()}
        onClose={() => setShowAddPerson(false)}
        // Issue 6 fix — hide the "Capture from camera" option inside the
        // Add Person modal because the Try-On Camera page ALREADY has its
        // own camera. Showing it here would be redundant.
        hideCameraOption
      />
    </div>
  );
}

// ─── Saved captures panel ────────────────────────────────────────────────

function SavedCapturesPanel({
  savedImages,
  onUse,
  onRemove,
  onClose,
  onAddPerson,
  showClose = false,
}: {
  savedImages: SavedCaptureImage[];
  onUse: (img: SavedCaptureImage) => void;
  onRemove: (id: string) => void;
  onClose?: () => void;
  /** Opens the AddCapturePanel modal so the user can add a person image
   *  from disk or URL directly from the camera page sidebar. */
  onAddPerson?: () => void;
  showClose?: boolean;
}) {
  // Select mode — same pattern as CapturesGalleryPage (consistent UI)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(savedImages.map((i) => i.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const deleteSelected = () => {
    selectedIds.forEach((id) => onRemove(id));
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  return (
    <>
      <div className="p-4 border-b border-border/60 shrink-0 space-y-2">
        {/* Header — wraps to a new row when content overflows (responsive) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <h2 className="font-display text-sm font-medium truncate">Saved captures</h2>
            <Badge className="shrink-0">{savedImages.length}</Badge>
            {selectMode && selectedIds.size > 0 && (
              <Badge className="shrink-0 text-[10px] bg-primary text-primary-foreground">{selectedIds.size} selected</Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {selectMode ? (
              <>
                <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs gap-1"><CheckSquare className="h-3 w-3" /> All</Button>
                <Button variant="ghost" size="sm" onClick={deselectAll} className="h-7 text-xs gap-1"><Square className="h-3 w-3" /> None</Button>
                <Button variant="ghost" size="sm" onClick={deleteSelected} className="h-7 text-xs gap-1 text-destructive hover:text-destructive" disabled={selectedIds.size === 0}><Trash2 className="h-3 w-3" /> Delete</Button>
                <Button variant="ghost" size="sm" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} className="h-7 text-xs">Cancel</Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectMode(true)}
                  className="h-9 px-2 text-xs gap-1"
                  disabled={savedImages.length === 0}
                >
                  <CheckSquare className="h-3.5 w-3.5" /><span className="hidden sm:inline">Select</span>
                </Button>
                {onAddPerson && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onAddPerson}
                    className="h-9 px-2 text-xs gap-1 text-primary hover:text-primary"
                    aria-label="Add person image"
                  >
                    <UserPlus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Add Person</span>
                  </Button>
                )}
              </>
            )}
            {showClose && (
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onClose} aria-label="Close sidebar">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {selectMode ? "Tap images to select, then delete." : "Tap an image to try it on. Tap preview icon to view fullscreen."}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-boutique p-3 sm:p-4 space-y-3">
        {savedImages.length === 0 ? (
          /* Empty state — show a prominent Add Person CTA so the user
             knows how to get started without capturing from the camera. */
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
            <div className="h-14 w-14 rounded-full bg-accent/15 text-accent grid place-items-center">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium">No saved person images yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add a person photo from your device or a URL to try on garments without using the camera.
              </p>
            </div>
            {onAddPerson && (
              <Button
                onClick={onAddPerson}
                size="sm"
                className="mt-1 gap-1.5"
              >
                <Plus className="h-4 w-4" /> Add person image
              </Button>
            )}
          </div>
        ) : (
          savedImages.map((img) => (
            <SavedCaptureCard
              key={img.id}
              img={img}
              onUse={() => onUse(img)}
              onRemove={() => onRemove(img.id)}
              selectMode={selectMode}
              selected={selectedIds.has(img.id)}
              onToggleSelect={() => toggleSelect(img.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

function SavedCaptureCard({
  img,
  onUse,
  onRemove,
  selectMode,
  selected,
  onToggleSelect,
}: {
  img: SavedCaptureImage;
  onUse: () => void;
  onRemove: () => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [preview, setPreview] = useState(false);

  return (
    <>
      <div className={`group relative rounded-xl overflow-hidden border bg-card transition ${selected ? "border-primary ring-1 ring-primary/30" : "border-border/60"}`}>
        <button
          onClick={() => selectMode && onToggleSelect()}
          className="block w-full text-left"
          aria-label="Saved capture"
        >
          <div className="relative aspect-[3/4] bg-muted">
            <img src={img.thumbnailUrl} alt="Saved capture" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-primary-foreground opacity-0 group-hover:opacity-100 transition">
              <span>{formatRelativeTime(img.capturedAt)}</span>
              <span>{formatBytes(img.sizeKb)}</span>
            </div>
            {/* Checkbox in select mode */}
            {selectMode && (
              <div className="absolute top-2 right-2">
                {selected ? <CheckSquare className="h-6 w-6 text-primary" /> : <Square className="h-6 w-6 text-muted-foreground" />}
              </div>
            )}
          </div>
        </button>
        {/* Per-card action buttons — only in non-select mode */}
        {!selectMode && (
          <>
            <button
              onClick={() => setPreview(true)}
              className="absolute top-2 left-2 h-7 w-7 rounded-full bg-foreground/60 backdrop-blur-md text-primary-foreground grid place-items-center opacity-0 group-hover:opacity-100 transition"
              aria-label="Preview image"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onRemove}
              className="absolute top-2 right-2 h-7 w-7 rounded-full bg-foreground/60 backdrop-blur-md text-primary-foreground grid place-items-center opacity-0 group-hover:opacity-100 transition hover:bg-destructive"
              aria-label="Delete image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {!selectMode && (
          <button onClick={onUse} className="w-full h-9 text-xs bg-primary text-primary-foreground flex items-center justify-center gap-1.5">
            <Camera className="h-3.5 w-3.5" /> Try on with this
          </button>
        )}
      </div>

      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-foreground/95 backdrop-blur-md flex flex-col items-center justify-center p-4"
            onClick={() => setPreview(false)}
          >
            <button className="absolute top-4 right-4 h-10 w-10 rounded-full bg-foreground/40 text-primary-foreground grid place-items-center" aria-label="Close" onClick={() => setPreview(false)}>
              <X className="h-5 w-5" />
            </button>
            <div className="flex-1 relative w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <img src={img.dataUrl} alt="Full preview" className="absolute inset-0 h-full w-full object-contain p-4" />
            </div>
            <div className="flex gap-2 justify-center pt-4" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setPreview(false)} className="px-5 h-11 rounded-xl border border-border text-sm">Close</button>
              <button onClick={() => { setPreview(false); onUse(); }} className="px-5 h-11 rounded-xl bg-primary text-primary-foreground text-sm flex items-center gap-2">
                <Camera className="h-4 w-4" /> Try on with this
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
