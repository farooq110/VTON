import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  calculateBillingSchema,
  pricingIdParamsSchema,
  updatePricingTierSchema,
} from '../schemas/pricing.schema';
import * as pricingService from '../services/pricing.service';
import { sendOk } from '../utils/response';

const router = Router();

router.use(requireAuth);

router.post(
  '/calculate',
  validate({ body: calculateBillingSchema }),
  asyncHandler(async (req, res) => {
    const result = pricingService.calculateBilling(req.body);
    return sendOk(res, result);
  }),
);

router.put(
  '/:id',
  validate({ params: pricingIdParamsSchema, body: updatePricingTierSchema }),
  asyncHandler(async (req, res) => {
    const tier = await pricingService.updatePricingTier(req.params.id, req.body);
    return sendOk(res, tier, 200, 'Pricing tier updated');
  }),
);

router.delete(
  '/:id',
  validate({ params: pricingIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await pricingService.deletePricingTier(req.params.id);
    return sendOk(res, null, 200, 'Pricing tier deleted');
  }),
);

router.get(
  '/:id',
  validate({ params: pricingIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const tier = await pricingService.getPricingTier(req.params.id);
    return sendOk(res, tier);
  }),
);

export default router;
