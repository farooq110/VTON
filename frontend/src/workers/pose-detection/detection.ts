/**
 * pose-detection — inference orchestration.
 *
 * Ties together model loading, image preprocessing, model execution and
 * YOLOv8-pose output parsing. Exposes a single `runDetection` function used
 * by the message handler.
 */

import type { DetectionModelId } from "@/types";
import {
  TRANSFORMERS_LOAD_TIMEOUT_MS,
  DEFAULT_NMS_IOU_THRESHOLD,
  DEFAULT_MAX_PERSONS,
} from "./constants";
import type {
  DetectionResult,
  ModelEntry,
  ProcessorInputs,
  RawImage,
  Tensor,
  TransformersModule,
} from "./types";
import { getModelAndProcessor } from "./model-cache";
import { loadTransformers } from "./transformers-loader";
import { postProgress } from "./port-bus";
import { parseYolov8PoseOutput } from "./yolov8-parser";

export interface RunDetectionOptions {
  modelId: DetectionModelId;
  imageDataUrl: string;
  minScore: number;
  nmsIouThreshold?: number;
  maxPersons?: number;
}

/**
 * Runs person detection on `imageDataUrl` using `modelId`.
 *
 * The model load can take a while on first use (downloading weights from
 * CDN), so it is wrapped in the same generous timeout used for the
 * transformers.js CDN load.
 *
 * Returns a `DetectionResult` discriminated by `kind`:
 *   - "ok"           — exactly one person; keypoints included
 *   - "no-person"    — zero detections
 *   - "multi-person" — more than one detection after NMS
 */
export async function runDetection(opts: RunDetectionOptions): Promise<DetectionResult> {
  const {
    modelId,
    imageDataUrl,
    minScore,
    nmsIouThreshold = DEFAULT_NMS_IOU_THRESHOLD,
    maxPersons = DEFAULT_MAX_PERSONS,
  } = opts;

  const { model, processor } = await loadModelWithTimeout(modelId);

  const transformers = await loadTransformers();
  const image = await transformers.RawImage.fromURL(imageDataUrl);

  const inputs = (await (processor as (image: RawImage) => Promise<ProcessorInputs>)(image));
  const modelInputs = buildModelInputs(inputs);

  const outputs = (await (model as (input: Record<string, unknown>) => Promise<unknown>)(modelInputs)) as Record<string, unknown>;
  const outputTensor = extractOutputTensor(outputs);
  if (!outputTensor) {
    throw new Error("Model output missing detection tensor");
  }

  const { persons } = parseYolov8PoseOutput(outputTensor, {
    minScore,
    imgWidth: image.width,
    imgHeight: image.height,
    nmsIouThreshold,
    maxPersons,
  });

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

/**
 * Loads the model + processor with a timeout matching the transformers.js
 * CDN load timeout. Broadcasts progress to all ports while loading.
 */
function loadModelWithTimeout(modelId: DetectionModelId): Promise<ModelEntry> {
  return Promise.race([
    getModelAndProcessor(modelId, (p: number) => postProgress(modelId, p)),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Model is taking too long to load (over 120s). Check your network connection.",
            ),
          ),
        TRANSFORMERS_LOAD_TIMEOUT_MS,
      ),
    ),
  ]) as Promise<ModelEntry>;
}

/**
 * Builds the inputs object expected by the YOLOv8-pose model. The processor
 * returns `pixel_values`; the model expects them under the `images` key, with
 * any other fields passed through unchanged.
 */
function buildModelInputs(inputs: ProcessorInputs): Record<string, unknown> {
  const modelInputs: Record<string, unknown> = {};
  if (inputs.pixel_values !== undefined) {
    modelInputs.images = inputs.pixel_values;
  }
  for (const [key, value] of Object.entries(inputs)) {
    if (key !== "pixel_values" && key !== "images") {
      modelInputs[key] = value;
    }
  }
  return modelInputs;
}

/**
 * Extracts the detection tensor from the model outputs object. YOLOv8-pose
 * exposes it under `output0`, but we fall back to `output` and then the first
 * value for robustness across transformers.js versions.
 */
function extractOutputTensor(outputs: Record<string, unknown>): Tensor | null {
  const tensor =
    (outputs.output0 as Tensor | undefined) ??
    (outputs.output as Tensor | undefined) ??
    (outputs[Object.keys(outputs)[0]] as Tensor | undefined);
  return tensor ?? null;
}

/** Re-exported for tests / consumers that need the RawImage type. */
export type { RawImage, TransformersModule };