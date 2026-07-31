import { useAuthStore } from "@/lib/store";
import type { ActivityLogEntry } from "@/types";

/**
 * logger — the global diagnostic logging utility.
 *
 * This is the SINGLE ENTRY POINT for all client-side logging. Every module
 * (camera, pose detection, compression, auth, network, settings) imports
 * `logger` instead of calling `console.log` or `logActivity` directly.
 *
 * **Settings-to-Logger Bridge:** the logger reads `settings.debugLogging`
 * from the Zustand store on every call. When the toggle is OFF, all log
 * calls become no-ops (zero overhead). When ON, logs are:
 *   1. Buffered in the global store (visible in the ActivityLogPanel overlay)
 *   2. Mirrored to `console.{log,warn,error}` for devtools inspection
 *   3. Tagged with a category for filtering
 *
 * **Telemetry:** when `settings.telemetryEnabled` is ON, error-level logs are
 * also POSTed to the backend `/api/telemetry` endpoint (fire-and-forget) so
 * the server can track client-side failures.
 *
 * **Persistence:** the underlying store is persisted to localStorage via
 * Zustand's `persist` middleware, so logs survive page refreshes (up to 100
 * entries — see `store.ts` partialize).
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.capture("Camera opened", { detail: "user-facing camera" });
 *   logger.network("TryOn AI call failed", { detail: err.message, level: "error" });
 *   logger.model("YOLOv8n loaded", { detail: "3.2 MB", durationMs: 1200 });
 */

export type LogCategory = ActivityLogEntry["category"];
export type LogLevel = ActivityLogEntry["level"];

export interface LogOptions {
  detail?: string;
  level?: LogLevel;
  durationMs?: number;
}

class Logger {
  /**
   * Core log method. All public methods delegate to this.
   * No-ops when `settings.debugLogging` is false.
   */
  private emit(category: LogCategory, label: string, opts: LogOptions = {}): void {
    const state = useAuthStore.getState();
    if (!state.settings.debugLogging) return;

    const timestamp = Date.now();

    // 1. Push to the store (renders in the ActivityLogPanel overlay)
    state.logActivity({
      category,
      label,
      detail: opts.detail,
      level: opts.level ?? "info",
      durationMs: opts.durationMs,
      timestamp,
    });

    // 2. Mirror to console for devtools inspection
    const level = opts.level ?? "info";
    const consoleMsg = `[${category.toUpperCase()}] ${label}${opts.detail ? ` — ${opts.detail}` : ""}${opts.durationMs ? ` (${opts.durationMs}ms)` : ""}`;
    switch (level) {
      case "error":
        console.error(consoleMsg);
        break;
      case "warn":
        console.warn(consoleMsg);
        break;
      default:
        console.log(consoleMsg);
    }

    // 3. Fire-and-forget telemetry for errors (if telemetry is enabled)
    if (level === "error" && state.settings.telemetryEnabled) {
      this.sendTelemetry({
        category,
        label,
        detail: opts.detail,
        level,
        timestamp,
      }).catch(() => {
        // Best-effort — never block on telemetry failure
      });
    }
  }

  /** Send an error log to the backend telemetry endpoint (fire-and-forget). */
  private async sendTelemetry(entry: {
    category: string;
    label: string;
    detail?: string;
    level: string;
    timestamp: number;
  }): Promise<void> {
    try {
      const token = localStorage.getItem("nova_token");
      await fetch("/api/telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          level: entry.level,
          category: entry.category,
          message: entry.label,
          detail: entry.detail,
          timestamp: entry.timestamp,
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      });
    } catch {
      // Best-effort — swallow
    }
  }

  // ─── Category-specific convenience methods ────────────────────────────

  /** Auth events — sign in, sign out, token refresh, route guards. */
  auth(label: string, opts?: LogOptions): void {
    this.emit("auth", label, opts);
  }

  /** Navigation events — route changes, redirects. */
  navigation(label: string, opts?: LogOptions): void {
    this.emit("navigation", label, opts);
  }

  /** Camera events — open, close, permission granted/denied, capture. */
  camera(label: string, opts?: LogOptions): void {
    this.emit("camera", label, opts);
  }

  /** Capture events — countdown, still capture, save to gallery. */
  capture(label: string, opts?: LogOptions): void {
    this.emit("capture", label, opts);
  }

  /** Try-on events — pipeline start, stage changes, AI call, result. */
  tryon(label: string, opts?: LogOptions): void {
    this.emit("tryon", label, opts);
  }

  /** Model events — load, download progress, inference, error. */
  model(label: string, opts?: LogOptions): void {
    this.emit("model", label, opts);
  }

  /** Compression events — stage 2 progress, quality reduction, dimension reduction. */
  compression(label: string, opts?: LogOptions): void {
    this.emit("compression", label, opts);
  }

  /** Network events — API calls, failures, retries. */
  network(label: string, opts?: LogOptions): void {
    this.emit("network", label, opts);
  }

  /** Settings events — toggle changes, model switches. */
  settings(label: string, opts?: LogOptions): void {
    this.emit("settings", label, opts);
  }

  /** Generic log — use when no specific category fits. */
  log(category: LogCategory, label: string, opts?: LogOptions): void {
    this.emit(category, label, opts);
  }
}

/** Singleton logger instance — import this everywhere. */
export const logger = new Logger();
