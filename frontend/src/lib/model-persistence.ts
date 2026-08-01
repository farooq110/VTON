import type { DetectionModelId } from "@/types";
import { MODEL_REPO } from "@/lib/constants";

/**
 * model-persistence — tracks which detection models have been downloaded
 * so the download state SURVIVES a page refresh.
 *
 * ─── THE PROBLEM (v1) ──────────────────────────────────────────────────
 * `loadedModels` was a plain in-memory `Set` in the worker. On page refresh,
 * the worker was re-created and the set was empty — so the UI showed "Not
 * downloaded" again.
 *
 * ─── THE PROBLEM (v2 — previous fix) ──────────────────────────────────
 * We added `verifyModelCache()` which checked `caches.keys()` for cache
 * names containing the repo segment (e.g. "yolov8n-pose"). BUT transformers.js
 * v3 stores weights in a cache named `transformers-cache` (NOT the repo name),
 * so the check ALWAYS failed and pruned the localStorage entry — meaning the
 * model appeared "not downloaded" after every refresh.
 *
 * ─── THE FIX (v3 — this version) ──────────────────────────────────────
 * We TRUST localStorage unconditionally. No pruning. The rationale:
 *
 *   1. transformers.js has its OWN internal cache (Cache Storage). When the
 *      worker calls `AutoModel.from_pretrained(repo)`, transformers.js
 *      checks its cache first. If the weights are there (from a previous
 *      session), the load is instant — no network re-download. If the cache
 *      was cleared, it re-downloads — but that's transparent to the UI.
 *
 *   2. The localStorage flag represents the USER'S INTENT — "I downloaded
 *      this model." Even if the browser cache was cleared, the user still
 *      intends to have the model available, so the UI should show it as
 *      downloaded. The worker will re-download transparently on next use.
 *
 *   3. On app startup, we send "load" messages to the worker for every
 *      model in the set. This WARMS the worker's in-memory cache — the
 *      model is loaded from Cache Storage into memory immediately, so the
 *      first detection is fast. No re-download if the cache is intact.
 *
 * This gives us a SINGLE SOURCE OF TRUTH: the Settings page, the Try-On
 * Camera page, and the validation hooks all read from `isModelDownloaded()`.
 */

const STORAGE_KEY = "vton_downloaded_models";
/** Tracks models the user has EXPLICITLY uninstalled — these must NOT be
 * auto-downloaded on app startup. Only a manual "Download" click in Settings
 * re-downloads them (which calls markModelDownloaded, removing them from
 * this set). */
const UNINSTALLED_KEY = "vton_uninstalled_models";

/** In-memory mirror of the localStorage set — fast reads, no JSON.parse. */
let downloadedModels: Set<DetectionModelId> = loadSet(STORAGE_KEY);
let uninstalledModels: Set<DetectionModelId> = loadSet(UNINSTALLED_KEY);

/** Listeners — notified whenever the set changes (download / uninstall). */
type DownloadListener = (modelId: DetectionModelId, isDownloaded: boolean) => void;
const listeners = new Set<DownloadListener>();

function notify(modelId: DetectionModelId, isDownloaded: boolean): void {
  listeners.forEach((fn) => fn(modelId, isDownloaded));
}

/** Generic loader — reads a Set<DetectionModelId> from localStorage. */
function loadSet(key: string): Set<DetectionModelId> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((s): s is DetectionModelId => typeof s === "string"));
  } catch {
    return new Set();
  }
}

/** Generic writer — persists a Set to localStorage. */
function persistSet(key: string, set: Set<DetectionModelId>): void {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // localStorage might be full or disabled — best-effort.
  }
}

/**
 * Returns the current set of downloaded model IDs. This is the SINGLE
 * SOURCE OF TRUTH that the Settings page, Try-On Camera page, and
 * validation hooks all read from.
 */
export function getDownloadedModels(): Set<DetectionModelId> {
  return downloadedModels;
}

/** Returns true if the given model is marked as downloaded. */
export function isModelDownloaded(modelId: DetectionModelId): boolean {
  return downloadedModels.has(modelId);
}

/**
 * Marks a model as downloaded (called by the worker when a load succeeds,
 * OR by the user clicking "Download" in Settings).
 * Updates localStorage + notifies all listeners so the UI re-renders.
 *
 * ALSO removes the model from the "uninstalled" set — this is how a manual
 * re-download clears the "don't auto-load" flag.
 */
export function markModelDownloaded(modelId: DetectionModelId): void {
  let changed = false;
  if (!downloadedModels.has(modelId)) {
    downloadedModels.add(modelId);
    changed = true;
  }
  if (uninstalledModels.has(modelId)) {
    uninstalledModels.delete(modelId);
    persistSet(UNINSTALLED_KEY, uninstalledModels);
    changed = true;
  }
  if (changed) {
    persistSet(STORAGE_KEY, downloadedModels);
    notify(modelId, true);
  }
}

/**
 * Marks a model as uninstalled (called when the user clicks Uninstall).
 * Updates localStorage + notifies all listeners so the UI re-renders and
 * shows the "Download" button again.
 *
 * ALSO adds the model to the "uninstalled" set — this prevents
 * warmDownloadedModels from auto-re-downloading it on the next app startup.
 * The model stays uninstalled until the user manually clicks "Download"
 * in Settings (which calls markModelDownloaded, clearing the uninstalled flag).
 */
export function markModelUninstalled(modelId: DetectionModelId): void {
  if (!downloadedModels.has(modelId) && uninstalledModels.has(modelId)) return;
  downloadedModels.delete(modelId);
  uninstalledModels.add(modelId);
  persistSet(STORAGE_KEY, downloadedModels);
  persistSet(UNINSTALLED_KEY, uninstalledModels);
  notify(modelId, false);
}

/** Returns true if the model was EXPLICITLY uninstalled by the user. */
export function isModelUninstalled(modelId: DetectionModelId): boolean {
  return uninstalledModels.has(modelId);
}

/** Subscribe to download-state changes. Returns an unsubscribe function. */
export function onModelDownloadChange(listener: DownloadListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Removes the model weights from Cache Storage. Called when the user
 * clicks "Uninstall" in the Settings page.
 *
 * We delete ALL caches that might contain transformers.js weights — since
 * transformers.js v3 uses a single cache named `transformers-cache` (not
 * per-repo), we delete that entire cache. This removes ALL downloaded
 * models' weights, but since uninstall is a destructive action anyway,
 * this is acceptable. The localStorage flag for the specific model is
 * cleared separately by `markModelUninstalled`.
 *
 * Returns true if the cache was removed (or didn't exist).
 */
export async function uninstallModelCache(modelId: DetectionModelId): Promise<boolean> {
  // Remove from the tracking set first (instant UI feedback).
  markModelUninstalled(modelId);

  if (!("caches" in window)) return true;

  try {
    // transformers.js v3 stores all weights in a cache named
    // `transformers-cache`. We delete it to free the disk space.
    // NOTE: This removes ALL models' cached weights, not just the one
    // being uninstalled. Since the other models' localStorage flags
    // remain set, the worker will re-download them from the CDN on next
    // use (transparent to the user — they still show as "Downloaded").
    const cacheNames = await caches.keys();
    const targetCaches = cacheNames.filter((name) =>
      name.includes("transformers") || name.includes("hf") || name.includes("model"),
    );
    // Also try to delete caches matching the repo name (older versions).
    const repo = MODEL_REPO[modelId];
    if (repo) {
      const repoSegment = repo.split("/").pop() ?? repo;
      cacheNames
        .filter((name) => name.includes(repoSegment) || name.includes(repo))
        .forEach((name) => targetCaches.push(name));
    }
    await Promise.all([...new Set(targetCaches)].map((name) => caches.delete(name)));
    return true;
  } catch {
    return false;
  }
}
