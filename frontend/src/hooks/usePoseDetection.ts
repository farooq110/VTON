import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import {
  isModelDownloaded,
  markModelDownloaded,
  markModelUninstalled,
  uninstallModelCache,
  onModelDownloadChange,
  getDownloadedModels,
  isModelUninstalled,
} from "@/lib/model-persistence";
import type { DetectionModelId, PoseThresholds } from "@/types";

/**
 * usePoseDetection — in-browser pose detection using a WEB WORKER.
 *
 * All heavy work (model download, transformers.js load, ONNX inference, NMS)
 * is delegated to `pose-detection.worker.ts` so the main thread never janks.
 *
 * ─── PERSISTENCE (survives page refresh) ────────────────────────────────
 * The set of downloaded models is tracked in `model-persistence.ts` which
 * mirrors it to localStorage AND verifies against the browser's Cache
 * Storage on startup. So:
 *   - Download a model in Settings → it's marked downloaded
 *   - Refresh the page → the model is STILL marked downloaded (localStorage)
 *   - The worker re-attaches to the existing Cache Storage weights — no
 *     re-download needed
 *
 * ─── SINGLE SOURCE OF TRUTH ─────────────────────────────────────────────
 * Settings page, Try-On Camera page, and validation hooks ALL read from
 * the same `isModelDownloaded()` function. No more "download again?"
 * prompts on the camera page after downloading in settings.
 *
 * ─── SEPARATE MODELS ────────────────────────────────────────────────────
 * The caller passes a `modelId` to both `detect()` and `preloadModel()`.
 * The Settings page passes `personDetectionModelId` for Stage 1 and
 * `postureModelId` for Stage 3 — they can be the same or different.
 * Downloading a model makes it available for BOTH stages (shared cache).
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

export interface DetectOptions {
  /** IoU threshold for NMS (default 0.5). */
  nmsIouThreshold?: number;
  /** Max persons to return (default 10). */
  maxPersons?: number;
}

// ─── Module-level pending-loads map ──────────────────────────────────── //
// SHARED across ALL hook instances. Used by preloadModel() to track
// "load" requests. The worker's central onmessage handler resolves
// these when it receives "loaded" messages.
const pendingLoads = new Map<
  DetectionModelId,
  { resolve: () => void; reject: (e: Error) => void; progressCb?: (p: number) => void }
>();

// ─── Module-level pending-detects map ────────────────────────────────── //
// SHARED across ALL hook instances. This fixes the "first detect stays
// pending" bug: previously, each hook instance had its own
// `pendingDetectsRef` Map. When a component using the hook re-mounted
// (e.g. due to route change or parent re-render), the old instance's
// pending requests were orphaned — the worker eventually posted the
// detect-result, but the new hook instance's listener didn't recognize
// the reqId (it was in the old instance's Map). The promise never
// resolved → "stuck pending".
//
// By making this module-level, ALL hook instances share the same Map.
// The worker's detect-result message is routed to the correct resolve/
// reject callback regardless of which hook instance is currently
// listening.
const pendingDetects = new Map<
  number,
  { resolve: (d: PersonDetectionResult) => void; reject: (e: Error) => void }
>();
let nextReqId = 1;

// ─── Module-level worker singleton (SHARED WORKER — survives refresh) ── //
// A SharedWorker's in-memory state (loaded transformers.js module + model
// weights) PERSISTS across page refreshes and across tabs of the same
// origin. This means transformers.js + the default model are loaded ONCE
// — on the very first app start — and stay loaded for all subsequent
// refreshes. On refresh, the new page connects to the EXISTING
// SharedWorker, which responds with "loaded" immediately without any
// actual loading or log entries.
let workerSingleton: SharedWorker | null = null;

type ModelCacheListener = (modelId: DetectionModelId, isDownloaded: boolean) => void;
const modelCacheListeners = new Set<ModelCacheListener>();

function notifyModelCacheChange(modelId: DetectionModelId, isDownloaded: boolean) {
  modelCacheListeners.forEach((fn) => fn(modelId, isDownloaded));
}

/**
 * Issue 5 fix — exposes the SharedWorker singleton so other hooks (e.g.
 * `useOffscreenCanvas`) can post messages to it without going through
 * `usePoseDetection`. Returns `null` if the worker hasn't been created
 * yet (the caller can call `getWorker()` directly to force creation).
 */
export function getPoseWorker(): SharedWorker | null {
  return workerSingleton;
}

/**
 * Lazily creates the pose-detection SharedWorker. Reused across all hook
 * instances AND across page refreshes (SharedWorker persists).
 *
 * The worker's `port.onmessage` handler is set ONCE (when the worker is
 * created). It routes ALL message types — including `detect-result` and
 * `progress` — using the module-level `pendingDetects` map. This ensures
 * detect results are always delivered to the correct caller, even if the
 * hook instance that initiated the detect has unmounted.
 */
function getWorker(): SharedWorker {
  if (workerSingleton) return workerSingleton;
  workerSingleton = new SharedWorker(
    new URL("../workers/pose-detection.worker.ts", import.meta.url),
    { type: "module", name: "vton-pose-detection" },
  );

  // ─── SINGLE message handler for ALL message types ────────────────────
  // Set on `worker.port` (not `worker` directly) because SharedWorker
  // communicates via MessagePort. This handler is set ONCE when the worker
  // is created and never removed. It handles EVERY message type — loaded,
  // log, error, progress, detect-result — so there's no need for per-hook
  // addEventListener listeners.
  workerSingleton.port.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (!msg || typeof msg !== "object") return;

    switch (msg.type) {
      case "loaded": {
        markModelDownloaded(msg.modelId as DetectionModelId);
        notifyModelCacheChange(msg.modelId as DetectionModelId, true);
        const pendingLoad = pendingLoads.get(msg.modelId as DetectionModelId);
        if (pendingLoad) {
          pendingLoads.delete(msg.modelId as DetectionModelId);
          pendingLoad.resolve();
        }
        break;
      }
      case "progress": {
        const pl = pendingLoads.get(msg.modelId as DetectionModelId);
        if (pl?.progressCb) {
          pl.progressCb(msg.progress);
        }
        break;
      }
      case "detect-result": {
        const pending = pendingDetects.get(msg.reqId);
        if (!pending) return;
        pendingDetects.delete(msg.reqId);
        if (msg.ok) {
          pending.resolve(msg.detection as PersonDetectionResult);
        } else {
          pending.reject(new Error(msg.error ?? "Detection failed"));
        }
        break;
      }
      case "log": {
        const level = msg.level as "info" | "warn" | "error";
        const consoleMsg = `[WORKER][${msg.category}] ${msg.message}`;
        if (level === "error") console.error(consoleMsg);
        else if (level === "warn") console.warn(consoleMsg);
        else console.log(consoleMsg);
        logger.model(`[worker] ${msg.message}`, { level });
        break;
      }
      case "error": {
        logger.model(`[worker] ${msg.message}`, { level: "error" });
        break;
      }
    }
  };

  // SharedWorker-level error handler (fires if the worker itself crashes
  // or fails to load). Per-port errors are handled by port.onmessage
  // (errors arrive as { type: "error", message } messages).
  workerSingleton.onerror = (err: Event) => {
    const msg = (err as ErrorEvent)?.message ?? "unknown error";
    logger.model(`[worker] fatal error: ${msg}`, { level: "error" });
  };

  // Start receiving messages on the port. (Setting port.onmessage above
  // implicitly calls start(), but we call it explicitly for clarity.)
  workerSingleton.port.start();

  return workerSingleton;
}

export function usePoseDetection() {
  const lastKeyedRef = useRef<PoseKeypoint[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [activeModelId, setActiveModelId] = useState<DetectionModelId | null>(null);
  // Force a re-render whenever the persistence layer notifies a change.
  const [, forceRerender] = useState(0);

  // ─── Subscribe to persistence-layer changes (mount-once).
  // The worker's onmessage handler is set ONCE at module level (in
  // getWorker) and handles ALL message types using the module-level
  // `pendingDetects` map. No per-hook listener is needed — this
  // eliminates the "first detect stays pending" bug.
  useEffect(() => {
    // Ensure the worker exists (creates it if this is the first consumer).
    getWorker();

    // Subscribe to persistence-layer changes (download / uninstall from
    // ANY hook instance or even from outside the hook).
    const cacheListener: ModelCacheListener = () => forceRerender((n) => n + 1);
    modelCacheListeners.add(cacheListener);
    const persistUnsub = onModelDownloadChange(cacheListener);

    return () => {
      // Only remove the persistence subscription — do NOT terminate the
      // worker and do NOT remove the worker's onmessage handler. The
      // worker stays alive for the whole session with its handler intact.
      modelCacheListeners.delete(cacheListener);
      persistUnsub();
    };
  }, []); // ← empty deps = mount-once

  /**
   * Runs person detection on an image. Returns the detection result
   * (ok / no-person / multi-person) + keypoints if a person is found.
   *
   * The `modelId` parameter lets the caller pick WHICH model to use:
   *   - Stage 1 (person detection) → pass `personDetectionModelId`
   *   - Stage 3 (posture) → pass `postureModelId`
   * Both can be the same model — the download is shared.
   *
   * MODEL STATUS CHECK: If the model is NOT marked as downloaded (via the
   * persistence layer), this throws an error "Please download the model
   * first" — it does NOT auto-download. The caller (useImageValidation,
   * AddCapturePanel, etc.) should catch this and show the error to the user.
   *
   * MODEL LOADS ONLY ONCE: If the model IS downloaded, we post "detect"
   * directly. The worker's `runDetection` → `getModelAndProcessor`:
   *   - Returns instantly if the model is in the worker's in-memory cache
   *     (warm from startup or previous detection)
   *   - Loads from the browser's Cache Storage (fast, no network) if the
   *     weights are cached but not in memory
   *   - Downloads from the CDN (slow, network) only if neither cache has it
   *
   * DETECTION TIMEOUT: 120s. The first detection after app startup may need
   * to load the model weights from Cache Storage into the worker's memory
   * (which can take 5-15s for a 3MB model). Subsequent detections use the
   * in-memory cache and are fast (<1s).
   */
  const detect = useCallback(
    async (
      imageDataUrl: string,
      modelId: DetectionModelId,
      minScore = 0.6,
      opts?: DetectOptions,
    ): Promise<PersonDetectionResult> => {
      setActiveModelId(modelId);

      // ─── MODEL STATUS CHECK ────────────────────────────────────────────
      // If the model is NOT downloaded, throw an error immediately. Do NOT
      // auto-download — the user must download it from Settings first.
      // The caller catches this and shows "Please download the model first".
      if (!isModelDownloaded(modelId)) {
        const errMsg = "Please download the model first from Settings before capturing or uploading an image.";
        logger.model(`Detection blocked — model not downloaded: ${modelId}`, {
          detail: errMsg,
          level: "error",
          tip: "Go to Settings → Model downloads → click Download next to a model. The default model (YOLOv8n Pose) is recommended and auto-downloads on app startup.",
        });
        throw new Error(errMsg);
      }

      try {
        const worker = getWorker();
        setModelStatus("ready");
        setModelProgress(1);

        // Post "detect" directly — the worker's runDetection will use the
        // in-memory cache if warm, or load from Cache Storage (fast, no
        // network re-download). If neither cache has it (shouldn't happen
        // since we checked isModelDownloaded above), it downloads from CDN.
        //
        // Uses the MODULE-LEVEL `pendingDetects` map + `nextReqId` counter
        // so the result is routed to the correct resolve/reject callback
        // even if this hook instance unmounts before the worker responds.
        const reqId = nextReqId++;
        const result = await new Promise<PersonDetectionResult>((resolve, reject) => {
          pendingDetects.set(reqId, { resolve, reject });
          worker.port.postMessage({
            type: "detect",
            modelId,
            imageDataUrl,
            minScore,
            reqId,
            nmsIouThreshold: opts?.nmsIouThreshold ?? 0.5,
            maxPersons: opts?.maxPersons ?? 10,
          });

          // 30s timeout — transformers.js + the model are pre-loaded on app
          // startup (worker pre-load + warmDownloadedModels), so detection
          // should take <5s. If it exceeds 30s, something is wrong — reject
          // with a timeout error so the UI can surface it.
          setTimeout(() => {
            if (pendingDetects.has(reqId)) {
              pendingDetects.delete(reqId);
              reject(new Error("Validation timed out (30s). The model may still be loading. Please try again in a few seconds."));
            }
          }, 30_000);
        });

        if (result.kind === "ok" && result.keypoints) {
          lastKeyedRef.current = result.keypoints;
        }

        logger.model(`Detection complete: ${modelId}`, {
          detail:
            result.kind === "ok"
              ? `1 person detected · score ${(result.score * 100).toFixed(0)}%`
              : result.kind === "multi-person"
                ? `${result.personCount} persons detected`
                : "no person detected",
        });

        return result;
      } catch (e) {
        setModelStatus("error");
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        logger.model(`Detection failed: ${modelId}`, {
          detail: errMsg,
          level: "error",
          tip: "If this is the first detection after app startup, the model may still be loading into memory. Wait a few seconds and try again. If the problem persists, check your network connection or re-download the model in Settings.",
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
   * Downloads a model (or no-ops if already downloaded). The download is
   * SHARED — once a model is downloaded, it's available for both Stage 1
   * (person detection) and Stage 3 (posture), regardless of which section
   * triggered the download.
   */
  const preloadModel = useCallback(
    async (modelId: DetectionModelId): Promise<boolean> => {
      if (isModelDownloaded(modelId)) {
        logger.model(`Model already downloaded: ${modelId}`, { detail: "No download needed" });
        return true;
      }
      setActiveModelId(modelId);
      setModelStatus("loading");
      setModelProgress(0);
      try {
        const worker = getWorker();

        // If a load is already in-flight for this model (e.g. from
        // warmDownloadedModels), piggyback on it instead of sending a
        // duplicate "load" message. This prevents the "load + load + load"
        // triple-trigger issue.
        let loadEntry = pendingLoads.get(modelId);
        if (!loadEntry) {
          // Create a new pending load entry + post "load" to the worker.
          loadEntry = {
            resolve: () => {},
            reject: () => {},
            progressCb: (p: number) => setModelProgress(p),
          };
          // We need to set up the promise BEFORE posting the message so the
          // central onmessage handler can resolve it.
          const loadPromise = new Promise<void>((resolve, reject) => {
            loadEntry!.resolve = resolve;
            loadEntry!.reject = reject;
          });
          pendingLoads.set(modelId, loadEntry);
          worker.port.postMessage({ type: "load", modelId });

          // Timeout — don't hang forever.
          setTimeout(() => {
            const entry = pendingLoads.get(modelId);
            if (entry) {
              pendingLoads.delete(modelId);
              entry.reject(new Error("Model load timed out (120s). Check your network connection."));
            }
          }, 120_000);

          await loadPromise;
        } else {
          // A load is already in-flight — piggyback on it. Update the
          // progressCb so this caller's UI also shows progress.
          loadEntry.progressCb = (p: number) => setModelProgress(p);
          // Wait for the existing load to complete. We need to create a
          // new promise that resolves when the existing loadEntry resolves.
          await new Promise<void>((resolve, reject) => {
            const origResolve = loadEntry!.resolve;
            const origReject = loadEntry!.reject;
            loadEntry!.resolve = () => { origResolve(); resolve(); };
            loadEntry!.reject = (e: Error) => { origReject(e); reject(e); };
          });
        }

        // markModelDownloaded is called by the worker's central onmessage
        // handler when it posts { type: "loaded" }.
        markModelDownloaded(modelId);
        setModelStatus("ready");
        setModelProgress(1);
        return true;
      } catch (e) {
        setModelStatus("error");
        const msg = e instanceof Error ? e.message : "Unknown error";
        logger.model(`Download failed: ${modelId}`, {
          detail: msg,
          level: "error",
          tip: "Check your internet connection. The model loads from a CDN (jsdelivr/esm.sh). If one CDN is blocked, the worker tries alternatives automatically.",
        });
        return false;
      }
    },
    [],
  );

  /**
   * Uninstalls a model — removes it from the tracking set AND deletes the
   * weight files from the browser's Cache Storage. Posts an "evict"
   * message to the worker so the worker drops the model from its in-memory
   * `loadedModels` / `modelCache` too. transformers.js itself stays loaded
   * (SINGLE-INIT GUARD) — only the per-model weights get re-read on next
   * download.
   */
  const uninstallModel = useCallback(
    async (modelId: DetectionModelId): Promise<boolean> => {
      logger.model(`Uninstalling model: ${modelId}`);
      const ok = await uninstallModelCache(modelId);
      markModelUninstalled(modelId);
      notifyModelCacheChange(modelId, false);
      try {
        const worker = getWorker();
        worker.port.postMessage({ type: "evict", modelId });
      } catch {
        // Best-effort.
      }
      if (ok) {
        logger.model(`Model uninstalled: ${modelId}`);
      } else {
        logger.model(`Model uninstall partial: ${modelId}`, {
          level: "warn",
          tip: "The model was removed from the tracking list, but some cache files may remain. Clear site data in your browser settings to fully remove them.",
        });
      }
      return ok;
    },
    [],
  );

  /**
   * Issue 2 fix — zero-copy transferable-frame detection.
   *
   * Accepts an `ImageData` (or anything shaped like one) and transfers
   * its underlying `ArrayBuffer` to the worker via the postMessage
   * transfer list. This avoids serialising a base64 data URL on every
   * frame, which was the main source of GC pauses at 30+ FPS.
   *
   * Use this instead of `detect()` when you have a live canvas frame
   * (e.g. from `ctx.getImageData(0, 0, w, h)` in a requestAnimationFrame
   * loop). For static uploads / data URLs, keep using `detect()`.
   *
   * NOTE: the caller's `ImageData.data.buffer` is TRANSFERRED — the
   * caller must NOT touch it after calling this. A fresh `ImageData`
   * should be created for the next frame (which `getImageData` does
   * automatically).
   */
  const detectFrame = useCallback(
    async (
      imageData: { data: Uint8ClampedArray; width: number; height: number },
      modelId: DetectionModelId,
      minScore = 0.6,
      opts?: DetectOptions,
    ): Promise<PersonDetectionResult> => {
      setActiveModelId(modelId);

      if (!isModelDownloaded(modelId)) {
        const errMsg = "Please download the model first from Settings before capturing or uploading an image.";
        logger.model(`Detection blocked — model not downloaded: ${modelId}`, {
          detail: errMsg,
          level: "error",
          tip: "Go to Settings → Model downloads → click Download next to a model.",
        });
        throw new Error(errMsg);
      }

      try {
        const worker = getWorker();
        setModelStatus("ready");
        setModelProgress(1);

        // Detach the buffer from the caller's ImageData and transfer
        // ownership to the worker. After this line, `imageData.data`
        // becomes a zero-length view — the caller must allocate a fresh
        // ImageData for the next frame.
        const buffer = imageData.data.buffer;

        const reqId = nextReqId++;
        const result = await new Promise<PersonDetectionResult>((resolve, reject) => {
          pendingDetects.set(reqId, { resolve, reject });
          worker.port.postMessage(
            {
              type: "detect-frame",
              modelId,
              buffer,
              width: imageData.width,
              height: imageData.height,
              minScore,
              reqId,
              nmsIouThreshold: opts?.nmsIouThreshold ?? 0.5,
              maxPersons: opts?.maxPersons ?? 10,
            },
            [buffer], // ← zero-copy transfer list
          );

          setTimeout(() => {
            if (pendingDetects.has(reqId)) {
              pendingDetects.delete(reqId);
              reject(new Error("Validation timed out (30s). The model may still be loading."));
            }
          }, 30_000);
        });

        if (result.kind === "ok" && result.keypoints) {
          lastKeyedRef.current = result.keypoints;
        }

        logger.model(`Frame detection complete: ${modelId}`, {
          detail:
            result.kind === "ok"
              ? `1 person detected · score ${(result.score * 100).toFixed(0)}%`
              : result.kind === "multi-person"
                ? `${result.personCount} persons detected`
                : "no person detected",
        });

        return result;
      } catch (e) {
        setModelStatus("error");
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        logger.model(`Frame detection failed: ${modelId}`, {
          detail: errMsg,
          level: "error",
        });
        throw e;
      }
    },
    [],
  );

  return {
    detect,
    detectFrame,
    checkPose,
    preloadModel,
    uninstallModel,
    modelStatus,
    modelProgress,
    activeModelId,
    /** SINGLE SOURCE OF TRUTH — reads from the persistence layer. */
    isModelCached: (modelId: DetectionModelId) => isModelDownloaded(modelId),
  };
}

// ─── Module-level warming function ───────────────────────────────────── //
/**
 * GUARD: ensures warming only runs ONCE per app session. Multiple calls
 * (e.g. from React StrictMode double-invoked effects, or route changes)
 * return immediately without re-sending "load" messages to the worker.
 * This is the KEY fix for the "triple trigger" issue — the worker was
 * receiving 3 "load" messages because warmDownloadedModels was called
 * multiple times.
 */
let warmingStarted = false;

/**
 * Warms the worker's in-memory cache by sending "load" messages for every
 * model marked as downloaded in the persistence layer. Called once on app
 * startup (from App.tsx) so the model is loaded into the worker's memory
 * IMMEDIATELY — the first detection doesn't have to wait for a Cache Storage
 * read.
 *
 * GUARDED: This function only runs ONCE per app session (module-level
 * `warmingStarted` flag). Subsequent calls are no-ops. This prevents the
 * "triple trigger" issue where React StrictMode + route changes caused
 * multiple "load" messages to be sent to the worker.
 *
 * UNINSTALLED MODELS: Models the user has explicitly uninstalled are
 * skipped — they are NOT auto-re-downloaded. Only a manual "Download"
 * click in Settings re-downloads them.
 *
 * AUTO-DOWNLOAD DEFAULT: If NO models are downloaded AND the default model
 * has NOT been uninstalled, we auto-download it so the app works
 * out-of-the-box. If the user has uninstalled the default, we respect that
 * — no auto-download.
 */
export async function warmDownloadedModels(
  defaultPersonModelId: DetectionModelId,
  defaultPostureModelId?: DetectionModelId,
): Promise<void> {
  // ─── GUARD: only run once per main-thread session ───────────────────
  // NOTE: On page refresh, the main thread module is re-evaluated so this
  // guard resets. However, the SHARED WORKER's `loadedModels` set persists
  // across refreshes. So on refresh, the "load" messages below are sent,
  // but the worker responds with "loaded" IMMEDIATELY (no actual loading,
  // no log entries). This is the desired behaviour: transformers.js + the
  // model are loaded ONCE on the first app start, and stay loaded for all
  // subsequent refreshes.
  if (warmingStarted) {
    return;
  }
  warmingStarted = true;

  try {
    const downloaded = getDownloadedModels();
    const worker = getWorker();

    // If no models are downloaded at all, auto-download the default(s) —
    // BUT ONLY if they haven't been explicitly uninstalled.
    if (downloaded.size === 0) {
      const modelsToDownload = new Set<DetectionModelId>();
      if (!isModelUninstalled(defaultPersonModelId)) {
        modelsToDownload.add(defaultPersonModelId);
      }
      if (defaultPostureModelId && !isModelUninstalled(defaultPostureModelId)) {
        modelsToDownload.add(defaultPostureModelId);
      }

      if (modelsToDownload.size === 0) {
        return;
      }

      // Send "load" messages silently. The WORKER will log the actual
      // download progress (from CDN) — we don't need to log here.
      for (const modelId of modelsToDownload) {
        worker.port.postMessage({ type: "load", modelId });
      }
      return;
    }

    // ─── SILENT WARMING ────────────────────────────────────────────────
    // Send "load" messages for each downloaded model. On the FIRST app
    // start, the SharedWorker actually loads them (and logs the progress).
    // On REFRESH, the SharedWorker already has them in memory, so it
    // responds with "loaded" immediately — no loading, no logs, no CDN
    // fetch. This is the key benefit of SharedWorker: the warming is a
    // no-op on refresh.
    for (const modelId of downloaded) {
      worker.port.postMessage({ type: "load", modelId });
    }
  } catch (err) {
    logger.model(`Model warming failed`, {
      detail: err instanceof Error ? err.message : "Unknown error",
      level: "warn",
    });
  }
}
