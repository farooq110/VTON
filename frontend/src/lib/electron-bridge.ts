/**
 * Electron bridge — typed global declaration for `window.nova`.
 *
 * This file is a type-only module. It augments the global `Window` interface
 * with the `nova` surface exposed by `electron/preload.ts` so React
 * components and hooks can call `window.nova.onSystemEvent(...)` with full
 * type safety (and `window.nova?.isElectron` guards for the web build).
 *
 * Issue 3 fix — `onSystemEvent` returns an UNSUBSCRIBE function so callers
 * can clean up listeners on unmount, preventing the duplicate-subscription
 * memory leak.
 */
export type NovaBridge = {
  getAppInfo: () => Promise<unknown>;
  saveImage: (dataUrl: string, suggestedName: string) => Promise<string | null>;
  toggleFullscreen: () => Promise<void>;
  onSystemEvent: (
    channel: "nova:systemEvent",
    callback: (...args: unknown[]) => void,
  ) => () => void;
  isElectron: boolean;
};

declare global {
  interface Window {
    nova?: NovaBridge;
  }
}

export {};
