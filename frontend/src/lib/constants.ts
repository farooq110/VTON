import type { DetectionModel, TryOnSettings } from "@/types";

/** Detection models registered for selection in Settings. Future-ready — add new entries here. */
export const DETECTION_MODELS: DetectionModel[] = [
  {
    id: "yolov8n-pose",
    name: "YOLOv8n Pose",
    description: "Fastest, lightest. ~3.2 MB. Ideal for in-browser real-time detection on tablets and kiosks.",
    sizeMb: 3.2,
    speedMs: 35,
    accuracy: "Fast",
    recommended: true,
  },
  {
    id: "yolov8s-pose",
    name: "YOLOv8s Pose",
    description: "Higher accuracy, ~11 MB. Better for low-light captures where the nano variant may miss keypoints.",
    sizeMb: 11.4,
    speedMs: 90,
    accuracy: "Accurate",
    recommended: false,
  },
  {
    id: "mediapipe-pose",
    name: "MediaPipe Pose (uses YOLOv8n)",
    description: "MediaPipe repo not yet available on HuggingFace — falls back to YOLOv8n. ~3.2 MB.",
    sizeMb: 3.2,
    speedMs: 35,
    accuracy: "Fast",
    recommended: false,
  },
  {
    id: "movenet-lightning",
    name: "MoveNet Lightning (uses YOLOv8n)",
    description: "MoveNet repo not yet available on HuggingFace — falls back to YOLOv8n. ~3.2 MB.",
    sizeMb: 3.2,
    speedMs: 35,
    accuracy: "Fast",
    recommended: false,
  },
];

export const DEFAULT_SETTINGS: TryOnSettings = {
  activeModelId: "yolov8n-pose",
  poseThresholds: {
    personScore: 0.6,
    shoulderTiltDeg: 12,
    faceYawDeg: 18,
    facePitchDeg: 15,
    minBodyVisibility: 0.55,
  },
  compression: {
    maxFileSizeKb: 1000,
    minQuality: 0.7,
    qualityStep: 0.05,
    dimensionStep: 0.05,
    stripMetadata: true,
    stripChunks: true,
  },
  captureTimerSeconds: 3,
  taglineRefreshMs: 2400,
  productTapBehavior: "expand" as const,
  debugLogging: false,
  telemetryEnabled: false,
  autoPreloadModel: false,
  theme: {
    primaryColor: "#7c2d4a",
    accentColor: "#c9a55c",
    backgroundColor: "#faf8f5",
    fontFamily: "serif",
    baseFontSize: "base",
  },
};

/** Mock brand fallback — fetched from backend /api/brand in production. */
export const FALLBACK_BRAND = {
  id: "brnd_atelier_nova",
  name: "Atelier Nova",
  logoUrl: "",
  coverBannerUrl: "",
  tagline: "Try then Buy",
};
