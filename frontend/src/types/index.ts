/**
 * Shared types for the Atelier Nova TryOn app.
 * Loosely coupled — interfaces only, no implementation imports.
 */

/**
 * Roles supported by the app. Four-role boutique model:
 *   super_admin / developer / manager / public_user
 *
 * Legacy "user" / "admin" values have been removed — they were aliases for
 * `public_user` / `super_admin` and only caused RBAC ambiguity. Sign-in
 * demo credentials and the backend auth flow must use one of the four
 * canonical roles below.
 */
export type Role =
  | "super_admin"
  | "developer"
  | "manager"
  | "public_user";

export interface User {
  id: string;
  email: string;
  name: string;
  brandId: string;
  franchiseId: string;
  role: Role;
}

/** Can the user open the Settings screen at all? */
export function canAccessSettings(role: Role | undefined): boolean {
  return (
    role === "super_admin" ||
    role === "developer" ||
    role === "manager"
  );
}

/** Can the user manage BRAND settings — cover, name, logo? (manager + developer + super_admin)
 *  Issue 2 fix — developer now has the SAME brand permissions as manager so
 *  they can test everything (logo, cover, theme) without needing a manager
 *  account. */
export function canManageBrand(role: Role | undefined): boolean {
  return role === "super_admin" || role === "manager" || role === "developer";
}

/** Can the user view the activity log overlay? (manager + developer + super_admin) */
export function canViewActivityLog(role: Role | undefined): boolean {
  return role === "super_admin" || role === "developer" || role === "manager";
}

/** Can the user manage FEATURE settings — models, thresholds, compression? (developer + super_admin) */
export function canManageFeatures(role: Role | undefined): boolean {
  return role === "super_admin" || role === "developer";
}

/** Can the user manage USERS — create / disable / change role? (super_admin only) */
export function canManageUsers(role: Role | undefined): boolean {
  return role === "super_admin";
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  developer: "Developer",
  manager: "Franchise Manager",
  public_user: "Public User",
};

export interface Brand {
  id: string;
  name: string;
  logoUrl: string;
  coverBannerUrl: string;
  /** Manager-uploaded cover image (overrides coverBannerUrl when set). */
  customCoverBannerUrl?: string;
  /** Manager-set brand name (overrides the default name when set). */
  customName?: string;
  /** Manager-uploaded logo image (overrides logoUrl when set). */
  customLogoUrl?: string;
  tagline: string;
}

export interface Product {
  id: string;
  sku: string;
  code: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  imageUrl: string;
  garmentOverlayUrl: string;
  sizes: string[];
  colors: { name: string; hex: string }[];
  isNew?: boolean;
  inStock: boolean;
  /** 0..100 — used by the home screen's "Trending" rail. Higher = more trending. */
  trendingScore?: number;
}

export type TryOnStageId =
  | "stage1-person-detection"
  | "stage2-compression"
  | "stage3-pose-check"
  | "calling-ai"
  | "tracking-brand";

export interface TryOnStage {
  id: TryOnStageId;
  label: string;
  status: "pending" | "active" | "passed" | "failed";
  detail?: string;
}

export interface SavedCaptureImage {
  id: string;
  dataUrl: string;
  thumbnailUrl: string;
  capturedAt: number;
  passedAllStages: boolean;
  sizeKb: number;
}

export interface TryOnResult {
  id: string;
  imageUrl: string;
  productSku: string;
  createdAt: number;
  brandRequestId?: string;
}

export type DetectionModelId =
  | "yolov8n-pose"
  | "yolov8s-pose"
  | "mediapipe-pose"
  | "movenet-lightning";

export interface DetectionModel {
  id: DetectionModelId;
  name: string;
  description: string;
  sizeMb: number;
  speedMs: number;
  accuracy: "Fast" | "Balanced" | "Accurate";
  recommended: boolean;
}

export interface PoseThresholds {
  personScore: number;
  shoulderTiltDeg: number;
  faceYawDeg: number;
  facePitchDeg: number;
  minBodyVisibility: number;
}

/**
 * PersonDetectionParams — tuning parameters for the PERSON DETECTION model
 * (Stage 1 only). Kept SEPARATE from PoseThresholds (which drive Stage 3
 * posture checks) so each model section in Settings owns its own knobs.
 *
 * `confidenceThreshold` rejects detections below this score (0..1).
 * `nmsIouThreshold` controls how aggressively overlapping boxes are merged.
 * `maxPersons` caps the number of detections returned (perf guard).
 */
export interface PersonDetectionParams {
  /** Minimum person confidence (0..1). Detections below this are discarded. */
  confidenceThreshold: number;
  /** IoU threshold for Non-Maximum Suppression (0..1). Higher = fewer merges. */
  nmsIouThreshold: number;
  /** Max number of person detections to return (perf guard). */
  maxPersons: number;
}

export interface ImageCompressionSettings {
  maxFileSizeKb: number;
  minQuality: number;
  qualityStep: number;
  dimensionStep: number;
  stripMetadata: boolean;
  stripChunks: boolean;
}

/**
 * Theme settings — boutique-appearance customization. Driven by the
 * ThemeSection settings panel and applied to the document root by the
 * <ThemeApplier /> component (mounted once at the app root).
 */
export interface ThemeSettings {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  baseFontSize: string;
}

/**
 * PriceRangeSettings — controls the bounds of the price filter shown in the
 * FiltersModal. Driven by the Settings page so the boutique manager can
 * narrow or widen the shopping range without touching code.
 *
 * Defaults: min = 0, max = 10000 (both rounded to whole numbers).
 */
export interface PriceRangeSettings {
  /** Lower bound of the price slider in the FiltersModal. */
  min: number;
  /** Upper bound of the price slider in the FiltersModal. */
  max: number;
}

export interface TryOnSettings {
  /**
   * Dynamic currency code (ISO 4217) controlled through Settings.
   * Defaults to "PKR" (Pakistani Rupees). Used by `formatPrice`
   * across the app so changing this one field updates every price display.
   */
  currency: string;
  /**
   * Price range bounds surfaced in the FiltersModal. Edited from the
   * Settings page (Feature settings section). Defaults to { min: 0, max: 10000 }.
   */
  priceRange: PriceRangeSettings;
  /**
   * Model used for STAGE 1 — person detection (how many people are in the
   * frame). Selectable independently from the posture model.
   */
  personDetectionModelId: DetectionModelId;
  /**
   * Model used for STAGE 3 — posture estimation (shoulder tilt, face yaw,
   * body visibility). Selectable independently from the person-detection
   * model.
   *
   * NOTE: Both models are YOLOv8-pose variants that return BOTH bounding
   * boxes AND keypoints. Downloading a model makes it available for BOTH
   * stages — the download is shared. The selection just controls which
   * variant is used for each stage.
   */
  postureModelId: DetectionModelId;
  /**
   * @deprecated Use `personDetectionModelId` instead. Kept for backward
   * compatibility with persisted older settings; migrated on load.
   */
  activeModelId?: DetectionModelId;
  poseThresholds: PoseThresholds;
  /** Tuning parameters for the person-detection model (Stage 1). */
  personDetectionParams: PersonDetectionParams;
  compression: ImageCompressionSettings;
  captureTimerSeconds: number;
  taglineRefreshMs: number;
  productTapBehavior: "navigate" | "expand" | "modal";
  debugLogging: boolean;
  /** When true, error-level logs are POSTed to /api/telemetry (fire-and-forget). */
  telemetryEnabled: boolean;
  autoPreloadModel: boolean;
  theme: ThemeSettings;
}

export interface BrandTryOnRequest {
  id: string;
  brandId: string;
  franchiseId: string;
  userId: string;
  productSku: string;
  timestamp: number;
  status: "success" | "failed";
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: number;
}

/**
 * Activity log entry — every meaningful user/system event in the app.
 *
 * Used by the ActivityLogPanel overlay (debug only — gated by
 * `settings.debugLogging` + `canViewActivityLog(role)`).
 */
export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  category:
    | "auth"
    | "navigation"
    | "capture"
    | "tryon"
    | "model"
    | "compression"
    | "network"
    | "settings"
    | "camera"
    | "interaction";
  label: string;
  durationMs?: number;
  detail?: string;
  level: "info" | "warn" | "error";
  /**
   * Optional actionable tip shown alongside error/warn entries — explains
   * HOW to fix the issue. Surfaced in the ActivityLogPanel as a highlighted
   * "Fix" callout so the user isn't left guessing.
   */
  tip?: string;
  /** Name of the component that emitted the log (for interaction logs). */
  component?: string;
}

/** Client-side filter state — applied to the products list. */
export interface ProductFilters {
  query: string;
  category: string; // "all" | category name
  sizes: string[]; // selected sizes (OR — match any)
  colors: string[]; // selected color names (OR)
  priceMin: number | null;
  priceMax: number | null;
  inStockOnly: boolean;
  newArrivalsOnly: boolean;
}

export const EMPTY_FILTERS: ProductFilters = {
  query: "",
  category: "all",
  sizes: [],
  colors: [],
  priceMin: null,
  priceMax: null,
  inStockOnly: false,
  newArrivalsOnly: false,
};

/** Default price-range bounds surfaced in Settings + FiltersModal. */
export const DEFAULT_PRICE_RANGE: PriceRangeSettings = {
  min: 0,
  max: 10000,
};
