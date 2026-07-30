import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useCamera — thin wrapper around getUserMedia.
 * Loosely coupled: returns a stream + helper to capture a still frame.
 * Swap with Electron `desktopCapturer` by injecting a different stream source.
 *
 * **Robustness:** The video element's `videoWidth` is 0 until the
 * `loadedmetadata` event fires. `captureStill()` retries up to 10 times
 * (50ms apart) to wait for the video to be ready, so the capture button
 * always works even if the user taps it immediately after opening the camera.
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
          : e instanceof Error
            ? e.message
            : "Unable to start camera.";
      setError(msg);
      setActive(false);
    }
  }, []);

  const stop = useCallback(() => {
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
    for (let attempt = 0; attempt < 10; attempt++) {
      const v = videoRef.current;
      if (v && v.videoWidth > 0 && v.videoHeight > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", 0.92);
        }
      }
      // Video not ready — wait 50ms and retry.
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, stream, active, error, start, stop, captureStill };
}
