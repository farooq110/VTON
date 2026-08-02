/**
 * useSystemEvent — safe Electron IPC subscription hook (Issue 3 fix).
 *
 * Wraps `window.nova.onSystemEvent` so callers don't have to remember the
 * unsubscribe dance. Returns nothing; the callback is invoked whenever the
 * channel emits.
 *
 * Usage:
 *   useSystemEvent("nova:systemEvent", (...args) => {
 *     console.log("got event", args);
 *   });
 *
 * The hook automatically:
 *   1. Skips subscription when running in the web build (window.nova is
 *      undefined) — no-op, no errors.
 *   2. Subscribes on mount, unsubscribes on unmount.
 *   3. Re-subscribes if the callback identity changes (callback is in the
 *      dep list — callers should memoise it with useCallback if they
 *      don't want churn).
 *
 * This eliminates the duplicate-listener memory leak that occurs when
 * components call `ipcRenderer.on` directly without an unsubscribe in a
 * `useEffect` cleanup.
 */
import { useEffect } from "react";

export function useSystemEvent(
  channel: "nova:systemEvent",
  callback: (...args: unknown[]) => void,
): void {
  useEffect(() => {
    if (typeof window === "undefined" || !window.nova?.onSystemEvent) return;

    const unsubscribe = window.nova.onSystemEvent(channel, callback);
    return () => {
      unsubscribe();
    };
  }, [channel, callback]);
}
