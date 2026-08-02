/**
 * pose-detection — OffscreenCanvas overlay renderer (Issue 5 fix).
 *
 * Owns the OffscreenCanvas transferred from the main thread via
 * `canvas.transferControlToOffscreen()`. All pose-overlay drawing happens
 * here on the WORKER thread, freeing the main thread for React rendering
 * and user interaction.
 *
 * Message protocol:
 *   Main → Worker:
 *     { type: "init-canvas", canvas: OffscreenCanvas }   [transferred]
 *     { type: "draw-pose", keypoints: Keypoint[], bbox?: BBox, score?: number }
 *     { type: "clear-canvas" }
 *
 * The canvas is per-port (per-tab) — each connected tab can transfer its
 * own overlay canvas. We store them in a Map keyed by the MessagePort so
 * they don't collide.
 *
 * If a port disconnects (tab closed / refresh), its canvas is freed by
 * the browser automatically — no explicit cleanup needed beyond removing
 * the entry from the map.
 */
import type { Keypoint, BBox } from "./types";

/** Per-port OffscreenCanvas registry. Each tab owns its own canvas. */
const canvasByPort = new Map<MessagePort, OffscreenCanvas>();

/** Per-port 2D rendering context (cached for performance). */
const ctxByPort = new Map<MessagePort, OffscreenRenderingContext | null>();

/**
 * Stores the transferred OffscreenCanvas for the given port. The canvas is
 * transferred (not copied) — the main thread can no longer draw to it.
 */
export function initCanvas(port: MessagePort, canvas: OffscreenCanvas): void {
  canvasByPort.set(port, canvas);
  try {
    const ctx = canvas.getContext("2d");
    ctxByPort.set(port, ctx);
  } catch {
    ctxByPort.set(port, null);
  }
}

/**
 * Drops the canvas for a port (called when the port disconnects). The
 * canvas itself is GC'd by the browser once the port is gone.
 */
export function dropCanvas(port: MessagePort): void {
  canvasByPort.delete(port);
  ctxByPort.delete(port);
}

/**
 * Draws a pose skeleton overlay on the port's canvas. The skeleton is
 * drawn as connected lines between COCO keypoints, with circles at each
 * joint. The colour reflects the overall detection confidence.
 *
 * If no canvas has been transferred for this port, this is a no-op.
 */
export function drawPose(
  port: MessagePort,
  keypoints: Keypoint[],
  bbox?: BBox,
  score?: number,
): void {
  const canvas = canvasByPort.get(port);
  const ctx = ctxByPort.get(port);
  if (!canvas || !ctx) return;

  const ctx2d = ctx as OffscreenCanvasRenderingContext2D;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);

  if (keypoints.length === 0) return;

  // Confidence-based colour: green (good) → amber (mediocre) → red (poor).
  const s = score ?? 0;
  const colour =
    s >= 0.7 ? "#22c55e" : s >= 0.5 ? "#f59e0b" : "#ef4444";

  // Bounding box (optional).
  if (bbox) {
    ctx2d.strokeStyle = colour;
    ctx2d.lineWidth = 2;
    ctx2d.strokeRect(
      bbox.x - bbox.w / 2,
      bbox.y - bbox.h / 2,
      bbox.w,
      bbox.h,
    );
  }

  // COCO skeleton connections — pairs of keypoint names that should be
  // connected by a line. This is the standard COCO keypoint topology.
  const SKELETON: Array<[string, string]> = [
    ["left_shoulder", "right_shoulder"],
    ["left_shoulder", "left_elbow"],
    ["left_elbow", "left_wrist"],
    ["right_shoulder", "right_elbow"],
    ["right_elbow", "right_wrist"],
    ["left_shoulder", "left_hip"],
    ["right_shoulder", "right_hip"],
    ["left_hip", "right_hip"],
    ["left_hip", "left_knee"],
    ["left_knee", "left_ankle"],
    ["right_hip", "right_knee"],
    ["right_knee", "right_ankle"],
    ["nose", "left_eye"],
    ["nose", "right_eye"],
    ["left_eye", "left_ear"],
    ["right_eye", "right_ear"],
  ];

  const byName = new Map(keypoints.map((k) => [k.name, k]));

  // Skeleton lines.
  ctx2d.strokeStyle = colour;
  ctx2d.lineWidth = 3;
  ctx2d.beginPath();
  for (const [a, b] of SKELETON) {
    const ka = byName.get(a);
    const kb = byName.get(b);
    if (!ka || !kb) continue;
    if (ka.score < 0.3 || kb.score < 0.3) continue;
    ctx2d.moveTo(ka.x * canvas.width, ka.y * canvas.height);
    ctx2d.lineTo(kb.x * canvas.width, kb.y * canvas.height);
  }
  ctx2d.stroke();

  // Joint circles.
  ctx2d.fillStyle = colour;
  for (const k of keypoints) {
    if (k.score < 0.3) continue;
    ctx2d.beginPath();
    ctx2d.arc(
      k.x * canvas.width,
      k.y * canvas.height,
      4,
      0,
      Math.PI * 2,
    );
    ctx2d.fill();
  }
}

/** Clears the port's canvas (e.g. when no person is detected). */
export function clearCanvas(port: MessagePort): void {
  const canvas = canvasByPort.get(port);
  const ctx = ctxByPort.get(port);
  if (!canvas || !ctx) return;
  (ctx as OffscreenCanvasRenderingContext2D).clearRect(
    0,
    0,
    canvas.width,
    canvas.height,
  );
}
