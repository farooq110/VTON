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
 * This performs raw inference:
 *   1. `AutoProcessor.from_pretrained(modelId)` — loads the image preprocessor
 *      (resize, normalize, etc.)
 *   2. `AutoModel.from_pretrained(modelId)` — loads the ONNX model weights
 *   3. `processor(image)` → input tensors
 *   4. `model(inputs)` → output tensors
 *   5. Parse the YOLOv8 output tensor into bounding boxes + 17 COCO keypoints
 *
 * **Loading:** `@huggingface/transformers@3.0.2` loaded from CDN `+esm` endpoint.
 * Model weights (~3.2 MB) download from HuggingFace Hub on first use.
 *
 * **Resilience:** The model download can take 5–30s on slow connections.
 * The hook exposes `modelStatus` + `modelProgress` so the UI can show progress.
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
  "mediapipe-pose": "Xenova/yolov8n-pose", // fallback (mediapipe repo doesn't exist)
  "movenet-lightning": "Xenova/yolov8n-pose", // fallback (uses YOLOv8n under the hood)
};

/** CDN URLs for `@huggingface/transformers` v3 ESM build. */
const TRANSFORMERS_CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm",
  "https://esm.run/@huggingface/transformers@3.0.2",
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0/+esm",
];

/** COCO 17 keypoint names (standard YOLOv8-pose output order). */
const COCO_KEYPOINT_NAMES = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

// Cache the model + processor per-model so we only download once per session
const modelCache = new Map<DetectionModelId, { model: any; processor: any }>();
const inFlightLoads = new Map<DetectionModelId, Promise<{ model: any; processor: any }>>();
const loadedModels = new Set<DetectionModelId>();

// ─── Global single-source-of-truth state for model cache ────────────── //
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
 * Loads the model + processor via `AutoModel.from_pretrained()` +
 * `AutoProcessor.from_pretrained()`.
 *
 * This BYPASSES the `pipeline()` task-check that throws
 * `Unsupported model type: yolov8`. AutoModel loads the ONNX weights directly
 * without checking if the architecture is in the supported pipeline registry.
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

    // Load processor + model in parallel (both download from HF Hub)
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
 * Parses the raw YOLOv8-pose output tensor into detection results.
 *
 * YOLOv8-pose output shape: [1, 56, 8400] (for 640x640 input)
 *   - 56 = 4 (bbox: cx, cy, w, h) + 1 (confidence) + 51 (17 keypoints × 3: x, y, score)
 *   - 8400 = number of anchor points
 *
 * We:
 *   1. Transpose to [8400, 56] so each row is one detection
 *   2. Filter by confidence threshold
 *   3. Take the top detection (highest confidence)
 *   4. Extract bbox + keypoints
 *
 * Keypoint coordinates are in the model's input pixel space (0–640) and
 * normalized to the original image dimensions after.
 */
function parseYolov8PoseOutput(
  outputTensor: any,
  minScore: number,
  imgWidth: number,
  imgHeight: number,
): { persons: Array<{ score: number; keypoints: PoseKeypoint[]; bbox: { x: number; y: number; w: number; h: number } }> } {
  // outputTensor is a Tensor with .data (Float32Array) and .dims
  const data: Float32Array = outputTensor.data;
  const dims: number[] = outputTensor.dims;

  // Expected dims: [1, 56, num_anchors] or [1, num_anchors, 56]
  // We need to figure out which dimension is 56 (features) and which is anchors
  let features: number;
  let anchors: number;
  let transposed = false;

  if (dims.length === 3) {
    if (dims[1] < dims[2]) {
      // [1, features, anchors] → need to transpose
      features = dims[1];
      anchors = dims[2];
      transposed = true;
    } else {
      // [1, anchors, features] → already in the right order
      features = dims[2];
      anchors = dims[1];
    }
  } else {
    // Unexpected shape — return empty
    return { persons: [] };
  }

  const numKp = 17; // COCO keypoints
  const expectedFeatures = 4 + 1 + numKp * 3; // 4 (bbox) + 1 (conf) + 51 (kps) = 56

  // If features doesn't match 56, the output format is different — bail
  if (features !== expectedFeatures) {
    logger.model(`Unexpected YOLOv8 output features: ${features} (expected ${expectedFeatures})`, { level: "warn" });
    return { persons: [] };
  }

  const persons: Array<{ score: number; keypoints: PoseKeypoint[]; bbox: any }> = [];

  for (let a = 0; a < anchors; a++) {
    // Get the confidence score for this anchor
    let conf: number;
    if (transposed) {
      // [1, features, anchors] → data[a * features + 4]
      conf = data[4 * anchors + a];
    } else {
      // [1, anchors, features] → data[a * features + 4]
      conf = data[a * features + 4];
    }

    if (conf < minScore) continue;

    // Extract bbox (cx, cy, w, h) — normalized to 0–1 by the processor
    let cx, cy, w, h: number;
    if (transposed) {
      cx = data[0 * anchors + a];
      cy = data[1 * anchors + a];
      w = data[2 * anchors + a];
      h = data[3 * anchors + a];
    } else {
      cx = data[a * features + 0];
      cy = data[a * features + 1];
      w = data[a * features + 2];
      h = data[a * features + 3];
    }

    // Extract 17 keypoints (each 3 values: x, y, score)
    const keypoints: PoseKeypoint[] = [];
    for (let kp = 0; kp < numKp; kp++) {
      const kpOffset = 5 + kp * 3; // after bbox(4) + conf(1)
      let kx, ky, ks: number;
      if (transposed) {
        kx = data[kpOffset * anchors + a];
        ky = data[(kpOffset + 1) * anchors + a];
        ks = data[(kpOffset + 2) * anchors + a];
      } else {
        kx = data[a * features + kpOffset];
        ky = data[a * features + kpOffset + 1];
        ks = data[a * features + kpOffset + 2];
      }
      // Keypoints are in pixel coords of the 640×640 input — normalize to 0–1
      // relative to the original image
      keypoints.push({
        name: COCO_KEYPOINT_NAMES[kp] ?? `kp_${kp}`,
        x: kx / imgWidth,
        y: ky / imgHeight,
        score: ks,
      });
    }

    persons.push({
      score: conf,
      keypoints,
      bbox: { x: cx, y: cy, w, h },
    });
  }

  // Sort by confidence (highest first)
  persons.sort((a, b) => b.score - a.score);
  return { persons };
}

const MODEL_LOAD_TIMEOUT_MS = 60_000;

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

        // Load the image via RawImage (transformers.js helper)
        const { RawImage } = transformersModule!;
        const image = await RawImage.fromURL(imageDataUrl);

        const inferStart = Date.now();
        // Preprocess the image → input tensors
        const inputs = await processor(image);

        // The YOLOv8 model expects an input key called `images`, but the
        // processor outputs `pixel_values`. Remap so the model finds its input.
        // (This is the fix for "Missing the following inputs: images".)
        const modelInputs: Record<string, any> = {};
        if (inputs.pixel_values !== undefined) {
          modelInputs.images = inputs.pixel_values;
        }
        // Copy any other inputs the model might need (e.g., orig_target_sizes)
        for (const [key, value] of Object.entries(inputs)) {
          if (key !== "pixel_values" && key !== "images") {
            modelInputs[key] = value;
          }
        }
        // If the model also needs orig_target_sizes (some YOLOv8 variants do),
        // pass the image dimensions
        if (!modelInputs.orig_target_sizes && inputs.reshaped_input_sizes) {
          modelInputs.orig_target_sizes = inputs.reshaped_input_sizes;
        }

        // Run the model forward pass
        const outputs = await model(modelInputs);

        // YOLOv8-pose output is typically `output0` (the main detection tensor)
        const outputTensor = outputs.output0 ?? outputs.output ?? outputs[Object.keys(outputs)[0]];
        if (!outputTensor) {
          throw new Error("Model output missing detection tensor");
        }

        // Parse the raw YOLOv8 output into persons + keypoints
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

        // Single person — use the top detection
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
