import { z } from 'zod';

export const themeSchema = z.object({
  primaryColor: z.string(),
  accentColor: z.string(),
  backgroundColor: z.string(),
  fontFamily: z.string(),
  baseFontSize: z.string(),
});

export const poseThresholdsSchema = z.object({
  personScore: z.number(),
  shoulderTiltDeg: z.number(),
  faceYawDeg: z.number(),
  facePitchDeg: z.number(),
  minBodyVisibility: z.number(),
});

export const personDetectionParamsSchema = z.object({
  confidenceThreshold: z.number(),
  nmsIouThreshold: z.number(),
  maxPersons: z.number(),
});

export const compressionSchema = z.object({
  maxFileSizeKb: z.number(),
  minQuality: z.number(),
  qualityStep: z.number(),
  dimensionStep: z.number(),
  stripMetadata: z.boolean(),
  stripChunks: z.boolean(),
});

export const priceRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
});

export const settingsUpdateSchema = z.object({
  currency: z.string().max(3).optional(),
  priceRange: priceRangeSchema.optional(),
  personDetectionModelId: z.string().optional(),
  postureModelId: z.string().optional(),
  activeModelId: z.string().optional(),
  poseThresholds: poseThresholdsSchema.optional(),
  personDetectionParams: personDetectionParamsSchema.optional(),
  compression: compressionSchema.optional(),
  captureTimerSeconds: z.number().optional(),
  taglineRefreshMs: z.number().optional(),
  productTapBehavior: z.string().optional(),
  debugLogging: z.boolean().optional(),
  telemetryEnabled: z.boolean().optional(),
  autoPreloadModel: z.boolean().optional(),
  theme: themeSchema.optional(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
