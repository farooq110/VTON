import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { settingsUpdateSchema } from '../schemas/settings.schema';
import * as settingsService from '../services/settings.service';
import { sendOk } from '../utils/response';

/**
 * Settings routes — app-wide settings, scoped per franchise (Issue 1 fix).
 *
 *   GET    /api/settings    → franchise's settings (seeded on first call)
 *   PUT    /api/settings    → upsert settings (auth required)
 *   DELETE /api/settings    → reset to defaults (auth required)
 */
const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings(req);
  return sendOk(res, { settings });
}));

router.put('/', requireAuth, validate({ body: settingsUpdateSchema }), asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req, req.body);
  return sendOk(res, { settings }, 200, 'Settings updated');
}));

router.delete('/', requireAuth, asyncHandler(async (req, res) => {
  const settings = await settingsService.resetSettings(req);
  return sendOk(res, { settings }, 200, 'Settings reset to defaults');
}));

export default router;
