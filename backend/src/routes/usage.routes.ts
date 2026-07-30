import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  usageQuerySchema,
  consumeUsageSchema,
  customerIdParamsSchema,
} from '../schemas/usage.schema';
import * as usageService from '../services/usage.service';
import { parsePaging } from '../utils/pagination';
import { sendOk, sendPaginated } from '../utils/response';

const router = Router();

router.use(requireAuth);

// Global usage list
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req);
    const customerId =
      typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const franchiseId =
      typeof req.query.franchiseId === 'string' ? req.query.franchiseId : undefined;
    const start =
      typeof req.query.start === 'string' ? new Date(req.query.start) : undefined;
    const end =
      typeof req.query.end === 'string' ? new Date(req.query.end) : undefined;
    const result = await usageService.listUsage({
      ...paging,
      customerId,
      franchiseId,
      start,
      end,
    });
    return sendPaginated(res, result);
  }),
);

// Per-customer usage detail
router.get(
  '/:customerId',
  validate({ params: customerIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req);
    const start =
      typeof req.query.start === 'string' ? new Date(req.query.start) : undefined;
    const end =
      typeof req.query.end === 'string' ? new Date(req.query.end) : undefined;
    const result = await usageService.getUsageByCustomer(req.params.customerId, {
      ...paging,
      start,
      end,
    });
    return sendOk(res, result);
  }),
);

// Consume usage (manual or proxy-driven)
router.post(
  '/consume',
  validate({ body: consumeUsageSchema }),
  asyncHandler(async (req, res) => {
    const usage = await usageService.consumeUsage(req.body);
    return sendOk(res, usage, 201, 'Usage recorded');
  }),
);

// silence unused
void usageQuerySchema;

export default router;
