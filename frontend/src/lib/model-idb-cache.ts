/**
 * model-idb-cache — Issue 7 fix.
 *
 * Stores the loaded model + processor metadata in IndexedDB so that on a
 * cold restart (browser closed + reopened, or all caches cleared), we can
 * detect that the model was previously downloaded and trigger a fast
 * re-load from the browser's Cache Storage (which transformers.js
 * populates on first download) instead of going back to the CDN.
 *
 * ─── Why IndexedDB and not just localStorage? ──────────────────────────
 * localStorage is synchronous, has a 5 MB quota, and only stores strings.
 * The model "manifest" we persist here is small (a few hundred bytes per
 * model), so localStorage would technically work — but IndexedDB gives us:
 *   1. Async, non-blocking reads on app startup.
 *   2. A much larger quota (hundreds of MB), so we can later store the
 *      raw model WEIGHTS as ArrayBuffer if we want to bypass the CDN
 *      entirely on cold restart.
 *   3. Per-origin isolation that survives cache clears (the user can
 *      clear Cache Storage without losing the model manifest).
 *
 * ─── Relationship to transformers.js's own cache ──────────────────────
 * transformers.js v3 stores downloaded weights in Cache Storage under the
 * cache name `transformers-cache`. That cache survives normal page
 * refreshes but can be cleared by the user (DevTools → Application →
 * Clear storage). Our IndexedDB layer is a SEPARATE record of "the user
 * downloaded this model" — even if the Cache Storage is cleared, we still
 * know the model was downloaded, so we can re-download it transparently
 * (and show the right "Downloaded" state in the UI).
 *
 * ─── Future enhancement ────────────────────────────────────────────────
 * We could store the raw ONNX weights as ArrayBuffer in IndexedDB too,
 * giving us a fully offline-capable model store that doesn't depend on
 * Cache Storage at all. For now, we just store the manifest — the
 * transformers.js Cache Storage layer handles the actual weights.
 */
import type { DetectionModelId } from "@/types";

const DB_NAME = "vton-model-cache";
const DB_VERSION = 1;
const STORE_NAME = "models";

/** Metadata stored per model. */
export interface ModelCacheEntry {
  modelId: DetectionModelId;
  repo: string;
  /** Epoch millis when the model was first downloaded. */
  downloadedAt: number;
  /** Epoch millis when the model was last loaded into memory. */
  lastUsedAt: number;
  /** Size of the downloaded weights in bytes (if known). */
  sizeBytes?: number;
  /** Optional: raw model weights for fully-offline load (future). */
  weights?: ArrayBuffer;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Lazily opens the IndexedDB database. Cached for the worker's lifetime. */
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available in this environment."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "modelId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });

  return dbPromise;
}

/** Stores or updates a model cache entry in IndexedDB. Best-effort. */
export async function putModelEntry(entry: ModelCacheEntry): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB might be unavailable (private browsing, quota exceeded).
    // Best-effort — the model still loads from CDN, just without the
    // offline manifest.
  }
}

/** Retrieves a model cache entry from IndexedDB, or null if not present. */
export async function getModelEntry(modelId: DetectionModelId): Promise<ModelCacheEntry | null> {
  try {
    const db = await openDb();
    return await new Promise<ModelCacheEntry | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(modelId);
      req.onsuccess = () => resolve((req.result as ModelCacheEntry) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Returns the modelIds of all cached models. */
export async function getAllCachedModelIds(): Promise<DetectionModelId[]> {
  try {
    const db = await openDb();
    return await new Promise<DetectionModelId[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAllKeys();
      req.onsuccess = () => resolve(req.result as DetectionModelId[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Deletes a model cache entry from IndexedDB (called on uninstall). */
export async function deleteModelEntry(modelId: DetectionModelId): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(modelId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}
