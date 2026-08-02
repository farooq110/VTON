/**
 * pose-detection — constants & configuration.
 *
 * Centralizes all tunable values and static registries used by the
 * pose-detection SharedWorker so they can be referenced from any module
 * without re-declaration.
 */

import type { DetectionModelId } from "@/types";

/**
 * Maps each logical `DetectionModelId` to the Hugging Face repo used by
 * transformers.js `AutoModel` / `AutoProcessor`.
 *
 * Several logical ids currently alias the same YOLOv8n-pose repo — this
 * keeps the public API stable while the underlying model can be swapped
 * per-id in the future.
 */
export const MODEL_REPO: Record<DetectionModelId, string> = {
  "yolov8n-pose": "Xenova/yolov8n-pose",
  "yolov8s-pose": "Xenova/yolov8s-pose",
  "mediapipe-pose": "Xenova/yolov8n-pose",
  "movenet-lightning": "Xenova/yolov8n-pose",
};

/**
 * Candidate CDN URLs for `@huggingface/transformers`. Tried in order; the
 * first one that exposes a usable `AutoModel` function wins.
 */
export const TRANSFORMERS_CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm",
  "https://esm.run/@huggingface/transformers@3.0.2",
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.0/+esm",
] as const;

/** COCO keypoint ordering produced by YOLOv8-pose (17 keypoints). */
export const COCO_KEYPOINT_NAMES = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
] as const;

/** Number of COCO keypoints emitted by YOLOv8-pose. */
export const NUM_KEYPOINTS = COCO_KEYPOINT_NAMES.length; // 17

/**
 * YOLOv8-pose output tensor layout: `[batch, features, anchors]` where
 * `features = 4 (bbox) + 1 (conf) + 17 keypoints * 3 (x, y, score)`.
 */
export const EXPECTED_FEATURES = 4 + 1 + NUM_KEYPOINTS * 3; // 56

/** Timeout for loading transformers.js from a single CDN URL (ms). */
export const TRANSFORMERS_LOAD_TIMEOUT_MS = 120_000; // 2 min — ~2MB+

/** Default IoU threshold for Non-Maximum Suppression. */
export const DEFAULT_NMS_IOU_THRESHOLD = 0.5;

/** Default cap on the number of person detections returned. */
export const DEFAULT_MAX_PERSONS = 10;

/** Minimum number of persons returned by the parser (perf floor). */
export const MIN_PERSONS = 1;