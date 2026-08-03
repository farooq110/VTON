import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { settingsUpdateSchema } from '../schemas/settings.schema';
import * as settingsService from '../services/settings.service';
import { sendOk } from '../utils/response';

/**
 * Settings routes — app-wide settings (theme, currency, model IDs, etc.).
 *
 *   GET    /api/settings    → active brand's settings (seeded on first call)
 *   PUT    /api/settings    → upsert settings (auth required)
 *   DELETE /api/settings    → reset to defaults (auth required)
 */
const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const settings = await settingsService.getSettings();
    return sendOk(res, { settings });
  }),
);

router.put(
  '/',
  requireAuth,
  validate({ body: settingsUpdateSchema }),
  asyncHandler(async (req, res) => {
    const settings = await settingsService.updateSettings(req.body);
    return sendOk(res, { settings }, 200, 'Settings updated');
  }),
);

router.delete(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const settings = await settingsService.resetSettings();
    return sendOk(res, { settings }, 200, 'Settings reset to defaults');
  }),
);

export default router;
