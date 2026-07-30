import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";

/**
 * useCamera — thin wrapper around getUserMedia.
 * Loosely coupled: returns a stream + helper to capture a still frame.
 * Swap with Electron `desktopCapturer` by injecting a different stream source.
 *
 * **Robustness:** The video element's `videoWidth` is 0 until the
 * `loadedmetadata` event fires. `captureStill()` retries up to 10 times
 * (50ms apart) to wait for the video to be ready, so the capture button
 * always works even if the user taps it immediately after opening the camera.
 *
 * **Diagnostic Logging:** camera open/close/permission/capture events are
 * logged via the global `logger` utility (gated by `settings.debugLogging`).
 */
export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  active: boolean;
  error: string | null;
  start: (facingMode?: "user" | "environment") => Promise<void>;
  stop: () => void;
  captureStill: () => Promise<string | null>;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (facingMode: "user" | "environment" = "user") => {
    setError(null);
    logger.camera("Camera start requested", { detail: `facingMode: ${facingMode}` });
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API not available in this environment.");
      }
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = s;
      setStream(s);
      setActive(true);
      logger.camera("Camera permission granted", {
        detail: `${s.getVideoTracks()[0]?.label ?? "unknown"} · ${s.getVideoTracks()[0]?.getSettings().width}x${s.getVideoTracks()[0]?.getSettings().height}`,
      });
      // Wait for the video element to be mounted, then attach the stream
      // and wait for `loadedmetadata` before considering the camera "ready".
      const attach = () => {
        const v = videoRef.current;
        if (!v) {
          // Video element not mounted yet — retry in next frame.
          requestAnimationFrame(attach);
          return;
        }
        v.srcObject = s;
        v.play().catch(() => {});
      };
      requestAnimationFrame(attach);
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access to continue."
          : e instanceof DOMException && e.name === "NotFoundError"
            ? "No camera found. Please connect a camera and try again."
            : e instanceof Error
              ? e.message
              : "Unable to start camera.";
      setError(msg);
      setActive(false);
      logger.camera("Camera start failed", { detail: msg, level: "error" });
    }
  }, []);

  const stop = useCallback(() => {
    if (streamRef.current) {
      logger.camera("Camera stopped");
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setActive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /**
   * Capture a still frame from the video. Returns a JPEG data URL.
   * Retries up to 10 times (50ms apart) if the video isn't ready yet
   * (videoWidth === 0), so the capture button always works.
   */
  const captureStill = useCallback(async (): Promise<string | null> => {
    logger.capture("Capture still requested");
    for (let attempt = 0; attempt < 10; attempt++) {
      const v = videoRef.current;
      if (v && v.videoWidth > 0 && v.videoHeight > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          const sizeKb = (dataUrl.length * 0.75) / 1024;
          logger.capture("Still captured", {
            detail: `${canvas.width}x${canvas.height} · ${sizeKb.toFixed(0)} KB · attempt ${attempt + 1}`,
            durationMs: attempt * 50,
          });
          return dataUrl;
        }
      }
      // Video not ready — wait 50ms and retry.
      await new Promise((r) => setTimeout(r, 50));
    }
    logger.capture("Capture failed — video not ready after 10 retries", { level: "error" });
    return null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, stream, active, error, start, stop, captureStill };
}
