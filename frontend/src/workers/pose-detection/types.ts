/**
 * pose-detection — shared types.
 *
 * Defines the message protocol between the main thread (`usePoseDetection`)
 * and the SharedWorker, plus the internal types used by the worker modules.
 *
 * Keeping these in one place lets every module reference a single source of
 * truth for the wire format and avoids drift between sender/receiver.
 */

import type { DetectionModelId } from "@/types";

// ─── Inbound: Main → Worker ───────────────────────────────────────────── //
export type WorkerLogLevel = "info" | "warn" | "error";

export interface LoadMessage {
  type: "load";
  modelId: DetectionModelId;
}

export interface DetectMessage {
  type: "detect";
  modelId: DetectionModelId;
  imageDataUrl: string;
  minScore: number;
  reqId: number;
  nmsIouThreshold?: number;
  maxPersons?: number;
}

/**
 * Issue 2 fix — zero-copy transferable frame detection.
 *
 * Instead of serialising a base64 data URL across the worker boundary
 * (which allocates a big string on both sides and triggers GC pauses at
 * 30+ FPS), the main thread can transfer the raw pixel buffer directly.
 * The `buffer` is moved (not copied) into the worker via the
 * `postMessage` transfer list — ownership shifts immediately, no memory
 * duplication, no GC churn.
 *
 * The main thread builds this from an `ImageData` or `ImageBitmap`:
 *
 *   const { data, width, height } = imageData;
 *   worker.port.postMessage(
 *     { type: "detect-frame", modelId, buffer: data.buffer, width, height, ... },
 *     [data.buffer]   // ← zero-copy transfer
 *   );
 */
export interface DetectFrameMessage {
  type: "detect-frame";
  modelId: DetectionModelId;
  /** RGBA pixel buffer — TRANSFERRED (zero-copy), not copied. */
  buffer: ArrayBuffer;
  width: number;
  height: number;
  minScore: number;
  reqId: number;
  nmsIouThreshold?: number;
  maxPersons?: number;
}

export interface StatusMessage {
  type: "status";
}

export interface EvictMessage {
  type: "evict";
  modelId: DetectionModelId;
}

/**
 * Issue 5 fix — transfer an OffscreenCanvas from the main thread to the
 * worker. The canvas is MOVED (not copied) via the postMessage transfer
 * list. After this, only the worker can draw to the canvas — the main
 * thread's `canvas.getContext()` would throw.
 *
 * Each connected port (tab) can transfer its own overlay canvas. The
 * worker stores them in a per-port map so they don't collide.
 */
export interface InitCanvasMessage {
  type: "init-canvas";
  canvas: OffscreenCanvas;
}

/**
 * Issue 5 fix — draw a pose skeleton on the worker-owned OffscreenCanvas.
 * The keypoints are normalised (0..1) and scaled to the canvas size by
 * the worker. The optional bbox is drawn as a rectangle around the person.
 */
export interface DrawPoseMessage {
  type: "draw-pose";
  keypoints: Keypoint[];
  bbox?: BBox;
  score?: number;
}

/** Issue 5 fix — clear the worker-owned OffscreenCanvas. */
export interface ClearCanvasMessage {
  type: "clear-canvas";
}

export type WorkerInboundMessage =
  | LoadMessage
  | DetectMessage
  | DetectFrameMessage
  | StatusMessage
  | EvictMessage
  | InitCanvasMessage
  | DrawPoseMessage
  | ClearCanvasMessage;

// ─── Outbound: Worker → Main ──────────────────────────────────────────── //
export interface ProgressMessage {
  type: "progress";
  modelId: DetectionModelId;
  progress: number;
}

export interface LoadedMessage {
  type: "loaded";
  modelId: DetectionModelId;
}

export interface DetectResultOkMessage {
  type: "detect-result";
  reqId: number;
  ok: true;
  detection: DetectionResult;
}

export interface DetectResultErrorMessage {
  type: "detect-result";
  reqId: number;
  ok: false;
  error: string;
}

export interface StatusResponseMessage {
  type: "status";
  loadedModels: DetectionModelId[];
}

export interface LogMessage {
  type: "log";
  category: string;
  message: string;
  level: WorkerLogLevel;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type WorkerOutboundMessage =
  | ProgressMessage
  | LoadedMessage
  | DetectResultOkMessage
  | DetectResultErrorMessage
  | StatusResponseMessage
  | LogMessage
  | ErrorMessage;

// ─── Detection domain types ───────────────────────────────────────────── //
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Keypoint {
  name: string;
  x: number;
  y: number;
  score: number;
}

export interface PersonDetection {
  score: number;
  keypoints: Keypoint[];
  bbox: BBox;
}

export type DetectionKind = "ok" | "no-person" | "multi-person";

export interface DetectionResult {
  kind: DetectionKind;
  personCount?: number;
  score: number;
  keypoints?: Keypoint[];
}

// ─── transformers.js interop (untyped CDN module) ─────────────────────── //
/** Minimal shape of the transformers.js module we rely on. */
export interface TransformersModule {
  AutoModel: {
    from_pretrained: (repo: string, opts?: Record<string, unknown>) => Promise<unknown>;
  };
  AutoProcessor: {
    from_pretrained: (repo: string, opts?: Record<string, unknown>) => Promise<unknown>;
  };
  RawImage: {
    /** Read an image from a URL / data URL / blob URL. */
    fromURL: (url: string) => Promise<RawImage>;
    /**
     * Construct a RawImage directly from a pixel buffer. Used by the
     * zero-copy `detect-frame` path (Issue 2 fix) so we never round-trip
     * through a base64 data URL.
     */
    new (data: Uint8ClampedArray, width: number, height: number, channels: number): RawImage;
  };
  env: {
    allowLocalModels: boolean;
  };
}

export interface RawImage {
  width: number;
  height: number;
  /** RGBA pixel data (length = width × height × 4). */
  data?: Uint8ClampedArray;
}

/** ONNX tensor shape emitted by YOLOv8-pose. */
export interface Tensor {
  data: Float32Array;
  dims: number[];
}

/** Processed inputs returned by the transformers.js processor. */
export interface ProcessorInputs {
  pixel_values?: unknown;
  [key: string]: unknown;
}

/** Loaded model + processor pair cached per `DetectionModelId`. */
export interface ModelEntry {
  model: unknown;
  processor: unknown;
}