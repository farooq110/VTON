import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { DetectionModelId, PoseThresholds } from "@/types";

/**
 * usePoseDetection — abstraction over Xenova/yolov8n-pose (and future models).
 *
 * Loads `@xenova/transformers` lazily inside the renderer so the 3–12 MB model
 * only downloads when the user actually triggers try-on. The model is cached
 * by the library, so subsequent detections are instant.
 *
 * The hook returns a single `detect()` + `checkPose()` — callers never know
 * which model is active (Dependency Inversion Principle). Add new models by
 * extending the `MODEL_REPO` map below.
 *
 * **Resilience:** The model download can take 5–30s on slow connections.
 * The hook exposes `modelStatus` (`idle` | `loading` | `ready` | `error`) and
 * `modelProgress` (0..1) so the UI can show a loading indicator. `detect()`
 * also has a 60-second timeout — if the model hasn't loaded by then, it throws
 * a user-friendly error instead of hanging forever.
 *
 * **Preload Status:** `isModelCached(modelId)` returns true if the model is
 * already downloaded and cached in the browser (no network fetch needed).
 * The Settings page + camera page use this to show "Downloaded" vs
 * "Not downloaded".
 *
 * **CDN Loading (fixes `registerBackend` error):**
 * The `@xenova/transformers` npm package + Vite's ES module bundling creates
 * a conflict where `onnxruntime-web`'s `registerBackend` function is
 * undefined at runtime. This is a well-known issue — the npm ESM build of
 * `onnxruntime-web` doesn't export its API correctly when bundled by Vite.
 *
 * Fix: load `@xenova/transformers` entirely from CDN via a `<script>` tag.
 * The CDN UMD build correctly initializes the ONNX runtime WASM backend
 * before transformers.js tries to use it. This bypasses Vite's bundling
 * completely — no `optimizeDeps` config needed, no version mismatch issues.
 */

export type PersonDetectionResult =
  | { kind: "ok"; personCount: 1; score: number; keypoints: PoseKeypoint[] }
  | { kind: "no-person"; score: number }
  | { kind: "multi-person"; personCount: number; score: number };

export interface PoseKeypoint {
  name: string;
  x: number;
  y: number;
  score: number;
}

export interface PoseCheckResult {
  passed: boolean;
  shoulderTiltDeg: number;
  faceYawDeg: number;
  facePitchDeg: number;
  bodyVisibility: number;
  reasons: string[];
}

export type ModelStatus = "idle" | "loading" | "ready" | "error";

/**
 * Model repos on HuggingFace Hub.
 *
 * In transformers.js v3, YOLOv8-pose models use the `pose-detection` task
 * (NOT `object-detection`). The `pose-detection` task returns poses with
 * keypoints directly — no need to filter by `label === "person"`.
 *
 * Only YOLOv8 variants are listed because they're the only pose models that
 * exist on HuggingFace in transformers.js format. The old `mediapipe-pose`
 * and `movenet-lightning` entries pointed to non-existent repos (401 errors).
 */
const MODEL_REPO: Record<DetectionModelId, string> = {
  "yolov8n-pose": "Xenova/yolov8n-pose",
  "yolov8s-pose": "Xenova/yolov8s-pose",
  "mediapipe-pose": "Xenova/yolov8n-pose", // fallback to yolov8n (mediapipe repo doesn't exist)
  "movenet-lightning": "Xenova/yolov8n-pose", // fallback to yolov8n (movenet repo doesn't exist)
};

/**
 * CDN URLs for `@huggingface/transformers` v3 — the renamed + upgraded
 * package (formerly `@xenova/transformers`).
 *
 * **Why v3 (not v2.17.x):**
 *   - v2.17 throws `Unsupported model type: yolov8` because YOLOv8 support
 *     was only added in v3.0.0.
 *   - The package was renamed from `@xenova/transformers` to
 *     `@huggingface/transformers` at v3.0.0.
 *
 * **Why the `+esm` endpoint (not `dist/transformers.min.js`):**
 *   The `dist/transformers.min.js` file is a webpack bundle (starts with
 *   `var e,t,n=...`) — it's NOT a proper ESM module. When loaded via dynamic
 *   `import()`, it doesn't export `pipeline` correctly, so the library
 *   appears to load but throws "Unsupported model type: yolov8" (because
 *   it's actually running a stale/cached v2 fallback).
 *
 *   The `+esm` endpoint is bundled by jsDelivr using Rollup into a proper
 *   ESM module with correct `export` statements. This is the ONLY URL that
 *   works reliably with dynamic `import()`.
 *
 * We try multiple CDN `+esm` endpoints in order so if one is slow or blocked,
 * the next is tried automatically.
 */
const TRANSFORMERS_CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm",
  "https://esm.run/@huggingface/transformers@3.0.2",
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0/+esm",
  "https://esm.run/@huggingface/transformers@3.1.0",
];

// Cache the pipeline per-model so we only download once per session
const pipelineCache = new Map<DetectionModelId, any>();
// Track in-flight loads so concurrent callers share the same promise
const inFlightLoads = new Map<DetectionModelId, Promise<any>>();
// Track which models have been successfully loaded (for preload status)
const loadedModels = new Set<DetectionModelId>();

// ─── Global single-source-of-truth state for model cache ────────────── //
// Components subscribe to this via a tiny pub/sub so the Settings page,
// camera page, etc. all see the same "downloaded" status without polling.
type ModelCacheListener = (modelId: DetectionModelId, isCached: boolean) => void;
const modelCacheListeners = new Set<ModelCacheListener>();

function notifyModelCacheChange(modelId: DetectionModelId, isCached: boolean) {
  modelCacheListeners.forEach((fn) => fn(modelId, isCached));
}

/**
 * Loads `@huggingface/transformers` v3 from CDN via dynamic `import()`.
 *
 * v3 ships an ESM browser build (not UMD), so we MUST use dynamic `import()`
 * — a `<script>` tag would throw `Unexpected token 'export'` because the
 * browser would try to parse it as a classic script.
 *
 * The `/* @vite-ignore *\/` comment tells Vite NOT to try bundling this
 * import at build time — it's resolved at runtime from the CDN. This
 * bypasses Vite's ES module bundling entirely, fixing the
 * `Cannot read properties of undefined (reading 'registerBackend')` error.
 *
 * Multiple CDN URLs are tried in order. The first one that successfully
 * loads + exposes a `pipeline` function wins. If all fail, a user-friendly
 * error is thrown.
 */
let transformersLoaded: Promise<any> | null = null;

function loadTransformersFromCDN(): Promise<any> {
  if (transformersLoaded) return transformersLoaded;
  if ((window as any).transformers) {
    const mod = (window as any).transformers;
    mod.env.allowLocalModels = false;
    transformersLoaded = Promise.resolve(mod);
    return transformersLoaded;
  }

  transformersLoaded = (async () => {
    for (const url of TRANSFORMERS_CDN_URLS) {
      try {
        logger.model("Loading transformers.js from CDN", { detail: url });
        // Dynamic import with @vite-ignore so Vite doesn't try to bundle it.
        // 30s timeout via Promise.race so a slow CDN doesn't hang forever.
        const mod: any = await Promise.race([
          import(/* @vite-ignore */ url),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout (30s)")), 30_000),
          ),
        ]);

        if (mod && typeof mod.pipeline === "function") {
          mod.env.allowLocalModels = false;
          // Expose on window so subsequent calls skip the import
          (window as any).transformers = mod;
          logger.model("transformers.js loaded from CDN", { detail: url });
          return mod;
        }
        logger.model("CDN loaded but pipeline missing", { detail: url, level: "warn" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        logger.model("CDN failed, trying next", { detail: `${url}: ${msg}`, level: "warn" });
      }
    }

    transformersLoaded = null; // allow retry on next call
    throw new Error(
      "Could not load the AI model library from any CDN. Check your internet connection and try again. If the problem persists, try a different network.",
    );
  })();

  return transformersLoaded;
}

async function getPipeline(
  modelId: DetectionModelId,
  onProgress?: (p: number) => void,
): Promise<any> {
  if (pipelineCache.has(modelId)) return pipelineCache.get(modelId);
  if (inFlightLoads.has(modelId)) return inFlightLoads.get(modelId)!;

  const loadPromise = (async () => {
    const startTime = Date.now();
    logger.model(`Loading model: ${modelId}`, { detail: `repo: ${MODEL_REPO[modelId]}` });

    // 1. Load transformers.js from CDN (one-time, idempotent).
    const transformers = await loadTransformersFromCDN();
    const { pipeline } = transformers;

    // 2. Create the pipeline using the `object-detection` task.
    //    In @huggingface/transformers v3.0.x, `pose-detection` is NOT a
    //    supported task (only added in v3.1+). YOLOv8-pose models are loaded
    //    via `object-detection` — the model returns bounding boxes + keypoints
    //    for each detected person.
    //    Model weights download from HuggingFace Hub.
    const pipe = await pipeline("object-detection", MODEL_REPO[modelId], {
      progress_callback: (data: any) => {
        if (data?.progress != null && onProgress) {
          onProgress(Math.min(1, data.progress / 100));
        }
      },
    });

    // 3. Verify the pipeline actually loaded (not undefined).
    if (!pipe) {
      throw new Error("Pipeline returned undefined — model load failed silently");
    }

    pipelineCache.set(modelId, pipe);
    loadedModels.add(modelId);
    notifyModelCacheChange(modelId, true);
    logger.model(`Model loaded: ${modelId}`, {
      detail: `Cached in memory · ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      durationMs: Date.now() - startTime,
    });
    return pipe;
  })();

  inFlightLoads.set(modelId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inFlightLoads.delete(modelId);
  }
}

const COCO_KEYPOINT_NAMES = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

const MODEL_LOAD_TIMEOUT_MS = 60_000;

export function usePoseDetection() {
  const lastKeyedRef = useRef<PoseKeypoint[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [activeModelId, setActiveModelId] = useState<DetectionModelId | null>(null);
  // Re-render when cache changes (single source of truth)
  const [, forceRerender] = useState(0);

  // Subscribe to model cache changes so the UI updates immediately when a
  // model finishes downloading.
  const listenerRef = useRef<ModelCacheListener | null>(null);
  if (!listenerRef.current) {
    listenerRef.current = () => forceRerender((n) => n + 1);
    modelCacheListeners.add(listenerRef.current);
  }
  useEffect(() => {
    return () => {
      if (listenerRef.current) modelCacheListeners.delete(listenerRef.current);
    };
  }, []);

  const detect = useCallback(
    async (imageDataUrl: string, modelId: DetectionModelId, minScore = 0.6): Promise<PersonDetectionResult> => {
      setActiveModelId(modelId);
      setModelStatus("loading");
      setModelProgress(0);
      try {
        // Race the model load against a timeout so the UI never hangs forever.
        const pipe = await Promise.race([
          getPipeline(modelId, (p) => setModelProgress(p)),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Model is taking too long to load (over 60s). Check your connection or skip validation.")),
              MODEL_LOAD_TIMEOUT_MS,
            ),
          ),
        ]);
        setModelStatus("ready");
        setModelProgress(1);

        const inferStart = Date.now();
        // `object-detection` pipeline returns an array of detections.
        // Each detection: { label: "person", score: 0.95, bbox: {xmin,ymin,xmax,ymax}, keypoints: [[x,y,s], ...] }
        // YOLOv8-pose models include `keypoints` on each detection object.
        const output = await pipe(imageDataUrl, { threshold: minScore });
        const detections = Array.isArray(output) ? output : [output];
        const persons = detections.filter(
          (d: any) => d.label === "person" && d.score >= minScore,
        );

        logger.model(`Detection complete: ${modelId}`, {
          detail: `${persons.length} person(s) detected · ${(Date.now() - inferStart)}ms inference`,
          durationMs: Date.now() - inferStart,
        });

        if (persons.length === 0) return { kind: "no-person", score: 0 };
        if (persons.length > 1) return { kind: "multi-person", personCount: persons.length, score: persons[0].score };

        // Single person — extract keypoints from the detection object.
        // YOLOv8-pose returns keypoints as [[x, y, score], ...] (17 COCO keypoints)
        const kpsRaw: any[] = persons[0]?.keypoints ?? [];
        const keypoints: PoseKeypoint[] = kpsRaw.map((kp: any, i: number) => {
          // Handle both [x, y, score] array format and {x, y, score} object format
          if (Array.isArray(kp)) {
            return {
              name: COCO_KEYPOINT_NAMES[i] ?? `kp_${i}`,
              x: kp[0],
              y: kp[1],
              score: kp[2],
            };
          }
          return {
            name: COCO_KEYPOINT_NAMES[i] ?? `kp_${i}`,
            x: kp.x ?? 0,
            y: kp.y ?? 0,
            score: kp.score ?? 0,
          };
        });
        lastKeyedRef.current = keypoints;

        return { kind: "ok", personCount: 1, score: persons[0].score, keypoints };
      } catch (e) {
        setModelStatus("error");
        logger.model(`Detection failed: ${modelId}`, {
          detail: e instanceof Error ? e.message : "Unknown error",
          level: "error",
        });
        throw e;
      }
    },
    [],
  );

  const checkPose = useCallback(
    (keypoints: PoseKeypoint[], thresholds: PoseThresholds): PoseCheckResult => {
      const reasons: string[] = [];
      const lShoulder = keypoints.find((k) => k.name === "left_shoulder");
      const rShoulder = keypoints.find((k) => k.name === "right_shoulder");
      const nose = keypoints.find((k) => k.name === "nose");
      const lEar = keypoints.find((k) => k.name === "left_ear");
      const rEar = keypoints.find((k) => k.name === "right_ear");

      let shoulderTiltDeg = 0;
      if (lShoulder && rShoulder) {
        const dy = lShoulder.y - rShoulder.y;
        const dx = lShoulder.x - rShoulder.x;
        shoulderTiltDeg = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
      }

      let faceYawDeg = 0;
      let facePitchDeg = 0;
      if (nose && lEar && rEar) {
        const earMidX = (lEar.x + rEar.x) / 2;
        const earMidY = (lEar.y + rEar.y) / 2;
        faceYawDeg = Math.abs(((nose.x - earMidX) * 180) / Math.PI) * 6;
        facePitchDeg = Math.abs(((nose.y - earMidY) * 180) / Math.PI) * 4;
      }

      const visibleBody = keypoints.filter((k) => k.score >= 0.5).length;
      const bodyVisibility = Math.min(1, visibleBody / keypoints.length);

      if (shoulderTiltDeg > thresholds.shoulderTiltDeg) {
        reasons.push(`Shoulders tilted ${shoulderTiltDeg.toFixed(1)}° — please stand straight.`);
      }
      if (faceYawDeg > thresholds.faceYawDeg) {
        reasons.push(`Head turned ${faceYawDeg.toFixed(1)}° — face the camera.`);
      }
      if (facePitchDeg > thresholds.facePitchDeg) {
        reasons.push(`Head tilted ${facePitchDeg.toFixed(1)}° — keep your chin level.`);
      }
      if (bodyVisibility < thresholds.minBodyVisibility) {
        reasons.push(`Body visibility ${Math.round(bodyVisibility * 100)}% — step back so your full body is visible.`);
      }

      return { passed: reasons.length === 0, shoulderTiltDeg, faceYawDeg, facePitchDeg, bodyVisibility, reasons };
    },
    [],
  );

  /**
   * Preloads a model without running detection. Used by the Settings page +
   * camera page to download models in advance.
   *
   * Returns true on success, false on failure (error is also logged).
   * The `loadedModels` set + `notifyModelCacheChange` ensure every subscribed
   * component re-renders immediately when the download completes.
   */
  const preloadModel = useCallback(
    async (modelId: DetectionModelId): Promise<boolean> => {
      if (loadedModels.has(modelId)) {
        logger.model(`Model already cached: ${modelId}`, { detail: "No download needed" });
        return true;
      }
      setActiveModelId(modelId);
      setModelStatus("loading");
      setModelProgress(0);
      try {
        await getPipeline(modelId, (p) => setModelProgress(p));
        setModelStatus("ready");
        setModelProgress(1);
        // getPipeline already called notifyModelCacheChange + added to loadedModels
        return true;
      } catch (e) {
        setModelStatus("error");
        const msg = e instanceof Error ? e.message : "Unknown error";
        logger.model(`Preload failed: ${modelId}`, { detail: msg, level: "error" });
        return false;
      }
    },
    [],
  );

  return {
    detect,
    checkPose,
    preloadModel,
    modelStatus,
    modelProgress,
    activeModelId,
    /** Returns true if the model is already downloaded + cached in memory. */
    isModelCached: (modelId: DetectionModelId) => loadedModels.has(modelId),
  };
}
