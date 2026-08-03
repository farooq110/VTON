import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware';
import { brandUpdateSchema } from '../schemas/brand.schema';
import * as brandService from '../services/brand.service';
import { sendOk } from '../utils/response';

/**
 * Brand routes — public read, admin write.
 *
 *   GET    /api/brand         → active brand (or seed default)
 *   GET    /api/brand/list    → all brands
 *   PATCH  /api/brand/:id     → update brand by ID (auth required)
 *   PUT    /api/brand         → upsert active brand (auth required)
 *   DELETE /api/brand/logo    → clear custom logo (auth required)
 *   DELETE /api/brand/cover   → clear custom cover (auth required)
 */
const router = Router();

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (_req, res) => {
    const brand = await brandService.getActiveBrand();
    return sendOk(res, { brand });
  }),
);

router.get(
  '/list',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const brands = await brandService.listBrands();
    return sendOk(res, { brands });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  validate({ body: brandUpdateSchema }),
  asyncHandler(async (req, res) => {
    const updated = await brandService.updateBrand(req.params.id, req.body);
    return sendOk(res, { brand: updated }, 200, 'Brand updated');
  }),
);

router.put(
  '/',
  requireAuth,
  validate({ body: brandUpdateSchema }),
  asyncHandler(async (req, res) => {
    const updated = await brandService.upsertActiveBrand(req.body);
    return sendOk(res, { brand: updated }, 200, 'Brand saved');
  }),
);

router.delete(
  '/logo',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const brand = await brandService.clearCustomLogo();
    return sendOk(res, { brand }, 200, 'Custom logo cleared');
  }),
);

router.delete(
  '/cover',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const brand = await brandService.clearCustomCover();
    return sendOk(res, { brand }, 200, 'Custom cover cleared');
  }),
);

export default router;
