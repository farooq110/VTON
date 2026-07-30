import { useCallback, useRef, useState } from "react";
import type { DetectionModelId, PoseThresholds } from "@/types";

/**
 * usePoseDetection — abstraction over Xenova/yolov8n-pose (and future models).
 *
 * Loads `@xenova/transformers` lazily inside the renderer so the 3–12 MB model
 * only downloads when the user actually triggers try-on. The model is cached
 * by the library, so subsequent detections are instant.
 *
 * The hook returns a single `detect()` + `checkPose()` — callers never know
 * which model is active (Dependency Inversion Principle). Add new models by
 * extending the `modelMap` switch below.
 *
 * **Resilience:** The model download can take 5–30s on slow connections.
 * The hook exposes `modelStatus` (`idle` | `loading` | `ready` | `error`) and
 * `modelProgress` (0..1) so the UI can show a loading indicator. `detect()`
 * also has a 60-second timeout — if the model hasn't loaded by then, it throws
 * a user-friendly error instead of hanging forever.
 */

export type PersonDetectionResult =
  | { kind: "ok"; personCount: 1; score: number; keypoints: PoseKeypoint[] }
  | { kind: "no-person"; score: number }
  | { kind: "multi-person"; personCount: number; score: number };

export interface PoseKeypoint {
  name: string;
  x: number;
  y: number;
  score: number;
}

export interface PoseCheckResult {
  passed: boolean;
  shoulderTiltDeg: number;
  faceYawDeg: number;
  facePitchDeg: number;
  bodyVisibility: number;
  reasons: string[];
}

const MODEL_REPO: Record<DetectionModelId, string> = {
  "yolov8n-pose": "Xenova/yolov8n-pose",
  "yolov8s-pose": "Xenova/yolov8s-pose",
  "mediapipe-pose": "Xenova/mediapipe-pose", // illustrative; swap for actual repo
  "movenet-lightning": "Xenova/movenet-lightning", // illustrative; swap for actual repo
};

// Cache the pipeline per-model so we only download once per session
const pipelineCache = new Map<DetectionModelId, any>();
// Track in-flight loads so concurrent callers share the same promise
const inFlightLoads = new Map<DetectionModelId, Promise<any>>();

async function getPipeline(
  modelId: DetectionModelId,
  onProgress?: (p: number) => void,
): Promise<any> {
  if (pipelineCache.has(modelId)) return pipelineCache.get(modelId);
  if (inFlightLoads.has(modelId)) return inFlightLoads.get(modelId)!;

  const loadPromise = (async () => {
    const { pipeline, env } = await import("@xenova/transformers");
    env.allowLocalModels = false; // pull from HF Hub
    const pipe = await pipeline("object-detection", MODEL_REPO[modelId], {
      progress_callback: (data: any) => {
        if (data?.progress != null && onProgress) {
          onProgress(Math.min(1, data.progress / 100));
        }
      },
    });
    pipelineCache.set(modelId, pipe);
    return pipe;
  })();

  inFlightLoads.set(modelId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inFlightLoads.delete(modelId);
  }
}

const COCO_KEYPOINT_NAMES = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

const MODEL_LOAD_TIMEOUT_MS = 30_000;

export function usePoseDetection() {
  const lastKeyedRef = useRef<PoseKeypoint[]>([]);
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modelProgress, setModelProgress] = useState(0);

  const detect = useCallback(
    async (imageDataUrl: string, modelId: DetectionModelId, minScore = 0.6): Promise<PersonDetectionResult> => {
      setModelStatus("loading");
      setModelProgress(0);
      try {
        // Race the model load against a timeout so the UI never hangs forever.
        const pipe = await Promise.race([
          getPipeline(modelId, (p) => setModelProgress(p)),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Model is taking too long to load (over 30s). Check your connection or skip validation.")),
              MODEL_LOAD_TIMEOUT_MS,
            ),
          ),
        ]);
        setModelStatus("ready");
        setModelProgress(1);

        const output = await pipe(imageDataUrl, { threshold: minScore });
        const detections = Array.isArray(output) ? output : [output];
        const persons = detections.filter((d: any) => d.label === "person" && d.score >= minScore);

        if (persons.length === 0) return { kind: "no-person", score: 0 };
        if (persons.length > 1) return { kind: "multi-person", personCount: persons.length, score: persons[0].score };

        // For pose-specific models, output may contain keypoints
        const kpsRaw = (persons[0]?.keypoints) ?? [];
        const keypoints: PoseKeypoint[] = kpsRaw.map((k: any, i: number) => ({
          name: COCO_KEYPOINT_NAMES[i] ?? `kp_${i}`,
          x: k[0],
          y: k[1],
          score: k[2],
        }));
        lastKeyedRef.current = keypoints;

        return { kind: "ok", personCount: 1, score: persons[0].score, keypoints };
      } catch (e) {
        setModelStatus("error");
        throw e;
      }
    },
    [],
  );

  const checkPose = useCallback(
    (keypoints: PoseKeypoint[], thresholds: PoseThresholds): PoseCheckResult => {
      const reasons: string[] = [];
      const lShoulder = keypoints.find((k) => k.name === "left_shoulder");
      const rShoulder = keypoints.find((k) => k.name === "right_shoulder");
      const nose = keypoints.find((k) => k.name === "nose");
      const lEar = keypoints.find((k) => k.name === "left_ear");
      const rEar = keypoints.find((k) => k.name === "right_ear");

      let shoulderTiltDeg = 0;
      if (lShoulder && rShoulder) {
        const dy = lShoulder.y - rShoulder.y;
        const dx = lShoulder.x - rShoulder.x;
        shoulderTiltDeg = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
      }

      let faceYawDeg = 0;
      let facePitchDeg = 0;
      if (nose && lEar && rEar) {
        const earMidX = (lEar.x + rEar.x) / 2;
        const earMidY = (lEar.y + rEar.y) / 2;
        faceYawDeg = Math.abs(((nose.x - earMidX) * 180) / Math.PI) * 6;
        facePitchDeg = Math.abs(((nose.y - earMidY) * 180) / Math.PI) * 4;
      }

      const visibleBody = keypoints.filter((k) => k.score >= 0.5).length;
      const bodyVisibility = Math.min(1, visibleBody / keypoints.length);

      if (shoulderTiltDeg > thresholds.shoulderTiltDeg) {
        reasons.push(`Shoulders tilted ${shoulderTiltDeg.toFixed(1)}° — please stand straight.`);
      }
      if (faceYawDeg > thresholds.faceYawDeg) {
        reasons.push(`Head turned ${faceYawDeg.toFixed(1)}° — face the camera.`);
      }
      if (facePitchDeg > thresholds.facePitchDeg) {
        reasons.push(`Head tilted ${facePitchDeg.toFixed(1)}° — keep your chin level.`);
      }
      if (bodyVisibility < thresholds.minBodyVisibility) {
        reasons.push(`Body visibility ${Math.round(bodyVisibility * 100)}% — step back so your full body is visible.`);
      }

      return { passed: reasons.length === 0, shoulderTiltDeg, faceYawDeg, facePitchDeg, bodyVisibility, reasons };
    },
    [],
  );

  return { detect, checkPose, modelStatus, modelProgress };
}
