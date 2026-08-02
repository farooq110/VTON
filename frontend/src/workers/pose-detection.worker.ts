/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * pose-detection.worker — SHARED WORKER that offloads YOLOv8n-pose model
 * loading + inference from the main thread.
 *
 * ─── WHY SharedWorker? ─────────────────────────────────────────────────
 * A SharedWorker's in-memory state PERSISTS across page refreshes (and
 * across tabs of the same origin). This means transformers.js + the model
 * weights are loaded into the worker's memory ONCE — on the very first
 * app start — and stay loaded for ALL subsequent refreshes and navigations.
 *
 * With a regular Worker, every page refresh destroys the worker, so
 * transformers.js re-imports and the model re-loads from Cache Storage
 * every time — producing "Loading transformers.js from CDN" and
 * "Loading model" log entries on EVERY refresh.
 *
 * With SharedWorker, on refresh:
 *   1. The new page connects to the EXISTING SharedWorker (via a new port).
 *   2. The SharedWorker's `loadedModels` set still has the model.
 *   3. The `load` message handler checks `loadedModels.has(modelId)` → true.
 *   4. It responds with `{ type: "loaded" }` IMMEDIATELY — no actual
 *      loading, no log entries, no CDN fetch, no Cache Storage read.
 *
 * This satisfies the requirement: "load transformers.js and default model
 * ONCE at app runtime, NOT on refresh page."
 *
 * ─── MESSAGE ROUTING ───────────────────────────────────────────────────
 * SharedWorker can have multiple connected ports (one per tab). Messages
 * are routed as follows:
 *   - Broadcast (loaded, progress, log, error): sent to ALL ports.
 *   - Routed (detect-result, status): sent ONLY to the port that sent
 *     the request.
 *
 * This worker:
 *   1. Loads `@huggingface/transformers` from a CDN (esm.sh / jsdelivr).
 *   2. Loads the YOLOv8n-pose model + processor via AutoModel/AutoProcessor.
 *   3. Runs inference on an image and parses the raw ONNX output.
 *   4. Applies NMS (Non-Maximum Suppression) to remove overlapping boxes.
 *
 * MESSAGE PROTOCOL
 * ─────────────────
 * Main → Worker (via port):
 *   { type: "load",   modelId }
 *   { type: "detect", modelId, imageDataUrl, minScore, reqId }
 *   { type: "status" }
 *   { type: "evict",  modelId }
 *
 * Worker → Main (via port or broadcast):
 *   { type: "progress",      modelId, progress }      [broadcast]
 *   { type: "loaded",        modelId }                [broadcast]
 *   { type: "detect-result", reqId, ok: true,  detection }  [routed]
 *   { type: "detect-result", reqId, ok: false, error }     [routed]
 *   { type: "status",        loadedModels }           [routed]
 *   { type: "log",           category, message, level }    [broadcast]
 *   { type: "error",         message }                [broadcast]
 */

/// <reference lib="webworker" />

import type { DetectionModelId } from "@/types";

// ─── Model registry ──────────────────────────────────────────────────── //
const MODEL_REPO: Record<DetectionModelId, string> = {
  "yolov8n-pose": "Xenova/yolov8n-pose",
  "yolov8s-pose": "Xenova/yolov8s-pose",
  "mediapipe-pose": "Xenova/yolov8n-pose",
  "movenet-lightning": "Xenova/yolov8n-pose",
};

const TRANSFORMERS_CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm",
  "https://esm.run/@huggingface/transformers@3.0.2",
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0/+esm",
];

const COCO_KEYPOINT_NAMES = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

const TRANSFORMERS_LOAD_TIMEOUT_MS = 120_000; // 2 min — transformers.js is ~2MB+

// ─── Module-level state (lives in the worker, NOT the main thread) ───── //
const modelCache = new Map<DetectionModelId, { model: any; processor: any }>();
const inFlightLoads = new Map<DetectionModelId, Promise<{ model: any; processor: any }>>();
const loadedModels = new Set<DetectionModelId>();

let transformersModule: any = null;
let transformersLoading: Promise<any> | null = null;
// ─── SINGLE-INIT GUARD ────────────────────────────────────────────────── //
// Ensures transformers.js is fetched from the CDN EXACTLY ONCE per worker
// lifetime, even if multiple "load" + "detect" messages race.
let transformersInitStarted = false;

// ─── CDN module loading ──────────────────────────────────────────────── //
async function loadTransformers(): Promise<any> {
  if (transformersModule) return transformersModule;
  if (transformersLoading) return transformersLoading;
  // SINGLE-INIT GUARD — closes the race window between the `transformersLoading`
  // check above and the assignment below.
  if (transformersInitStarted) {
    while (!transformersLoading) {
      await new Promise((r) => setTimeout(r, 5));
    }
    return transformersLoading;
  }
  transformersInitStarted = true;

  transformersLoading = (async () => {
    for (const url of TRANSFORMERS_CDN_URLS) {
      try {
        postLog("model", `Loading transformers.js from CDN: ${url}`);
        const mod: any = await Promise.race([
          import(/* @vite-ignore */ url),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout (${TRANSFORMERS_LOAD_TIMEOUT_MS / 1000}s) loading transformers.js from ${url}`)),
              TRANSFORMERS_LOAD_TIMEOUT_MS,
            ),
          ),
        ]);
        if (mod && typeof mod.AutoModel === "function") {
          mod.env.allowLocalModels = false;
          postLog("model", `transformers.js loaded from CDN: ${url}`);
          transformersModule = mod;
          return mod;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        postLog("model", `CDN failed, trying next: ${url}: ${msg}`, "warn");
      }
    }
    transformersLoading = null;
    transformersInitStarted = false;
    throw new Error("Could not load transformers.js from any CDN.");
  })();

  return transformersLoading;
}

// ─── NO module-level pre-load ────────────────────────────────────────── //
// PREVIOUSLY, the worker called `loadTransformers()` at module-evaluation
// time (when the worker script first runs). This caused a "preload" log
// entry every time the worker was created — and the worker gets re-created
// on route changes when the last consumer unmounts. Combined with the
// "load" messages from warmDownloadedModels + detect(), this resulted in
// 2-3 transformers.js load attempts (one "preload" + one "load" from
// warming + one "load" from detect).
//
// FIX: We removed the module-level pre-load. transformers.js is now loaded
// EXACTLY ONCE — the first "load" or "detect" message triggers
// `loadTransformers()`, and subsequent calls return the same in-flight
// promise (via `transformersLoading`). The main-thread
// `warmDownloadedModels()` (called once on app startup) sends the first
// "load" message, so transformers.js is loaded at startup — not at
// module-evaluation time.

async function getModelAndProcessor(
  modelId: DetectionModelId,
  onProgress?: (p: number) => void,
): Promise<{ model: any; processor: any }> {
  if (modelCache.has(modelId)) return modelCache.get(modelId)!;
  if (inFlightLoads.has(modelId)) return inFlightLoads.get(modelId)!;

  const loadPromise = (async () => {
    const repo = MODEL_REPO[modelId];
    postLog("model", `Loading model: ${modelId} (repo: ${repo})`);

    const transformers = await loadTransformers();
    const { AutoModel, AutoProcessor } = transformers;

    const progressCb = (data: any) => {
      if (data?.progress != null && onProgress) {
        onProgress(Math.min(1, data.progress / 100));
      }
    };

    const [processor, model] = await Promise.all([
      AutoProcessor.from_pretrained(repo, { progress_callback: progressCb }),
      AutoModel.from_pretrained(repo, { progress_callback: progressCb }),
    ]);

    if (!model || !processor) {
      throw new Error("Model or processor returned undefined");
    }

    modelCache.set(modelId, { model, processor });
    loadedModels.add(modelId);
    postLog("model", `Model loaded: ${modelId}`);
    return { model, processor };
  })();

  inFlightLoads.set(modelId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inFlightLoads.delete(modelId);
  }
}

// ─── NMS (Non-Maximum Suppression) ───────────────────────────────────── //
function computeIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const ax1 = a.x - a.w / 2, ay1 = a.y - a.h / 2, ax2 = a.x + a.w / 2, ay2 = a.y + a.h / 2;
  const bx1 = b.x - b.w / 2, by1 = b.y - b.h / 2, bx2 = b.x + b.w / 2, by2 = b.y + b.h / 2;
  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const union = a.w * a.h + b.w * b.h - intersection;
  return union > 0 ? intersection / union : 0;
}

function nms(
  detections: Array<{ score: number; keypoints: any[]; bbox: any }>,
  iouThreshold = 0.5,
): Array<{ score: number; keypoints: any[]; bbox: any }> {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: Array<{ score: number; keypoints: any[]; bbox: any }> = [];
  for (const det of sorted) {
    let keep = true;
    for (const k of kept) {
      if (computeIoU(det.bbox, k.bbox) > iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) kept.push(det);
  }
  return kept;
}

// ─── YOLOv8-pose output parsing ──────────────────────────────────────── //
function parseYolov8PoseOutput(
  outputTensor: any,
  minScore: number,
  imgWidth: number,
  imgHeight: number,
  nmsIouThreshold: number,
  maxPersons: number,
): { persons: Array<{ score: number; keypoints: any[]; bbox: any }> } {
  const data: Float32Array = outputTensor.data;
  const dims: number[] = outputTensor.dims;

  if (dims.length !== 3) {
    return { persons: [] };
  }

  const numFeatures = dims[1];
  const numAnchors = dims[2];
  const numKp = 17;
  const expectedFeatures = 4 + 1 + numKp * 3;

  if (numFeatures !== expectedFeatures) {
    return { persons: [] };
  }

  const candidates: Array<{ score: number; keypoints: any[]; bbox: any }> = [];

  for (let a = 0; a < numAnchors; a++) {
    const conf = data[4 * numAnchors + a];
    if (conf < minScore) continue;

    const cx = data[0 * numAnchors + a];
    const cy = data[1 * numAnchors + a];
    const w = data[2 * numAnchors + a];
    const h = data[3 * numAnchors + a];

    const keypoints: any[] = [];
    for (let kp = 0; kp < numKp; kp++) {
      const base = 5 + kp * 3;
      const kx = data[base * numAnchors + a] / imgWidth;
      const ky = data[(base + 1) * numAnchors + a] / imgHeight;
      const ks = data[(base + 2) * numAnchors + a];
      keypoints.push({
        name: COCO_KEYPOINT_NAMES[kp] ?? `kp_${kp}`,
        x: kx,
        y: ky,
        score: ks,
      });
    }

    candidates.push({
      score: conf,
      keypoints,
      bbox: { x: cx, y: cy, w, h },
    });
  }

  // NMS with the caller-provided IoU threshold (from personDetectionParams).
  const suppressed = nms(candidates, nmsIouThreshold);
  // Cap to maxPersons (perf guard — prevents huge arrays on crowded frames).
  const capped = suppressed.slice(0, Math.max(1, maxPersons));
  return { persons: capped };
}

// ─── Detection execution ─────────────────────────────────────────────── //
async function runDetection(
  modelId: DetectionModelId,
  imageDataUrl: string,
  minScore: number,
  nmsIouThreshold: number,
  maxPersons: number,
): Promise<{
  kind: "ok" | "no-person" | "multi-person";
  personCount?: number;
  score: number;
  keypoints?: any[];
}> {
  // The model load can take a while on first use (downloading weights from
  // CDN). Use a generous 120s timeout to match the transformers.js timeout.
  const { model, processor } = await Promise.race([
    getModelAndProcessor(modelId, (p) => postProgress(modelId, p)),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Model is taking too long to load (over 120s). Check your network connection.")),
        TRANSFORMERS_LOAD_TIMEOUT_MS,
      ),
    ),
  ]);

  const { RawImage } = transformersModule!;
  const image = await RawImage.fromURL(imageDataUrl);

  const inputs = await processor(image);

  const modelInputs: Record<string, any> = {};
  if (inputs.pixel_values !== undefined) {
    modelInputs.images = inputs.pixel_values;
  }
  for (const [key, value] of Object.entries(inputs)) {
    if (key !== "pixel_values" && key !== "images") {
      modelInputs[key] = value;
    }
  }

  const outputs = await model(modelInputs);

  const outputTensor =
    outputs.output0 ?? outputs.output ?? outputs[Object.keys(outputs)[0]];
  if (!outputTensor) {
    throw new Error("Model output missing detection tensor");
  }

  const { persons } = parseYolov8PoseOutput(
    outputTensor,
    minScore,
    image.width,
    image.height,
    nmsIouThreshold,
    maxPersons,
  );

  if (persons.length === 0) return { kind: "no-person", score: 0 };
  if (persons.length > 1) {
    return { kind: "multi-person", personCount: persons.length, score: persons[0].score };
  }

  const person = persons[0];
  return {
    kind: "ok",
    personCount: 1,
    score: person.score,
    keypoints: person.keypoints,
  };
}

// ─── SharedWorker port management ────────────────────────────────────── //
// All connected ports (one per tab). Broadcast messages go to ALL ports;
// routed messages (detect-result, status) go to the specific port that
// sent the request.
const ports = new Set<MessagePort>();

/** Broadcast a message to every connected port. */
function broadcast(msg: any): void {
  ports.forEach((port) => {
    try {
      port.postMessage(msg);
    } catch {
      // Port might be closed (tab closed / refresh). Remove it.
      ports.delete(port);
    }
  });
}

// ─── SharedWorker connect handler ────────────────────────────────────── //
// fires when a new tab/page connects to this SharedWorker. Each connection
// gets its own MessagePort. The worker's module-level state (modelCache,
// loadedModels, transformersModule) is SHARED across all ports — that's
// the whole point of SharedWorker.
(self as any).onconnect = (e: MessageEvent) => {
  const port: MessagePort = e.ports[0];
  ports.add(port);
  port.start(); // start receiving messages on this port

  port.onmessage = async (e: MessageEvent) => {
    const msg = e.data;
    if (!msg || typeof msg !== "object") return;

    try {
      switch (msg.type) {
        case "load": {
          const modelId = msg.modelId as DetectionModelId;
          // ─── KEY: if the model is already loaded, respond IMMEDIATELY ──
          // This is what makes the worker SILENT on page refresh. The
          // SharedWorker's `loadedModels` set persists across refreshes,
          // so on refresh this branch is taken and NO loading happens —
          // no "Loading transformers.js from CDN", no "Loading model"
          // log entries.
          if (loadedModels.has(modelId)) {
            broadcast({ type: "loaded", modelId });
            return;
          }
          await getModelAndProcessor(modelId, (p) => postProgress(modelId, p));
          broadcast({ type: "loaded", modelId });
          break;
        }

        case "detect": {
          const { modelId, imageDataUrl, minScore, reqId, nmsIouThreshold, maxPersons } = msg;
          try {
            const detection = await runDetection(
              modelId,
              imageDataUrl,
              minScore,
              nmsIouThreshold ?? 0.5,
              maxPersons ?? 10,
            );
            // Routed response — only to the port that asked.
            port.postMessage({
              type: "detect-result",
              reqId,
              ok: true,
              detection,
            });
          } catch (err) {
            port.postMessage({
              type: "detect-result",
              reqId,
              ok: false,
              error: err instanceof Error ? err.message : "Detection failed",
            });
          }
          break;
        }

        case "status": {
          // Routed response — only to the port that asked.
          port.postMessage({
            type: "status",
            loadedModels: Array.from(loadedModels),
          });
          break;
        }

        // SINGLE-INIT HOOK — drops a model from the worker's in-memory
        // cache when the user clicks Uninstall, so the next "load" actually
        // re-fetches the weights. transformers.js itself stays loaded
        // (SINGLE-INIT GUARD) — only the per-model weights get re-read.
        case "evict": {
          const modelId = msg.modelId as DetectionModelId;
          loadedModels.delete(modelId);
          modelCache.delete(modelId);
          inFlightLoads.delete(modelId);
          postLog("model", `Model evicted from worker cache: ${modelId}`);
          break;
        }
      }
    } catch (err) {
      broadcast({
        type: "error",
        message: err instanceof Error ? err.message : "Worker error",
      });
    }
  };
};

// ─── Helpers: broadcast progress + logs to all ports ─────────────────── //
function postProgress(modelId: DetectionModelId, progress: number): void {
  broadcast({ type: "progress", modelId, progress });
}

function postLog(category: string, message: string, level: "info" | "warn" | "error" = "info"): void {
  broadcast({ type: "log", category, message, level });
}

export {};
