/**
 * pose-detection — transformers.js CDN loader.
 *
 * Ensures `@huggingface/transformers` is fetched from a CDN EXACTLY ONCE
 * per worker lifetime, even if multiple "load" + "detect" messages race.
 *
 * The previous implementation used a busy-wait loop (`while (!transformersLoading)
 * await sleep(5)`) to close the race window between the `transformersLoading`
 * check and the assignment. This version replaces that with a single deferred
 * promise that every concurrent caller awaits, so there is no polling.
 */

import {
  TRANSFORMERS_CDN_URLS,
  TRANSFORMERS_LOAD_TIMEOUT_MS,
} from "./constants";
import type { TransformersModule } from "./types";
import { postLog } from "./port-bus";

let transformersModule: TransformersModule | null = null;
let transformersLoading: Promise<TransformersModule> | null = null;

/**
 * Resolves to the cached transformers.js module, loading it from the first
 * reachable CDN on first call. Subsequent calls return the same in-flight
 * promise (or the cached module) — the module is imported at most once.
 */
export function loadTransformers(): Promise<TransformersModule> {
  // Fast path — already loaded.
  if (transformersModule) return Promise.resolve(transformersModule);
  // In-flight — piggyback on the existing load.
  if (transformersLoading) return transformersLoading;

  // Start a fresh load. Assigning `transformersLoading` synchronously here
  // closes the race window that previously required the busy-wait loop: any
  // concurrent caller that arrives after this line sees the promise.
  transformersLoading = doLoadTransformers();
  return transformersLoading;
}

/** Internal: iterates CDN URLs until one yields a usable module. */
async function doLoadTransformers(): Promise<TransformersModule> {
  for (const url of TRANSFORMERS_CDN_URLS) {
    try {
      postLog("model", `Loading transformers.js from CDN: ${url}`);
      const mod = await Promise.race([
        import(/* @vite-ignore */ url) as Promise<unknown>,
        timeoutAfter(TRANSFORMERS_LOAD_TIMEOUT_MS, url),
      ]);
      const candidate = asTransformersModule(mod);
      if (candidate) {
        candidate.env.allowLocalModels = false;
        postLog("model", `transformers.js loaded from CDN: ${url}`);
        transformersModule = candidate;
        return candidate;
      }
      postLog("model", `CDN returned unusable module: ${url}`, "warn");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      postLog("model", `CDN failed, trying next: ${url}: ${msg}`, "warn");
    }
  }

  // Reset so a future call can retry from scratch.
  transformersLoading = null;
  throw new Error("Could not load transformers.js from any CDN.");
}

/** Rejects after `ms` with a descriptive timeout error. */
function timeoutAfter(ms: number, url: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            `Timeout (${ms / 1000}s) loading transformers.js from ${url}`,
          ),
        ),
      ms,
    ),
  );
}

/**
 * Narrows the untyped CDN module to `TransformersModule` by checking for the
 * functions we actually call. Returns `null` if the shape is wrong.
 */
function asTransformersModule(mod: unknown): TransformersModule | null {
  if (!mod || typeof mod !== "object") return null;
  const m = mod as Record<string, unknown>;
  if (typeof m.AutoModel !== "function") return null;
  if (typeof m.AutoProcessor !== "function") return null;
  if (!m.RawImage || typeof (m.RawImage as { fromURL?: unknown }).fromURL !== "function") {
    return null;
  }
  return m as unknown as TransformersModule;
}

/** Test-only: reset internal state. Not used in production. */
export function __resetTransformersLoader(): void {
  transformersModule = null;
  transformersLoading = null;
}