import type { DetectionModel, TryOnSettings } from "@/types";
import { DEFAULT_PRICE_RANGE } from "@/types";

/**
 * Detection models registered for selection in Settings.
 *
 * Both the person-detection section AND the posture-estimation section draw
 * from this SAME list — every model here is a YOLOv8-pose variant that
 * returns BOTH bounding boxes (for person detection) AND 17 COCO keypoints
 * (for posture checks). Downloading a model once makes it available for
 * BOTH stages.
 *
 * Future-ready — add new entries here and they automatically appear in both
 * model-selection sections.
 */
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
    name: "MediaPipe Pose",
    description: "Google's solution with 33 landmarks. Excellent for face/head alignment checks. ~9 MB.",
    sizeMb: 9.0,
    speedMs: 50,
    accuracy: "Balanced",
    recommended: false,
  },
  {
    id: "movenet-lightning",
    name: "MoveNet Lightning",
    description: "TensorFlow Lite model, 17 keypoints. Very fast on mobile GPUs. ~12 MB.",
    sizeMb: 12.0,
    speedMs: 30,
    accuracy: "Fast",
    recommended: false,
  },
];

/**
 * Map every DetectionModelId to its HuggingFace repo. Shared by the person-
 * detection and posture-estimation flows — downloading a repo caches it for
 * both stages.
 */
export const MODEL_REPO: Record<string, string> = {
  "yolov8n-pose": "Xenova/yolov8n-pose",
  "yolov8s-pose": "Xenova/yolov8s-pose",
  "mediapipe-pose": "Xenova/yolov8n-pose",
  "movenet-lightning": "Xenova/yolov8n-pose",
};

export const DEFAULT_SETTINGS: TryOnSettings = {
  /** Default currency is Pakistani Rupees (PKR). */
  currency: "PKR",
  /** Price range bounds for the FiltersModal (editable from Settings). */
  priceRange: { ...DEFAULT_PRICE_RANGE },
  /** Stage 1 model — person detection. */
  personDetectionModelId: "yolov8n-pose",
  /** Stage 3 model — posture estimation. Independent selection. */
  postureModelId: "yolov8n-pose",
  /** Legacy field — kept for backward compat, migrated on load. */
  activeModelId: "yolov8n-pose",
  poseThresholds: {
    personScore: 0.6,
    shoulderTiltDeg: 12,
    faceYawDeg: 18,
    facePitchDeg: 15,
    minBodyVisibility: 0.55,
  },
  /** Stage 1 tuning parameters (owned by the person-detection section). */
  personDetectionParams: {
    confidenceThreshold: 0.6,
    nmsIouThreshold: 0.5,
    maxPersons: 10,
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

/**
 * Migrates a persisted settings object from the OLD schema (which only had
 * `activeModelId`) to the NEW schema (which has separate
 * `personDetectionModelId` + `postureModelId` + `personDetectionParams`).
 *
 * Called once when the Zustand store rehydrates from localStorage. If the
 * persisted settings already have the new fields, this is a no-op.
 */
export function migrateSettings(persisted: Partial<TryOnSettings>): TryOnSettings {
  const defaults = structuredClone(DEFAULT_SETTINGS);
  if (!persisted || typeof persisted !== "object") return defaults;

  const merged: TryOnSettings = { ...defaults, ...persisted };

  // Migrate old `activeModelId` → both new fields (if new fields are absent).
  if (persisted.activeModelId && !persisted.personDetectionModelId) {
    merged.personDetectionModelId = persisted.activeModelId;
  }
  if (persisted.activeModelId && !persisted.postureModelId) {
    merged.postureModelId = persisted.activeModelId;
  }

  // Ensure personDetectionParams exists with defaults.
  if (!merged.personDetectionParams) {
    merged.personDetectionParams = structuredClone(defaults.personDetectionParams);
  } else {
    merged.personDetectionParams = {
      ...defaults.personDetectionParams,
      ...merged.personDetectionParams,
    };
  }

  // Ensure poseThresholds is fully populated (in case a partial was persisted).
  merged.poseThresholds = { ...defaults.poseThresholds, ...merged.poseThresholds };
  merged.compression = { ...defaults.compression, ...merged.compression };
  merged.theme = { ...defaults.theme, ...merged.theme };
  // Ensure priceRange is always present with sensible defaults so the
  // FiltersModal never reads undefined bounds. Older persisted settings (pre
  // price-range feature) won't have this field — fall back to the defaults.
  merged.priceRange = {
    min: Math.max(0, Math.round(Number(merged.priceRange?.min ?? defaults.priceRange.min))),
    max: Math.max(0, Math.round(Number(merged.priceRange?.max ?? defaults.priceRange.max))),
  };
  if (merged.priceRange.max < merged.priceRange.min) {
    merged.priceRange.max = merged.priceRange.min;
  }
  // Ensure currency is always present. Old persisted settings (pre currency
  // feature) won't have this field — default to PKR.
  if (!merged.currency || typeof merged.currency !== "string") {
    merged.currency = defaults.currency;
  }

  return merged;
}

/** Mock brand fallback — fetched from backend /api/brand in production. */
export const FALLBACK_BRAND = {
  id: "brnd_atelier_nova",
  name: "Atelier Nova",
  logoUrl: "",
  coverBannerUrl: "",
  tagline: "Try then Buy",
};
