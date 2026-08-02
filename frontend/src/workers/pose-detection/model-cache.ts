/**
 * pose-detection — model + processor cache.
 *
 * Manages the in-memory cache of loaded `{ model, processor }` pairs and
 * the set of "loaded" model ids. Tracks in-flight loads so concurrent
 * "load" / "detect" requests for the same model share a single download.
 *
 * State here lives in the SharedWorker (not the main thread) and persists
 * across page refreshes and across tabs of the same origin.
 */

import type { DetectionModelId } from "@/types";
import { MODEL_REPO } from "./constants";
import type { ModelEntry, TransformersModule } from "./types";
import { loadTransformers } from "./transformers-loader";
import { postLog, postProgress } from "./port-bus";

const modelCache = new Map<DetectionModelId, ModelEntry>();
const inFlightLoads = new Map<DetectionModelId, Promise<ModelEntry>>();
const loadedModels = new Set<DetectionModelId>();

/** Returns true if the model is already loaded in the worker's memory. */
export function isModelLoaded(modelId: DetectionModelId): boolean {
  return loadedModels.has(modelId);
}

/** Returns the ids of all models currently loaded in the worker. */
export function getLoadedModels(): DetectionModelId[] {
  return Array.from(loadedModels);
}

/**
 * Drops a model from the worker's in-memory cache so the next "load"
 * actually re-fetches the weights. transformers.js itself stays loaded
 * — only the per-model weights get re-read.
 */
export function evictModel(modelId: DetectionModelId): void {
  loadedModels.delete(modelId);
  modelCache.delete(modelId);
  inFlightLoads.delete(modelId);
  postLog("model", `Model evicted from worker cache: ${modelId}`);
}

/**
 * Returns the cached `{ model, processor }` for `modelId`, loading it from
 * transformers.js on first request. Concurrent calls for the same model
 * share a single in-flight promise.
 *
 * `onProgress` receives 0..1 progress updates while weights download.
 */
export function getModelAndProcessor(
  modelId: DetectionModelId,
  onProgress?: (p: number) => void,
): Promise<ModelEntry> {
  const cached = modelCache.get(modelId);
  if (cached) return Promise.resolve(cached);

  const inFlight = inFlightLoads.get(modelId);
  if (inFlight) return inFlight;

  const loadPromise = loadModelEntry(modelId, onProgress);
  inFlightLoads.set(modelId, loadPromise);

  // Clean up the in-flight entry once settled (success or failure).
  loadPromise.finally(() => inFlightLoads.delete(modelId));

  return loadPromise;
}

/** Internal: performs the actual transformers.js load for one model. */
async function loadModelEntry(
  modelId: DetectionModelId,
  onProgress?: (p: number) => void,
): Promise<ModelEntry> {
  const repo = MODEL_REPO[modelId];
  postLog("model", `Loading model: ${modelId} (repo: ${repo})`);

  const transformers: TransformersModule = await loadTransformers();
  const { AutoModel, AutoProcessor } = transformers;

  const progressCb = (data: unknown): void => {
    if (!onProgress) return;
    const d = data as { progress?: number } | null;
    if (d && d.progress != null) {
      onProgress(Math.min(1, d.progress / 100));
    }
  };

  const [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained(repo, { progress_callback: progressCb }),
    AutoModel.from_pretrained(repo, { progress_callback: progressCb }),
  ]);

  if (!model || !processor) {
    throw new Error("Model or processor returned undefined");
  }

  const entry: ModelEntry = { model, processor };
  modelCache.set(modelId, entry);
  loadedModels.add(modelId);
  postLog("model", `Model loaded: ${modelId}`);
  return entry;
}

/**
 * Convenience wrapper used by the message handler: loads a model and
 * broadcasts progress to all ports. Resolves once the model is loaded.
 */
export function loadModelWithProgress(modelId: DetectionModelId): Promise<ModelEntry> {
  return getModelAndProcessor(modelId, (p) => postProgress(modelId, p));
}