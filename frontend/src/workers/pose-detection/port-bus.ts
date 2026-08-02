/**
 * pose-detection — SharedWorker port bus.
 *
 * Owns the set of connected `MessagePort`s (one per tab) and provides
 * typed helpers for broadcasting messages to every port and for posting
 * routed replies to a single port.
 *
 * Broadcast messages (loaded, progress, log, error) go to ALL ports.
 * Routed messages (detect-result, status) go ONLY to the requesting port.
 */

import type { DetectionModelId } from "@/types";
import type {
  WorkerOutboundMessage,
  WorkerLogLevel,
} from "./types";

/**
 * Registry of currently-connected ports. A SharedWorker can have many
 * ports (one per tab); the worker's module-level state is shared across
 * all of them — that's the whole point of SharedWorker.
 */
const ports = new Set<MessagePort>();

/** Register a port so it receives broadcast messages. */
export function addPort(port: MessagePort): void {
  ports.add(port);
}

/** Remove a port (e.g. when its tab closes). */
export function deletePort(port: MessagePort): void {
  ports.delete(port);
}

/** Send a message to a single port (routed reply). */
export function postToPort(port: MessagePort, msg: WorkerOutboundMessage): void {
  try {
    port.postMessage(msg);
  } catch {
    // Port may be closed (tab closed / refresh). Drop it silently.
    ports.delete(port);
  }
}

/**
 * Broadcast a message to every connected port.
 *
 * Closed ports are pruned on the fly — `postMessage` throws if the port
 * has been disconnected, so we catch and remove those ports.
 */
export function broadcast(msg: WorkerOutboundMessage): void {
  for (const port of ports) {
    try {
      port.postMessage(msg);
    } catch {
      ports.delete(port);
    }
  }
}

/** Broadcast a model-load progress update to all ports. */
export function postProgress(modelId: DetectionModelId, progress: number): void {
  broadcast({ type: "progress", modelId, progress });
}

/** Broadcast a log entry to all ports. */
export function postLog(
  category: string,
  message: string,
  level: WorkerLogLevel = "info",
): void {
  broadcast({ type: "log", category, message, level });
}

/** Broadcast a fatal error to all ports. */
export function postError(message: string): void {
  broadcast({ type: "error", message });
}