/**
 * pose-detection — YOLOv8-pose output tensor parser.
 *
 * Pure function: turns the raw ONNX output tensor from YOLOv8-pose into a
 * list of person detections (bbox + keypoints), then applies NMS and caps
 * to `maxPersons`. Has no worker/runtime dependencies, so it can be unit
 * tested in isolation.
 */

import {
  COCO_KEYPOINT_NAMES,
  EXPECTED_FEATURES,
  NUM_KEYPOINTS,
  MIN_PERSONS,
} from "./constants";
import type { Keypoint, PersonDetection, Tensor } from "./types";
import { nms } from "./nms";

export interface ParseOptions {
  minScore: number;
  imgWidth: number;
  imgHeight: number;
  nmsIouThreshold: number;
  maxPersons: number;
}

export interface ParseResult {
  persons: PersonDetection[];
}

/**
 * Parses a YOLOv8-pose output tensor.
 *
 * Expected tensor layout: `[batch, features, anchors]` where
 *   - features[0..3] = bbox (cx, cy, w, h)
 *   - features[4]    = confidence
 *   - features[5..]  = 17 keypoints × (x, y, score)
 *
 * Keypoint x/y are normalized to `0..1` using `imgWidth` / `imgHeight`.
 * Returns an empty list if the tensor shape is unexpected.
 */
export function parseYolov8PoseOutput(
  tensor: Tensor,
  opts: ParseOptions,
): ParseResult {
  const { data, dims } = tensor;
  if (dims.length !== 3) return { persons: [] };

  const numFeatures = dims[1];
  const numAnchors = dims[2];
  if (numFeatures !== EXPECTED_FEATURES) return { persons: [] };

  const { minScore, imgWidth, imgHeight, nmsIouThreshold, maxPersons } = opts;
  if (imgWidth <= 0 || imgHeight <= 0) return { persons: [] };

  const candidates: PersonDetection[] = [];

  for (let a = 0; a < numAnchors; a++) {
    const conf = data[4 * numAnchors + a];
    if (conf < minScore) continue;

    const cx = data[0 * numAnchors + a];
    const cy = data[1 * numAnchors + a];
    const w = data[2 * numAnchors + a];
    const h = data[3 * numAnchors + a];

    const keypoints: Keypoint[] = [];
    for (let kp = 0; kp < NUM_KEYPOINTS; kp++) {
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

  const suppressed = nms(candidates, nmsIouThreshold);
  // Cap to maxPersons (perf guard — prevents huge arrays on crowded frames).
  const capped = suppressed.slice(0, Math.max(MIN_PERSONS, maxPersons));
  return { persons: capped };
}