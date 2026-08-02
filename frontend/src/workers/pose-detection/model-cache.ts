/**
 * pose-detection — model + processor cache.
 *
 * Manages the in-memory cache of loaded `{ model, processor }` pairs and
 * the set of "loaded" model ids. Tracks in-flight loads so concurrent
 * "load" / "detect" requests for the same model share a single download.
 *
 * State here lives in the SharedWorker (not the main thread) and persists
 * across page refreshes and across tabs of the same origin.
 *
 * ─── Issue 7 fix — IndexedDB offline manifest ──────────────────────────
 * After a successful load, we persist a `ModelCacheEntry` to IndexedDB.
 * This survives Cache Storage clears and gives us a permanent record of
 * "the user downloaded this model" — even on a cold restart, we know to
 * re-load it transparently instead of asking the user to download again.
 *
 * The IndexedDB layer is imported dynamically (worker context) so it's
 * tree-shakeable on browsers without IndexedDB support.
 */

import type { DetectionModelId } from "@/types";
import { MODEL_REPO } from "./constants";
import type { ModelEntry, TransformersModule } from "./types";
import { loadTransformers } from "./transformers-loader";
import { postLog, postProgress } from "./port-bus";
import {
  putModelEntry,
  getModelEntry,
  getAllCachedModelIds,
  deleteModelEntry,
} from "@/lib/model-idb-cache";

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
 * Issue 7 fix — returns the ids of all models that have a persisted manifest
 * in IndexedDB. Called on app startup so we can pre-warm the worker's
 * in-memory cache from the offline manifest (transparent re-download if
 * the Cache Storage was cleared, but no user-facing "download again?"
 * prompt).
 */
export async function getCachedModelIds(): Promise<DetectionModelId[]> {
  return getAllCachedModelIds();
}

/**
 * Drops a model from the worker's in-memory cache so the next "load"
 * actually re-fetches the weights. transformers.js itself stays loaded
 * — only the per-model weights get re-read.
 *
 * Issue 7 fix — also removes the IndexedDB manifest entry so the model
 * is fully forgotten.
 */
export async function evictModel(modelId: DetectionModelId): Promise<void> {
  loadedModels.delete(modelId);
  modelCache.delete(modelId);
  inFlightLoads.delete(modelId);
  await deleteModelEntry(modelId);
  postLog("model", `Model evicted from worker cache: ${modelId}`);
}

/**
 * Returns the cached `{ model, processor }` for `modelId`, loading it from
 * transformers.js on first request. Concurrent calls for the same model
 * share a single in-flight promise.
 *
 * `onProgress` receives 0..1 progress updates while weights download.
 *
 * Issue 7 fix — before loading, we check the IndexedDB manifest. If the
 * model was previously downloaded, we log that we're re-attaching to the
 * existing Cache Storage weights (no CDN fetch). If neither cache has it,
 * we download from the CDN and persist a new manifest entry.
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

  // ─── Issue 7: check the IndexedDB manifest first ─────────────────────
  // If we have a persisted entry, the model was previously downloaded —
  // transformers.js will find the weights in its own Cache Storage and
  // load them instantly (no CDN fetch). We log this so the activity
  // panel shows the difference between "loading from cache" and
  // "downloading from CDN".
  const idbEntry = await getModelEntry(modelId);
  if (idbEntry) {
    postLog("model", `Loading model from offline cache: ${modelId} (repo: ${repo}, first downloaded ${new Date(idbEntry.downloadedAt).toISOString()})`);
  } else {
    postLog("model", `Loading model: ${modelId} (repo: ${repo})`);
  }

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

  // ─── Issue 7: persist / update the IndexedDB manifest ────────────────
  // Fire-and-forget — don't block the load on IDB write. We store the
  // repo + timestamps so future cold starts can detect the model was
  // previously downloaded even if Cache Storage is empty.
  void putModelEntry({
    modelId,
    repo,
    downloadedAt: idbEntry?.downloadedAt ?? Date.now(),
    lastUsedAt: Date.now(),
  });

  return entry;
}

/**
 * Convenience wrapper used by the message handler: loads a model and
 * broadcasts progress to all ports. Resolves once the model is loaded.
 */
export function loadModelWithProgress(modelId: DetectionModelId): Promise<ModelEntry> {
  return getModelAndProcessor(modelId, (p) => postProgress(modelId, p));
}