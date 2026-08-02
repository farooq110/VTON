/**
 * pose-detection.worker — SHARED WORKER entry.
 *
 * Offloads YOLOv8n-pose model loading + inference from the main thread.
 *
 * ─── WHY SharedWorker? ─────────────────────────────────────────────────
 * A SharedWorker's in-memory state PERSISTS across page refreshes (and
 * across tabs of the same origin). This means transformers.js + the model
 * weights are loaded into the worker's memory ONCE — on the very first
 * app start — and stay loaded for ALL subsequent refreshes and navigations.
 *
 * With a regular Worker, every page refresh destroys the worker, so
 * transformers.js re-imports and the model re-loads from Cache Storage
 * every time — producing "Loading transformers.js from CDN" and
 * "Loading model" log entries on EVERY refresh.
 *
 * With SharedWorker, on refresh:
 *   1. The new page connects to the EXISTING SharedWorker (via a new port).
 *   2. The SharedWorker's `loadedModels` set still has the model.
 *   3. The `load` message handler checks `isModelLoaded(modelId)` → true.
 *   4. It responds with `{ type: "loaded" }` IMMEDIATELY — no actual
 *      loading, no log entries, no CDN fetch, no Cache Storage read.
 *
 * This satisfies the requirement: "load transformers.js and default model
 * ONCE at app runtime, NOT on refresh page."
 *
 * ─── ARCHITECTURE ──────────────────────────────────────────────────────
 * This file is intentionally thin. All logic lives in focused modules under
 * `./pose-detection/`:
 *   - constants.ts         — model registry, CDN URLs, timeouts, defaults
 *   - types.ts             — message protocol + domain types
 *   - port-bus.ts          — port registry + broadcast / routed helpers
 *   - transformers-loader  — CDN import with single-init guard
 *   - model-cache.ts       — model + processor cache, in-flight tracking
 *   - nms.ts               — IoU + Non-Maximum Suppression (pure)
 *   - yolov8-parser.ts     — ONNX tensor → persons (pure)
 *   - detection.ts         — inference orchestration
 *   - message-handler.ts   — inbound message routing
 *
 * MESSAGE PROTOCOL — see `./pose-detection/types.ts` for the full contract.
 */

/// <reference lib="webworker" />

import { addPort } from "./pose-detection/port-bus";
import { handleMessage } from "./pose-detection/message-handler";

// ─── SharedWorker connect handler ────────────────────────────────────── //
// Fires when a new tab/page connects to this SharedWorker. Each connection
// gets its own MessagePort. The worker's module-level state (model cache,
// loaded models, transformers.js module) is SHARED across all ports — that's
// the whole point of SharedWorker.
//
// Issue 5 fix — per-port state (like the OffscreenCanvas overlay) is
// cleaned up lazily: when `postToPort` / `broadcast` fails to send to a
// closed port, that port is removed from the registry. The OffscreenCanvas
// itself is GC'd by the browser once the port is gone. We don't need an
// explicit `onclose` handler (MessagePort doesn't expose one).
(self as unknown as SharedWorkerGlobalScope).onconnect = (e: MessageEvent) => {
  const port: MessagePort = e.ports[0];
  addPort(port);
  port.start(); // start receiving messages on this port

  port.onmessage = (ev: MessageEvent) => {
    // `handleMessage` owns all routing + error handling. It is async but we
    // intentionally do not await it here — onmessage cannot be async and we
    // don't need to block the event loop.
    void handleMessage(port, ev.data);
  };
};

export {};