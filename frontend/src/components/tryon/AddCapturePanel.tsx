import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Link2,
  Loader2,
  Lightbulb,
  Maximize2,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useImageCompression } from "@/hooks/useImageCompression";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { useAuthStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import { isModelDownloaded } from "@/lib/model-persistence";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { dataUrlSizeKb, uid } from "@/lib/utils";
import type { SavedCaptureImage } from "@/types";

/**
 * AddCapturePanel — centered modal for adding person images to the saved
 * captures list from disk or URL.
 *
 * Spec (from the Next.js preview):
 *   - "add person modal should open in center"
 *   - "centralize the validation and stages perform on image should be at
 *      single place"
 *   - "when validation and stages show like before step by step in progress type"
 *   - "if it fails short message why it fails and how to fix it"
 *
 * States:
 *   1. Form — pick from disk or paste URL
 *   2. Validating — step-by-step stage progress (Stage 1 person → Stage 2
 *      compression → Stage 3 posture)
 *   3. Success — checkmark + "Image validated & saved"
 *   4. Failure — short title + how-to-fix suggestion + Retry button
 *
 * The 3-stage validation pipeline runs in-place using `usePoseDetection`
 * + `useImageCompression` — keeping the surface area small (no extra hooks
 * to port from the preview). The image is only saved to the store when ALL
 * three stages pass.
 */
export interface AddCapturePanelProps {
  /**
   * CONTROLLED MODE: When `open` is provided, the parent controls the modal
   * visibility. The trigger button is NOT rendered (the parent provides its
   * own button). This is used by the Try-On Camera page's sidebar.
   *
   * UNCONTROLLED MODE: When `open` is NOT provided (undefined), the component
   * manages its own visibility AND renders its own trigger button ("Add Person").
   * This is used by the Captures Gallery page.
   */
  open?: boolean;
  /** Fired when the modal opens — used by the camera screen to release the camera. */
  onModalOpen?: () => void;
  /** Fired when the modal closes (after success, cancel, or backdrop click). */
  onClose?: () => void;
}

type StageStatus = "pending" | "active" | "passed" | "failed";

interface ValidationStage {
  id: string;
  label: string;
  detail?: string;
  status: StageStatus;
}

interface ValidationFailure {
  title: string;
  howToFix: string;
  stageId: string;
}

const MAX_FILE_MB = 25;
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];

export function AddCapturePanel({ open: controlledOpen, onClose, onModalOpen }: AddCapturePanelProps) {
  const settings = useAuthStore((s) => s.settings);
  const addSavedImage = useAuthStore((s) => s.addSavedImage);
  const logActivity = useAuthStore((s) => s.logActivity);
  const { compress } = useImageCompression();
  const { detect, checkPose } = usePoseDetection();
  const { toast } = useToast();

  // CONTROLLED vs UNCONTROLLED mode:
  // - If `controlledOpen` is provided (not undefined), the parent controls
  //   the modal visibility. We don't render the trigger button.
  // - If `controlledOpen` is undefined, we manage our own `internalOpen`
  //   state and render the trigger button (uncontrolled mode).
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? (controlledOpen as boolean) : internalOpen;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [success, setSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [lastSource, setLastSource] = useState<
    { type: "file"; file?: File } | { type: "url"; url?: string } | null
  >(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [stages, setStages] = useState<ValidationStage[]>([
    { id: "stage1", label: "Person detection", status: "pending" },
    { id: "stage2", label: "Image optimisation", status: "pending" },
    { id: "stage3", label: "Posture check", status: "pending" },
  ]);
  const [failure, setFailure] = useState<ValidationFailure | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lock the body's page scroll while the AddCapture modal (or its fullscreen
  // image viewer) is open — prevents the page behind from scrolling when the
  // user scrolls inside the modal body.
  useBodyScrollLock(open || fullscreen);

  const reset = useCallback(() => {
    setStages([
      { id: "stage1", label: "Person detection", status: "pending" },
      { id: "stage2", label: "Image optimisation", status: "pending" },
      { id: "stage3", label: "Posture check", status: "pending" },
    ]);
    setFailure(null);
    setError(null);
  }, []);

  const openModal = () => {
    logger.interaction("Add person image modal opened", { component: "AddCapturePanel" });
    if (!isControlled) setInternalOpen(true);
    setSuccess(false);
    reset();
    onModalOpen?.();
  };

  const closeModal = () => {
    if (isProcessing) return;
    if (!isControlled) setInternalOpen(false);
    setSuccess(false);
    setUrlValue("");
    setPreviewImage(null);
    setLastSource(null);
    reset();
    onClose?.();
  };

  const handlePickFile = () => {
    setError(null);
    setSuccess(false);
    setPreviewImage(null);
    reset();
    fileInputRef.current?.click();
  };

  const setStage = (id: string, patch: Partial<ValidationStage>) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  /**
   * Run the 3-stage validation pipeline on the given data URL.
   * Returns `true` if the image was successfully saved to the store.
   */
  const runValidation = useCallback(
    async (dataUrl: string): Promise<boolean> => {
      setIsProcessing(true);
      setFailure(null);
      try {
        // ─── MODEL STATUS PRE-CHECK ──────────────────────────────────────
        // Before running any stages, verify the required models are downloaded.
        // If not, show an error immediately — don't attempt detection.
        const personModelReady = isModelDownloaded(settings.personDetectionModelId);
        const postureModelReady = isModelDownloaded(settings.postureModelId);
        if (!personModelReady || !postureModelReady) {
          const missing: string[] = [];
          if (!personModelReady) missing.push("Person detection");
          if (!postureModelReady) missing.push("Posture estimation");
          setStage("stage1", { status: "failed", detail: "Model not downloaded" });
          setFailure({
            title: "Please download the model first",
            howToFix: `The following model(s) are not downloaded: ${missing.join(", ")}. Go to Settings → Model downloads and click Download. The default model (YOLOv8n Pose) is recommended.`,
            stageId: "stage1",
          });
          logActivity({
            category: "model",
            label: "Validation blocked — model not downloaded",
            detail: missing.join(", "),
            level: "error",
          });
          return false;
        }

        // STAGE 1 — person existence (uses personDetectionModelId + its params)
        setStage("stage1", { status: "active", detail: `Running ${settings.personDetectionModelId}` });
        const detection = await detect(
          dataUrl,
          settings.personDetectionModelId,
          settings.personDetectionParams.confidenceThreshold,
          {
            nmsIouThreshold: settings.personDetectionParams.nmsIouThreshold,
            maxPersons: settings.personDetectionParams.maxPersons,
          },
        );
        if (detection.kind === "no-person") {
          setStage("stage1", { status: "failed", detail: "No person detected" });
          setFailure({
            title: "No person detected",
            howToFix:
              "Stand in the centre of the frame with your full body visible. Make sure the lighting is bright enough for the model to find you.",
            stageId: "stage1",
          });
          logActivity({
            category: "capture",
            label: "Validation failed — no person",
            level: "warn",
          });
          return false;
        }
        if (detection.kind === "multi-person") {
          setStage("stage1", {
            status: "failed",
            detail: `${detection.personCount} people detected`,
          });
          setFailure({
            title: "Multiple people detected",
            howToFix:
              "Only one person may be in the photo. Step out of frame, or ask others to step aside, then retake.",
            stageId: "stage1",
          });
          logActivity({
            category: "capture",
            label: "Validation failed — multi-person",
            detail: `${detection.personCount} people`,
            level: "warn",
          });
          return false;
        }
        setStage("stage1", {
          status: "passed",
          detail: `Confidence ${Math.round(detection.score * 100)}%`,
        });

        // STAGE 2 — compression under target KB + strip metadata
        setStage("stage2", {
          status: "active",
          detail: `Target ${settings.compression.maxFileSizeKb} KB`,
        });
        const compressed = await compress(dataUrl, settings.compression);
        setStage("stage2", {
          status: "passed",
          detail: `${compressed.sizeKb.toFixed(0)} KB · ${compressed.strategy}`,
        });

        // STAGE 3 — posture check (uses postureModelId, separate from Stage 1)
        setStage("stage3", { status: "active", detail: `Using ${settings.postureModelId}` });
        // Re-run detection on the compressed image to get clean keypoints,
        // using the POSTURE model (not the person-detection model).
        const stage3 = await detect(
          compressed.dataUrl,
          settings.postureModelId,
          settings.personDetectionParams.confidenceThreshold,
          {
            nmsIouThreshold: settings.personDetectionParams.nmsIouThreshold,
            maxPersons: settings.personDetectionParams.maxPersons,
          },
        );
        const keypoints =
          stage3.kind === "ok" ? stage3.keypoints : detection.kind === "ok" ? detection.keypoints : [];
        const pose = checkPose(keypoints, settings.poseThresholds);
        if (!pose.passed) {
          setStage("stage3", { status: "failed", detail: pose.reasons.join(" · ") });
          setFailure({
            title: "Posture check failed",
            howToFix: pose.reasons.join(" "),
            stageId: "stage3",
          });
          logActivity({
            category: "capture",
            label: "Validation failed — posture",
            detail: pose.reasons.join(" "),
            level: "warn",
          });
          return false;
        }
        setStage("stage3", {
          status: "passed",
          detail: `Tilt ${pose.shoulderTiltDeg.toFixed(0)}° · yaw ${pose.faceYawDeg.toFixed(0)}°`,
        });

        // All 3 stages passed — persist to the saved captures list.
        const saved: SavedCaptureImage = {
          id: uid("cap"),
          dataUrl: compressed.dataUrl,
          thumbnailUrl: compressed.dataUrl,
          capturedAt: Date.now(),
          passedAllStages: true,
          sizeKb: compressed.sizeKb,
        };
        addSavedImage(saved);
        logActivity({
          category: "capture",
          label: "Image validated & saved",
          detail: `${compressed.sizeKb.toFixed(0)} KB · all 3 stages passed`,
        });
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Validation failed unexpectedly.";
        setFailure({
          title: "Validation error",
          howToFix: msg,
          stageId: "stage1",
        });
        logActivity({
          category: "capture",
          label: "Validation threw an error",
          detail: msg,
          level: "error",
        });
        // Show a toast for all validation errors (including timeouts) so the
        // user gets immediate feedback even if they're not looking at the
        // modal's failure state.
        toast({
          title: "Validation error",
          description: msg,
          variant: "destructive",
        });
        return false;
      } finally {
        setIsProcessing(false);
      }
    },
    [addSavedImage, checkPose, compress, detect, logActivity, settings, toast],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME.includes(file.type)) {
      const msg = `Unsupported file type: ${file.type || "unknown"}. Use JPEG, PNG, WebP, AVIF, or GIF.`;
      setError(msg);
      return;
    }
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_MB) {
      const msg = `File too large: ${sizeMb.toFixed(1)} MB. Max ${MAX_FILE_MB} MB.`;
      setError(msg);
      return;
    }

    setLastSource({ type: "file", file });
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPreviewImage(dataUrl);
      const ok = await runValidation(dataUrl);
      if (ok) setSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to read file.";
      setError(msg);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddUrl = async () => {
    const url = urlValue.trim();
    if (!url) {
      setError("Please enter a URL.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setError("URL must start with http:// or https://");
      return;
    }

    setLastSource({ type: "url", url });
    setError(null);
    try {
      const dataUrl = await fetchUrlAsDataUrl(url);
      setPreviewImage(dataUrl);
      const ok = await runValidation(dataUrl);
      if (ok) {
        setSuccess(true);
        setUrlValue("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch image from URL. CORS may block this.";
      setError(msg);
    }
  };

  const handleRetry = async () => {
    if (!lastSource) return;
    reset();
    setSuccess(false);
    setError(null);
    if (lastSource.type === "file" && lastSource.file) {
      const dataUrl = await readFileAsDataUrl(lastSource.file);
      const ok = await runValidation(dataUrl);
      if (ok) setSuccess(true);
    } else if (lastSource.type === "url" && lastSource.url) {
      const dataUrl = await fetchUrlAsDataUrl(lastSource.url);
      const ok = await runValidation(dataUrl);
      if (ok) setSuccess(true);
    }
  };

  const handleTryAgain = () => {
    reset();
    setSuccess(false);
    setUrlValue("");
    setPreviewImage(null);
  };

  const showForm = !isProcessing && !success && !failure;
  const showValidating = isProcessing;
  const showSuccess = success && !isProcessing;
  const showFailure = !isProcessing && !!failure && !success;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Trigger — only rendered in UNCONTROLLED mode (when the parent
          doesn't provide an `open` prop). In controlled mode, the parent
          provides its own trigger button and controls visibility via `open`. */}
      {!isControlled && (
        <Button
          variant="outline"
          size="sm"
          onClick={openModal}
          className="gap-1.5 h-9 text-xs"
          disabled={isProcessing}
        >
          {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {isProcessing ? "Validating…" : "Add Person"}
        </Button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-foreground/70 backdrop-blur-sm p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-md bg-card rounded-3xl shadow-elevated max-h-[85vh] flex flex-col overflow-hidden my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-border/60 shrink-0">
                <h2 className="font-display text-lg font-medium">Add person image</h2>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-50"
                  aria-label="Close"
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <ScrollArea className="flex-1 overscroll-contain">
                <div className="p-5">
                  {/* SUCCESS */}
                  {showSuccess && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center py-8 text-center gap-3"
                    >
                      <div className="h-16 w-16 rounded-full bg-primary/10 text-primary grid place-items-center">
                        <CheckCircle2 className="h-8 w-8" />
                      </div>
                      <div>
                        <p className="font-display text-lg font-medium">Image validated & saved</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          All 3 stages passed. The image is now in your saved captures list.
                        </p>
                      </div>
                      <Button onClick={closeModal} className="mt-3 h-10">
                        Done
                      </Button>
                    </motion.div>
                  )}

                  {/* VALIDATING — step-by-step stage progress */}
                  {showValidating && (
                    <div className="py-4 space-y-3">
                      {previewImage && (
                        <div className="relative w-full h-[40vh] sm:h-48 rounded-xl overflow-hidden bg-muted mb-2">
                          <img
                            src={previewImage}
                            alt="Validating"
                            className="absolute inset-0 h-full w-full object-contain"
                          />
                          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm grid place-items-center pointer-events-none">
                            <Loader2 className="h-6 w-6 animate-spin text-primary-foreground" />
                          </div>
                          <button
                            onClick={() => setFullscreen(true)}
                            className="absolute top-2 right-2 h-8 w-8 rounded-full bg-foreground/50 backdrop-blur-md text-primary-foreground grid place-items-center hover:bg-foreground/70 transition z-10"
                            aria-label="View fullscreen"
                          >
                            <Maximize2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      <div className="text-center mb-2">
                        <p className="font-display text-base font-medium">Validating image…</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Running all 3 validation stages before saving.
                        </p>
                      </div>
                      <StageList stages={stages} />
                      <p className="text-[10px] text-muted-foreground text-center pt-2 leading-relaxed">
                        The image will only be saved to the list if ALL stages pass.
                      </p>
                    </div>
                  )}

                  {/* FAILURE — short title + how to fix + image preview + retry */}
                  {showFailure && failure && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="py-4 space-y-4"
                    >
                      <div className="flex flex-col items-center text-center gap-2">
                        <div className="h-14 w-14 rounded-full bg-destructive/10 text-destructive grid place-items-center">
                          <AlertCircle className="h-7 w-7" />
                        </div>
                        <p className="font-display text-base font-medium text-destructive">{failure.title}</p>
                      </div>

                      {previewImage && (
                        <div className="relative w-full h-28 rounded-xl overflow-hidden bg-muted">
                          <img
                            src={previewImage}
                            alt="Failed"
                            className="absolute inset-0 h-full w-full object-contain opacity-60"
                          />
                          <button
                            onClick={() => setFullscreen(true)}
                            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-foreground/50 text-primary-foreground grid place-items-center z-10"
                            aria-label="View fullscreen"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="rounded-xl bg-muted/50 p-3">
                        <StageList stages={stages} />
                      </div>

                      <div className="rounded-xl bg-accent/10 border border-accent/20 p-4 flex gap-3">
                        <Lightbulb className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-foreground">How to fix</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{failure.howToFix}</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button variant="default" onClick={handleRetry} className="flex-1 h-10 gap-2">
                          <RotateCw className="h-4 w-4" />
                          <span className="hidden sm:inline">Retry validation</span>
                          <span className="sm:hidden">Retry</span>
                        </Button>
                        <Button variant="outline" onClick={handleTryAgain} className="h-10 gap-2">
                          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Another</span>
                        </Button>
                        <Button onClick={closeModal} variant="ghost" className="h-10">
                          Close
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* FORM — pick from disk or URL */}
                  {showForm && (
                    <div className="space-y-4">
                      <button
                        onClick={handlePickFile}
                        className="w-full flex items-center gap-3 p-4 rounded-xl border border-dashed border-border hover:border-primary hover:bg-primary/5 transition text-left"
                      >
                        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                          <FolderOpen className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">From device</p>
                          <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, AVIF · max 25 MB</p>
                        </div>
                      </button>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">or</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      <div className="space-y-2">
                        <div className="relative">
                          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={urlValue}
                            onChange={(e) => {
                              setUrlValue(e.target.value);
                              setError(null);
                            }}
                            placeholder="https://example.com/photo.jpg"
                            className="pl-9 h-10 text-xs font-mono"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && urlValue.trim()) handleAddUrl();
                            }}
                          />
                        </div>
                        <Button
                          onClick={handleAddUrl}
                          disabled={!urlValue.trim()}
                          className="w-full h-10 text-xs gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add from URL
                        </Button>
                      </div>

                      <AnimatePresence>
                        {error && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
                          >
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{error}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Added images must pass all 3 validation stages (person detection, image optimisation,
                        posture check) before being saved to the list.
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen image viewer */}
      <AnimatePresence>
        {fullscreen && previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-foreground/95 backdrop-blur-md p-4"
            onClick={() => setFullscreen(false)}
          >
            <button
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-foreground/40 text-primary-foreground grid place-items-center hover:bg-foreground/60 z-10"
              aria-label="Close fullscreen"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="absolute inset-0 grid place-items-center p-4">
              <img
                src={previewImage}
                alt="Full preview"
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Step-by-step stage list — mirrors the TryOnProcessingScreen layout. */
function StageList({ stages }: { stages: ValidationStage[] }) {
  return (
    <ol className="space-y-2">
      {stages.map((s) => (
        <li
          key={s.id}
          className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs transition-colors ${
            s.status === "active"
              ? "border-accent/40 bg-accent/5"
              : s.status === "passed"
                ? "border-primary/20 bg-primary/5"
                : s.status === "failed"
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border/60 bg-card/40"
          }`}
        >
          <div className="h-7 w-7 rounded-full grid place-items-center shrink-0">
            {s.status === "passed" && <CheckCircle2 className="h-4 w-4 text-primary" />}
            {s.status === "active" && <Loader2 className="h-4 w-4 text-accent animate-spin" />}
            {s.status === "failed" && <AlertCircle className="h-4 w-4 text-destructive" />}
            {s.status === "pending" && <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-medium ${s.status === "pending" ? "text-muted-foreground" : "text-foreground"}`}>
              {s.label}
            </p>
            {s.detail && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
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

/** Fetch a remote URL and return its bytes as a data URL. */
async function fetchUrlAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error(`URL did not return an image (got ${blob.type || "unknown"}).`);
  }
  if (blob.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`Image too large: ${(blob.size / 1024 / 1024).toFixed(1)} MB. Max ${MAX_FILE_MB} MB.`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read fetched blob."));
    reader.readAsDataURL(blob);
  });
}

// Re-export so callers can compute display size if needed.
export { dataUrlSizeKb };
