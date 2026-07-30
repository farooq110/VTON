/**
 * Electron preload — exposes a tiny, audited `nova` API to the renderer.
 * Renderer never gets direct Node access; everything goes through here.
 *
 * To add a new privileged operation (file save, native dialog, etc.),
 * add an ipcMain handler in main.ts and a thin wrapper here.
 */
import { contextBridge, ipcRenderer } from "electron";

const nova = {
  /** App version (from package.json) and platform info for telemetry/settings. */
  getAppInfo: () => ipcRenderer.invoke("nova:getAppInfo"),
  /** Show a native save dialog and return the chosen path (or null). */
  saveImage: (dataUrl: string, suggestedName: string) =>
    ipcRenderer.invoke("nova:saveImage", dataUrl, suggestedName),
  /** Toggle fullscreen kiosk mode for boutique displays. */
  toggleFullscreen: () => ipcRenderer.invoke("nova:toggleFullscreen"),
  /** Whether we're running inside Electron (vs plain web). */
  isElectron: true,
};

contextBridge.exposeInMainWorld("nova", nova);

// TypeScript shim consumed by src/lib/electron-bridge.ts
export type NovaBridge = typeof nova;
