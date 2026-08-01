import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { useTryOnOrchestrator } from "@/hooks/useTryOnOrchestrator";
import { useTaglineRotation } from "@/hooks/useTaglineRotation";
import { useProducts } from "@/hooks/useProducts";
import { useToast } from "@/components/ui/toast";

interface LocalStage {
  id: string;
  label: string;
  status: "pending" | "active" | "passed" | "failed";
  detail?: string;
}

const STAGE_ORDER = ["stage1-person-detection", "stage2-compression", "stage3-pose-check", "calling-ai", "tracking-brand"];

export function TryOnProcessingPage() {
  const navigate = useNavigate();
  const { data: products } = useProducts();
  const { settings, savedImages, activeCaptureId, selectedProductId } = useAuthStore();
  const { toast } = useToast();
  // Defensive: ensure products is always an array before .find
  const safeProducts = Array.isArray(products) ? products : [];
  const product = safeProducts.find((p) => p.id === selectedProductId);
  const capture = savedImages.find((i) => i.id === activeCaptureId);
  const skipStages = sessionStorage.getItem("nova_skip_stages") === "true";

  // ─── PENDING CAPTURE (from camera) ────────────────────────────────────
  // When the user captures from the camera, the image is NOT yet in the
  // store — it's stored as a "pending capture" in sessionStorage. The
  // orchestrator saves it to the store AFTER validation passes. So we need
  // to read it from sessionStorage here to display it + run validation.
  const [pendingCapture, setPendingCapture] = useState<{
    dataUrl: string;
    sizeKb: number;
    capturedAt: number;
  } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("nova_pending_capture");
    if (raw) {
      try {
        setPendingCapture(JSON.parse(raw));
      } catch {
        // Best-effort — ignore parse errors.
      }
    }
  }, []);

  // The effective capture: either the store-backed one (saved image) or the
  // pending one (just captured from camera, not yet saved).
  const effectiveCapture = capture ?? (pendingCapture
    ? {
        id: "pending",
        dataUrl: pendingCapture.dataUrl,
        thumbnailUrl: pendingCapture.dataUrl,
        capturedAt: pendingCapture.capturedAt,
        passedAllStages: false,
        sizeKb: pendingCapture.sizeKb,
      }
    : undefined);

  const [stages, setStages] = useState<LocalStage[]>(() =>
    (skipStages ? ["calling-ai", "tracking-brand"] : STAGE_ORDER).map((id) => ({ id, label: id, status: "pending" as const })),
  );
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const startedRef = useRef(false);

  const tagline = useTaglineRotation(settings.taglineRefreshMs, !error);

  const orchestrator = useTryOnOrchestrator({
    onStageChange: (stageId, label, detail) => {
      setStages((prev) => prev.map((s) => {
        if (s.id === stageId) return { ...s, status: "active", label, detail };
        const activeIdx = STAGE_ORDER.indexOf(stageId);
        const myIdx = STAGE_ORDER.indexOf(s.id);
        if (myIdx < activeIdx && s.status !== "passed") return { ...s, status: "passed" };
        return s;
      }));
    },
    onError: (msg) => {
      setError(msg);
      setStages((prev) => prev.map((s) => (s.status === "active" ? { ...s, status: "failed" } : s)));
      // Show a toast for all validation errors (including timeouts) so the
      // user gets immediate feedback.
      toast({
        title: "Validation error",
        description: msg,
        variant: "destructive",
      });
    },
    onResult: () => {
      setStages((prev) => prev.map((s) => ({ ...s, status: "passed" })));
      setTimeout(() => navigate("/tryon/result"), 600);
    },
    onModelStatus: (status, p) => {
      setModelStatus(status);
      if (p != null) setModelProgress(p);
    },
  });

  useEffect(() => {
    if (startedRef.current || !effectiveCapture || !product) return;
    startedRef.current = true;
    // Wrap in try/catch so any unhandled error in the orchestrator surfaces
    // a friendly error instead of leaving the page stuck on "Generating…".
    orchestrator.run(effectiveCapture.dataUrl, product, { skipStages }).catch((e) => {
      const msg = e instanceof Error ? e.message : "Something went wrong during try-on.";
      setError(msg);
    });
  }, [effectiveCapture, product]);

  useEffect(() => {
    if (error) return;
    const id = setInterval(() => setProgress((p) => Math.min(95, p + Math.random() * 4)), 250);
    return () => clearInterval(id);
  }, [error]);

  if (!effectiveCapture || !product) {
    return <div className="min-h-screen grid place-items-center bg-background"><button onClick={() => navigate("/tryon/camera")} className="text-primary underline">Open camera</button></div>;
  }

  // NOTE: When a validation error occurs, we do NOT replace the whole UI
  // with a separate error screen. Instead, we keep the processing UI
  // (image + stages + progress) visible and show the error INLINE as a
  // banner at the top of the stages panel, with "Retake photo" and
  // "Skip & try anyway" buttons. This matches the user's expectation:
  // "keep the UI unchanged, just show the error inside the same interface."

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-20 glass border-b border-border p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Generating</p>
        <h1 className="font-display text-lg truncate">{product.name}</h1>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2">
        <section className="relative bg-foreground overflow-hidden min-h-[50vh] grid place-items-center">
          <img src={effectiveCapture.dataUrl} alt="" className="absolute inset-0 h-full w-full object-cover blur-2xl scale-110 opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-foreground/60 to-foreground" />
          <div className="relative z-10 text-center text-primary-foreground p-6 max-w-md">
            <div className="relative h-32 w-32 mx-auto">
              <div className="absolute inset-0 rounded-full animate-conic" style={{ background: "conic-gradient(from 0deg, transparent, oklch(0.78 0.13 80), transparent 60%)" }} />
              <div className="absolute inset-2 rounded-full bg-foreground/80 grid place-items-center">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-accent/30 to-primary/40" />
              </div>
            </div>
            <p key={tagline} className="mt-6 font-display text-2xl font-light shimmer-text">{tagline}</p>
          </div>
        </section>

        <section className="p-6 sm:p-10 lg:p-14 flex flex-col">
          <h2 className="font-display text-2xl sm:text-3xl">Your fitting is in progress</h2>
          <p className="text-sm text-muted-foreground mt-2">Running {stages.length} stages before sending your photo to the AI.</p>

          {/* ─── INLINE ERROR BANNER ────────────────────────────────────────
              When a validation error occurs, we keep the processing UI
              (image + stages + progress) visible and show the error INLINE
              as a banner here, with "Retake photo" and "Skip & try anyway"
              buttons. The UI is NOT replaced by a separate error screen. */}
          {error && (
            <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-destructive/20 text-destructive grid place-items-center shrink-0">
                  <span className="text-lg leading-none">!</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive">Validation error</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">{error}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate("/tryon/camera")}
                  className="px-4 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
                >
                  Retake photo
                </button>
                <button
                  onClick={() => {
                    sessionStorage.setItem("nova_skip_stages", "true");
                    setError(null);
                    setStages(["calling-ai", "tracking-brand"].map((id) => ({ id, label: id, status: "pending" as const })));
                    startedRef.current = false;
                    setTimeout(() => orchestrator.run(effectiveCapture.dataUrl, product, { skipStages: true }), 100);
                  }}
                  className="px-4 h-10 rounded-lg border border-border text-sm font-medium hover:bg-muted transition"
                >
                  Skip &amp; try anyway
                </button>
              </div>
            </div>
          )}

          {/* Model loading indicator — shown when the YOLOv8n model is downloading */}
          {modelStatus === "loading" && !error && (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Loading detection model…</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  First load downloads ~3 MB. This happens once per session.
                </p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${Math.round(modelProgress * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>Progress</span><span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <ol className="mt-8 space-y-3">
            {stages.map((s) => (
              <li key={s.id} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${s.status === "active" ? "border-accent/40 bg-accent/5" : s.status === "passed" ? "border-primary/20 bg-primary/5" : "border-border/60 bg-card/40"}`}>
                <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                <div className="flex-1">
                  <p className="text-sm">{s.label}</p>
                  {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
