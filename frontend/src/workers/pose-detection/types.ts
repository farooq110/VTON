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

export interface StatusMessage {
  type: "status";
}

export interface EvictMessage {
  type: "evict";
  modelId: DetectionModelId;
}

export type WorkerInboundMessage =
  | LoadMessage
  | DetectMessage
  | StatusMessage
  | EvictMessage;

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
    fromURL: (url: string) => Promise<RawImage>;
  };
  env: {
    allowLocalModels: boolean;
  };
}

export interface RawImage {
  width: number;
  height: number;
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