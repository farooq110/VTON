/**
 * Electron preload — exposes a tiny, audited `nova` API to the renderer.
 * Renderer never gets direct Node access; everything goes through here.
 *
 * To add a new privileged operation (file save, native dialog, etc.),
 * add an ipcMain handler in main.ts and a thin wrapper here.
 *
 * ─── Issue 3 fix — safe event subscriptions ────────────────────────────
 * Event-style IPC channels (those that emit repeatedly, like
 * `nova:systemEvent`) are exposed via `onSystemEvent`, which returns an
 * explicit UNSUBSCRIBE function. Callers MUST call the returned function
 * on unmount to remove the listener — otherwise listeners stack up on
 * every re-render, causing memory leaks and duplicate callback firing.
 *
 * Pattern:
 *   useEffect(() => {
 *     const unsubscribe = window.nova.onSystemEvent("capture-saved", handleSave);
 *     return () => unsubscribe();   // ← critical
 *   }, []);
 *
 * The wrapper wraps the user callback in a subscription shim that strips
 * the first (event) arg, so the renderer doesn't see Electron's
 * `IpcRendererEvent` object. The shim is what gets registered with
 * `ipcRenderer.on`; the unsubscribe function calls
 * `ipcRenderer.removeListener` with the SAME shim reference, which is the
 * only way `removeListener` can actually find + remove it.
 */
import { contextBridge, ipcRenderer } from "electron";

/** Channels the renderer is allowed to subscribe to for one-to-many events. */
export type SystemEventChannel =
  | "nova:systemEvent";

const nova = {
  /** App version (from package.json) and platform info for telemetry/settings. */
  getAppInfo: () => ipcRenderer.invoke("nova:getAppInfo"),
  /** Show a native save dialog and return the chosen path (or null). */
  saveImage: (dataUrl: string, suggestedName: string) =>
    ipcRenderer.invoke("nova:saveImage", dataUrl, suggestedName),
  /** Toggle fullscreen kiosk mode for boutique displays. */
  toggleFullscreen: () => ipcRenderer.invoke("nova:toggleFullscreen"),

  /**
   * Issue 3 fix — subscribe to a system event channel.
   *
   * Returns an UNSUBSCRIBE function. The caller MUST call it on unmount
   * (typically in a `useEffect` cleanup) to remove the listener —
   * otherwise duplicate listeners accumulate on every re-render, causing
   * memory leaks and duplicate callback firing.
   *
   * The wrapper detaches Electron's `IpcRendererEvent` first arg so the
   * renderer only sees the payload. We keep a stable reference to the
   * subscription shim so `removeListener` can find it later.
   */
  onSystemEvent: (
    channel: SystemEventChannel,
    callback: (...args: unknown[]) => void,
  ): (() => void) => {
    const subscription = (_event: unknown, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  /** Whether we're running inside Electron (vs plain web). */
  isElectron: true,
};

contextBridge.exposeInMainWorld("nova", nova);

// TypeScript shim consumed by src/lib/electron-bridge.ts
export type NovaBridge = typeof nova;
