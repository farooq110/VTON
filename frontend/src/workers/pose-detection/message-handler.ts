/**
 * pose-detection — inbound message handler.
 *
 * Routes messages arriving on a connected `MessagePort` to the appropriate
 * worker operation. Keeps the SharedWorker entry file thin by owning all of
 * the `load` / `detect` / `status` / `evict` dispatch logic.
 *
 * Routing rules:
 *   - Broadcast (loaded, progress, log, error): sent to ALL ports.
 *   - Routed   (detect-result, status):         sent ONLY to the asking port.
 */

import type { DetectionModelId } from "@/types";
import {
  DEFAULT_NMS_IOU_THRESHOLD,
  DEFAULT_MAX_PERSONS,
} from "./constants";
import type { WorkerInboundMessage } from "./types";
import {
  broadcast,
  postToPort,
} from "./port-bus";
import {
  isModelLoaded,
  getLoadedModels,
  evictModel,
  loadModelWithProgress,
} from "./model-cache";
import { runDetection } from "./detection";

/**
 * Handles a single inbound message from a connected port.
 *
 * Errors thrown by `load` are broadcast to all ports (they affect everyone).
 * Errors from `detect` are routed only to the requesting port, since other
 * tabs may have unrelated in-flight detections.
 */
export async function handleMessage(
  port: MessagePort,
  raw: unknown,
): Promise<void> {
  if (!raw || typeof raw !== "object") return;
  const msg = raw as WorkerInboundMessage;

  try {
    switch (msg.type) {
      case "load":
        await handleLoad(msg.modelId);
        break;

      case "detect":
        await handleDetect(port, msg);
        break;

      case "status":
        postToPort(port, {
          type: "status",
          loadedModels: getLoadedModels(),
        });
        break;

      case "evict":
        evictModel(msg.modelId);
        break;
    }
  } catch (err) {
    broadcast({
      type: "error",
      message: err instanceof Error ? err.message : "Worker error",
    });
  }
}

/**
 * Loads a model (or no-ops if already loaded) and broadcasts `loaded`.
 *
 * KEY: if the model is already loaded, respond IMMEDIATELY. This is what
 * makes the worker SILENT on page refresh — the SharedWorker's `loadedModels`
 * set persists across refreshes, so on refresh this branch is taken and NO
 * loading happens (no "Loading transformers.js from CDN", no "Loading model"
 * log entries).
 */
async function handleLoad(modelId: DetectionModelId): Promise<void> {
  if (isModelLoaded(modelId)) {
    broadcast({ type: "loaded", modelId });
    return;
  }
  await loadModelWithProgress(modelId);
  broadcast({ type: "loaded", modelId });
}

/**
 * Runs a detection and routes the result back to the requesting port only.
 */
async function handleDetect(
  port: MessagePort,
  msg: Extract<WorkerInboundMessage, { type: "detect" }>,
): Promise<void> {
  const { modelId, imageDataUrl, minScore, reqId } = msg;
  const nmsIouThreshold = msg.nmsIouThreshold ?? DEFAULT_NMS_IOU_THRESHOLD;
  const maxPersons = msg.maxPersons ?? DEFAULT_MAX_PERSONS;

  try {
    const detection = await runDetection({
      modelId,
      imageDataUrl,
      minScore,
      nmsIouThreshold,
      maxPersons,
    });
    postToPort(port, { type: "detect-result", reqId, ok: true, detection });
  } catch (err) {
    postToPort(port, {
      type: "detect-result",
      reqId,
      ok: false,
      error: err instanceof Error ? err.message : "Detection failed",
    });
  }
}
