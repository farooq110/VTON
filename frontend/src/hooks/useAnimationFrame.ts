/**
 * useAnimationFrame — safe requestAnimationFrame loop hook (Issue 4 fix).
 *
 * Runs `callback` on every animation frame. Stores the rAF handle and
 * cancels it on unmount or when `callback` changes — preventing the
 * "background zombie loop" bug where a pose-overlay render loop keeps
 * firing after the component has unmounted or the modal has closed.
 *
 * Usage:
 *   useAnimationFrame((deltaMs) => {
 *     drawPoseOverlay(keypoints);
 *   }, active);
 *
 * Pass `active = false` to pause the loop without unmounting the component
 * (e.g. when a modal is minimised). The loop auto-resumes when `active`
 * flips back to true.
 *
 * The callback receives the delta time in milliseconds since the previous
 * frame, useful for time-based animation. The hook uses a ref to hold the
 * latest callback so the loop doesn't restart on every callback identity
 * change — only `active` controls the loop lifecycle.
 */
import { useEffect, useRef } from "react";

export function useAnimationFrame(
  callback: (deltaMs: number) => void,
  active: boolean = true,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!active) return;

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const deltaMs = now - lastTime;
      lastTime = now;
      callbackRef.current(deltaMs);
      // Schedule the next frame AFTER the callback runs, so we always have
      // a fresh handle to cancel.
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    // Cleanup — cancel the pending frame. Without this, the loop would
    // keep firing on a potentially-unmounted component ("zombie loop").
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [active]);
}
