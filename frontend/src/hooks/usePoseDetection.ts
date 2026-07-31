import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { DetectionModelId, PoseThresholds } from "@/types";

/**
 * usePoseDetection — in-browser pose detection using `@huggingface/transformers`
 * with `AutoModel` + `AutoProcessor` (raw ONNX inference).
 *
 * **Why AutoModel (not pipeline())?**
 * The `pipeline()` function checks the model's `model_type` against a registry
 * of supported architectures and throws `Unsupported model type: yolov8` for
 * `Xenova/yolov8n-pose`. However, the underlying ONNX model CAN be loaded +
 * run via `AutoModel.from_pretrained()` which skips the pipeline-task check.
 *
 * **Output parsing:**
 * YOLOv8-pose raw ONNX output shape: [1, 56, num_anchors]
 *   - 56 = 4 (bbox: cx, cy, w, h) + 1 (confidence) + 51 (17 keypoints × 3)
 *   - Each anchor is a candidate detection
 *   - We filter by confidence threshold + apply NMS (Non-Maximum Suppression)
 *     to remove overlapping detections
 *   - The confidence is at index 4 of each anchor's 56-value vector
 *   - WITHOUT proper NMS, every anchor above threshold counts as a "person"
 *     → causes false "multi-person" errors (10, 40, etc.)
 *
 * **Loading:** `@huggingface/transformers@3.0.2` loaded from CDN `+esm` endpoint.
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

const MODEL_LOAD_TIMEOUT_MS = 60_000;

// ─── Module-level caches ────────────────────────────────────────────── //
const modelCache = new Map<DetectionModelId, { model: any; processor: any }>();
const inFlightLoads = new Map<DetectionModelId, Promise<{ model: any; processor: any }>>();
const loadedModels = new Set<DetectionModelId>();

type ModelCacheListener = (modelId: DetectionModelId, isCached: boolean) => void;
const modelCacheListeners = new Set<ModelCacheListener>();

function notifyModelCacheChange(modelId: DetectionModelId, isCached: boolean) {
  modelCacheListeners.forEach((fn) => fn(modelId, isCached));
}

// ─── CDN module loading ────────────────────────────────────────────── //
let transformersModule: any = null;
let transformersLoading: Promise<any> | null = null;

async function loadTransformers(): Promise<any> {
  if (transformersModule) return transformersModule;
  if (transformersLoading) return transformersLoading;

  transformersLoading = (async () => {
    for (const url of TRANSFORMERS_CDN_URLS) {
      try {
        logger.model("Loading transformers.js from CDN", { detail: url });
        const mod: any = await Promise.race([
          import(/* @vite-ignore */ url),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout (30s)")), 30_000),
          ),
        ]);
        if (mod && typeof mod.AutoModel === "function") {
          mod.env.allowLocalModels = false;
          (window as any).transformers = mod;
          logger.model("transformers.js loaded from CDN", { detail: url });
          transformersModule = mod;
          return mod;
        }
        logger.model("CDN loaded but AutoModel missing", { detail: url, level: "warn" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        logger.model("CDN failed, trying next", { detail: `${url}: ${msg}`, level: "warn" });
      }
    }
    transformersLoading = null;
    throw new Error("Could not load transformers.js from any CDN. Check your internet connection.");
  })();

  return transformersLoading;
}

/**
 * Loads model + processor via AutoModel (bypasses pipeline() task-check).
 */
async function getModelAndProcessor(
  modelId: DetectionModelId,
  onProgress?: (p: number) => void,
): Promise<{ model: any; processor: any }> {
  if (modelCache.has(modelId)) return modelCache.get(modelId)!;
  if (inFlightLoads.has(modelId)) return inFlightLoads.get(modelId)!;

  const loadPromise = (async () => {
    const startTime = Date.now();
    const repo = MODEL_REPO[modelId];
    logger.model(`Loading model: ${modelId}`, { detail: `repo: ${repo} (via AutoModel)` });

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
    notifyModelCacheChange(modelId, true);
    logger.model(`Model loaded: ${modelId}`, {
      detail: `Cached in memory · ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      durationMs: Date.now() - startTime,
    });
    return { model, processor };
  })();

  inFlightLoads.set(modelId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inFlightLoads.delete(modelId);
  }
}

/**
 * Computes Intersection over Union (IoU) between two bounding boxes.
 * Used for NMS (Non-Maximum Suppression) to remove overlapping detections.
 */
function computeIoU(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const ax1 = a.x - a.w / 2, ay1 = a.y - a.h / 2, ax2 = a.x + a.w / 2, ay2 = a.y + a.h / 2;
  const bx1 = b.x - b.w / 2, by1 = b.y - b.h / 2, bx2 = b.x + b.w / 2, by2 = b.y + b.h / 2;

  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const union = a.w * a.h + b.w * b.h - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Non-Maximum Suppression — removes overlapping detections, keeping only
 * the highest-confidence one in each cluster.
 */
function nms(detections: Array<{ score: number; keypoints: PoseKeypoint[]; bbox: any }>, iouThreshold = 0.5): Array<{ score: number; keypoints: PoseKeypoint[]; bbox: any }> {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: Array<{ score: number; keypoints: PoseKeypoint[]; bbox: any }> = [];
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

/**
 * Parses the raw YOLOv8-pose output tensor into detections.
 *
 * Output shape: [1, 56, num_anchors] (e.g., [1, 56, 8400] for 640×640 input)
 *   - dim[1] = 56 features per anchor:
 *     [0..3] = bbox (cx, cy, w, h) — normalized to 0..1
 *     [4]    = confidence score (0..1)
 *     [5..56] = 17 keypoints × 3 (x, y, score) — in pixel coords of 640×640 input
 *   - dim[2] = num_anchors (8400 for 640×640)
 *
 * The data layout is [feature, anchor] — i.e., data[anchor_idx + feature_idx * num_anchors]
 *
 * Steps:
 *   1. Extract all anchors with confidence >= minScore
 *   2. Apply NMS (IoU > 0.5) to remove overlapping boxes
 *   3. Extract keypoints from the top detections
 */
function parseYolov8PoseOutput(
  outputTensor: any,
  minScore: number,
  imgWidth: number,
  imgHeight: number,
): { persons: Array<{ score: number; keypoints: PoseKeypoint[]; bbox: any }> } {
  const data: Float32Array = outputTensor.data;
  const dims: number[] = outputTensor.dims;

  // Expected: [1, 56, num_anchors]
  if (dims.length !== 3) {
    logger.model(`Unexpected YOLOv8 output dims: ${JSON.stringify(dims)}`, { level: "warn" });
    return { persons: [] };
  }

  const numFeatures = dims[1]; // 56
  const numAnchors = dims[2];  // 8400
  const numKp = 17;
  const expectedFeatures = 4 + 1 + numKp * 3; // 56

  if (numFeatures !== expectedFeatures) {
    logger.model(`Unexpected features: ${numFeatures} (expected ${expectedFeatures})`, { level: "warn" });
    return { persons: [] };
  }

  // Step 1: Extract candidate detections with confidence >= minScore
  const candidates: Array<{ score: number; keypoints: PoseKeypoint[]; bbox: any }> = [];

  for (let a = 0; a < numAnchors; a++) {
    // Confidence is at feature index 4, laid out as data[4 * numAnchors + a]
    const conf = data[4 * numAnchors + a];
    if (conf < minScore) continue;

    // Bbox: cx, cy, w, h (feature indices 0-3)
    const cx = data[0 * numAnchors + a];
    const cy = data[1 * numAnchors + a];
    const w = data[2 * numAnchors + a];
    const h = data[3 * numAnchors + a];

    // Keypoints: 17 × 3 (x, y, score) starting at feature index 5
    const keypoints: PoseKeypoint[] = [];
    for (let kp = 0; kp < numKp; kp++) {
      const base = 5 + kp * 3;
      // Keypoint coords are in the model's input pixel space (640×640)
      // Normalize to 0..1 relative to the original image
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

  logger.model(`YOLOv8 raw: ${candidates.length} candidates above ${minScore} confidence`, { level: "info" });

  // Step 2: Apply NMS to remove overlapping detections
  const suppressed = nms(candidates, 0.5);

  // Step 3: Return the filtered detections
  return { persons: suppressed };
}

export function usePoseDetection() {
  const lastKeyedRef = useRef<PoseKeypoint[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [activeModelId, setActiveModelId] = useState<DetectionModelId | null>(null);
  const [, forceRerender] = useState(0);

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
        const { model, processor } = await Promise.race([
          getModelAndProcessor(modelId, (p) => setModelProgress(p)),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Model is taking too long to load (over 60s). Check your connection or skip validation.")),
              MODEL_LOAD_TIMEOUT_MS,
            ),
          ),
        ]);
        setModelStatus("ready");
        setModelProgress(1);

        const { RawImage } = transformersModule!;
        const image = await RawImage.fromURL(imageDataUrl);

        const inferStart = Date.now();
        const inputs = await processor(image);

        // Remap: processor outputs `pixel_values`, model expects `images`
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

        // YOLOv8-pose output is typically `output0`
        const outputTensor = outputs.output0 ?? outputs.output ?? outputs[Object.keys(outputs)[0]];
        if (!outputTensor) {
          throw new Error("Model output missing detection tensor");
        }

        const { persons } = parseYolov8PoseOutput(
          outputTensor,
          minScore,
          image.width,
          image.height,
        );

        logger.model(`Detection complete: ${modelId}`, {
          detail: `${persons.length} person(s) detected · ${(Date.now() - inferStart)}ms inference`,
          durationMs: Date.now() - inferStart,
        });

        if (persons.length === 0) return { kind: "no-person", score: 0 };
        if (persons.length > 1) return { kind: "multi-person", personCount: persons.length, score: persons[0].score };

        const person = persons[0];
        lastKeyedRef.current = person.keypoints;
        return { kind: "ok", personCount: 1, score: person.score, keypoints: person.keypoints };
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
        await getModelAndProcessor(modelId, (p) => setModelProgress(p));
        setModelStatus("ready");
        setModelProgress(1);
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
    isModelCached: (modelId: DetectionModelId) => loadedModels.has(modelId),
  };
}
