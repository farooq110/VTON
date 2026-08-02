/**
 * useOffscreenCanvas — Issue 5 fix.
 *
 * Transfers control of a `<canvas>` element to the SharedWorker via
 * `canvas.transferControlToOffscreen()`. All subsequent drawing operations
 * happen on the WORKER thread, freeing the main thread for React rendering
 * and user interaction.
 *
 * The transferred `OffscreenCanvas` is posted to the worker with message
 * type `init-canvas`. The worker owns the canvas from this point on — the
 * main thread can no longer draw to it directly.
 *
 * Usage in a React component:
 *   const canvasRef = useRef<HTMLCanvasElement>(null);
 *   const offscreenReady = useOffscreenCanvas(canvasRef);
 *
 *   useEffect(() => {
 *     // The worker now owns the canvas. Send draw commands via postMessage.
 *     worker.port.postMessage({ type: "draw-pose", keypoints });
 *   }, [keypoints, offscreenReady]);
 *
 * If the browser doesn't support OffscreenCanvas (Safari < 16.4, older
 * mobile browsers), the hook returns `false` and the caller should fall
 * back to main-thread drawing.
 *
 * NOTE: the canvas MUST be transferred before the worker tries to draw to
 * it. Once transferred, calling `canvas.getContext("2d")` on the main
 * thread throws — the canvas is "deported" to the worker.
 */
import { useEffect, useState } from "react";

export function useOffscreenCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Feature detection — gracefully degrade on browsers without
    // OffscreenCanvas support.
    if (typeof canvas.transferControlToOffscreen !== "function") {
      setReady(false);
      return;
    }

    try {
      const offscreen = canvas.transferControlToOffscreen();

      // Post the OffscreenCanvas to the SharedWorker so its draw loop can
      // own it. We import the worker lazily via the same singleton the
      // pose-detection hook uses, so there's exactly ONE worker for the
      // whole app.
      //
      // The transfer list `[offscreen]` MOVES the canvas to the worker —
      // the main thread loses access.
      import("@/hooks/usePoseDetection").then(({ getPoseWorker }) => {
        const worker = getPoseWorker();
        if (!worker) {
          setReady(false);
          return;
        }
        worker.port.postMessage(
          { type: "init-canvas", canvas: offscreen },
          [offscreen],
        );
        setReady(true);
      });
    } catch {
      // transferControlToOffscreen throws if the canvas already has a
      // 2d/webgl context from the main thread. Caller must NOT call
      // canvas.getContext before this hook runs.
      setReady(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}
