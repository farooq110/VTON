/**
 * pose-detection — Non-Maximum Suppression (NMS).
 *
 * Pure geometry utilities with no worker / runtime dependencies, so they
 * can be unit-tested in isolation.
 */

import type { BBox, PersonDetection } from "./pose-detection/types";

/**
 * Computes Intersection-over-Union between two axis-aligned boxes expressed
 * in center-`x/y` + `w/h` form. Returns 0 when either box has zero area or
 * the boxes do not overlap.
 */
export function computeIoU(a: BBox, b: BBox): number {
  const ax1 = a.x - a.w / 2;
  const ay1 = a.y - a.h / 2;
  const ax2 = a.x + a.w / 2;
  const ay2 = a.y + a.h / 2;

  const bx1 = b.x - b.w / 2;
  const by1 = b.y - b.h / 2;
  const bx2 = b.x + b.w / 2;
  const by2 = b.y + b.h / 2;

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;

  const union = a.w * a.h + b.w * b.h - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Greedy Non-Maximum Suppression.
 *
 * Sorts detections by descending score and keeps each detection only if its
 * IoU with every already-kept detection is below `iouThreshold`. This removes
 * overlapping duplicate boxes for the same person.
 */
export function nms(
  detections: PersonDetection[],
  iouThreshold = 0.5,
): PersonDetection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: PersonDetection[] = [];

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