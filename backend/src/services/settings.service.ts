import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { Setting } from '@prisma/client';
import type { SettingsUpdateInput } from '../schemas/settings.schema';

const svcLogger = logger.child({ service: 'settings' });

export interface SettingsDto {
  currency: string;
  priceRange: { min: number; max: number };
  personDetectionModelId: string;
  postureModelId: string;
  activeModelId?: string;
  poseThresholds: {
    personScore: number;
    shoulderTiltDeg: number;
    faceYawDeg: number;
    facePitchDeg: number;
    minBodyVisibility: number;
  };
  personDetectionParams: {
    confidenceThreshold: number;
    nmsIouThreshold: number;
    maxPersons: number;
  };
  compression: {
    maxFileSizeKb: number;
    minQuality: number;
    qualityStep: number;
    dimensionStep: number;
    stripMetadata: boolean;
    stripChunks: boolean;
  };
  captureTimerSeconds: number;
  taglineRefreshMs: number;
  productTapBehavior: string;
  debugLogging: boolean;
  telemetryEnabled: boolean;
  autoPreloadModel: boolean;
  theme: {
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
    fontFamily: string;
    baseFontSize: string;
  };
}

function toDto(s: Setting): SettingsDto {
  return {
    currency: s.currency,
    priceRange: { min: s.priceRangeMin, max: s.priceRangeMax },
    personDetectionModelId: s.personDetectionModelId,
    postureModelId: s.postureModelId,
    poseThresholds: JSON.parse(s.poseThresholds),
    personDetectionParams: JSON.parse(s.personDetectionParams),
    compression: JSON.parse(s.compression),
    captureTimerSeconds: s.captureTimerSeconds,
    taglineRefreshMs: s.taglineRefreshMs,
    productTapBehavior: s.productTapBehavior,
    debugLogging: s.debugLogging,
    telemetryEnabled: s.telemetryEnabled,
    autoPreloadModel: s.autoPreloadModel,
    theme: {
      primaryColor: s.themePrimaryColor,
      accentColor: s.themeAccentColor,
      backgroundColor: s.themeBackgroundColor,
      fontFamily: s.themeFontFamily,
      baseFontSize: s.themeBaseFontSize,
    },
  };
}

function defaultDto(): SettingsDto {
  return {
    currency: 'PKR',
    priceRange: { min: 0, max: 10000 },
    personDetectionModelId: 'yolov8n-pose',
    postureModelId: 'yolov8n-pose',
    poseThresholds: { personScore: 0.6, shoulderTiltDeg: 12, faceYawDeg: 18, facePitchDeg: 15, minBodyVisibility: 0.55 },
    personDetectionParams: { confidenceThreshold: 0.6, nmsIouThreshold: 0.5, maxPersons: 10 },
    compression: { maxFileSizeKb: 1000, minQuality: 0.7, qualityStep: 0.05, dimensionStep: 0.05, stripMetadata: true, stripChunks: true },
    captureTimerSeconds: 3,
    taglineRefreshMs: 2400,
    productTapBehavior: 'expand',
    debugLogging: false,
    telemetryEnabled: false,
    autoPreloadModel: false,
    theme: { primaryColor: '#7c2d4a', accentColor: '#c9a55c', backgroundColor: '#faf8f5', fontFamily: 'serif', baseFontSize: 'base' },
  };
}

/**
 * Issue 1 fix — returns the franchiseId from the request's authenticated user.
 * This is the key used to scope settings per franchise. Falls back to "global"
 * for super_admin users who don't belong to a specific franchise.
 */
function getFranchiseScope(req: { user?: { franchiseId?: string } | null }): string {
  return req.user?.franchiseId ?? 'global';
}

/**
 * Issue 1 fix — returns the settings for the user's franchise.
 * If no Setting row exists for this franchise, one is seeded with defaults.
 */
export async function getSettings(req: { user?: { franchiseId?: string } | null }): Promise<SettingsDto> {
  const franchiseId = getFranchiseScope(req);
  let setting = await prisma.setting.findUnique({
    where: { franchiseId },
  });
  if (!setting) {
    svcLogger.info({ franchiseId }, 'No settings row — seeding defaults');
    setting = await prisma.setting.create({ data: { franchiseId } });
  }
  return toDto(setting);
}

/**
 * Issue 1 fix — updates settings for the user's franchise.
 */
export async function updateSettings(
  req: { user?: { franchiseId?: string } | null },
  patch: SettingsUpdateInput,
): Promise<SettingsDto> {
  const franchiseId = getFranchiseScope(req);

  const data: Record<string, unknown> = {};
  if (patch.currency !== undefined) data.currency = patch.currency;
  if (patch.priceRange !== undefined) { data.priceRangeMin = patch.priceRange.min; data.priceRangeMax = patch.priceRange.max; }
  if (patch.personDetectionModelId !== undefined) data.personDetectionModelId = patch.personDetectionModelId;
  if (patch.postureModelId !== undefined) data.postureModelId = patch.postureModelId;
  if (patch.poseThresholds !== undefined) data.poseThresholds = JSON.stringify(patch.poseThresholds);
  if (patch.personDetectionParams !== undefined) data.personDetectionParams = JSON.stringify(patch.personDetectionParams);
  if (patch.compression !== undefined) data.compression = JSON.stringify(patch.compression);
  if (patch.captureTimerSeconds !== undefined) data.captureTimerSeconds = patch.captureTimerSeconds;
  if (patch.taglineRefreshMs !== undefined) data.taglineRefreshMs = patch.taglineRefreshMs;
  if (patch.productTapBehavior !== undefined) data.productTapBehavior = patch.productTapBehavior;
  if (patch.debugLogging !== undefined) data.debugLogging = patch.debugLogging;
  if (patch.telemetryEnabled !== undefined) data.telemetryEnabled = patch.telemetryEnabled;
  if (patch.autoPreloadModel !== undefined) data.autoPreloadModel = patch.autoPreloadModel;
  if (patch.theme !== undefined) {
    data.themePrimaryColor = patch.theme.primaryColor;
    data.themeAccentColor = patch.theme.accentColor;
    data.themeBackgroundColor = patch.theme.backgroundColor;
    data.themeFontFamily = patch.theme.fontFamily;
    data.themeBaseFontSize = patch.theme.baseFontSize;
  }

  const setting = await prisma.setting.upsert({
    where: { franchiseId },
    create: { franchiseId, ...data },
    update: data,
  });
  svcLogger.info({ franchiseId }, 'settings updated');
  return toDto(setting);
}

/**
 * Issue 1 fix — resets settings to defaults for the user's franchise.
 */
export async function resetSettings(req: { user?: { franchiseId?: string } | null }): Promise<SettingsDto> {
  const franchiseId = getFranchiseScope(req);
  await prisma.setting.deleteMany({ where: { franchiseId } });
  const setting = await prisma.setting.create({ data: { franchiseId } });
  svcLogger.info({ franchiseId }, 'settings reset to defaults');
  return toDto(setting);
}
