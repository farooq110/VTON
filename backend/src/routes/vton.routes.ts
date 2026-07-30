import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  submitTryonSchema,
  vtonListQuerySchema,
  vtonIdParamsSchema,
  vtonCreditsQuerySchema,
} from '../schemas/vton.schema';
import * as vtonService from '../services/vton.service';
import { parsePaging } from '../utils/pagination';
import { sendOk, sendPaginated } from '../utils/response';

const router = Router();

router.use(requireAuth);

router.post(
  '/tryon',
  validate({ body: submitTryonSchema }),
  asyncHandler(async (req, res) => {
    const result = await vtonService.submitTryon(req.body);
    return sendOk(res, result, 201, result.message);
  }),
);

router.get(
  '/list',
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req);
    const customerId =
      typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const franchiseId =
      typeof req.query.franchiseId === 'string' ? req.query.franchiseId : undefined;
    const status =
      typeof req.query.status === 'string' ? req.query.status : undefined;
    const result = await vtonService.listTryonRequests({
      ...paging,
      customerId,
      franchiseId,
      status,
    });
    return sendPaginated(res, result);
  }),
);

router.get(
  '/status/:id',
  validate({ params: vtonIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await vtonService.pollTryon(req.params.id);
    return sendOk(res, result);
  }),
);

router.get(
  '/credits',
  validate({ query: vtonCreditsQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await vtonService.getCreditsSummary(req.query.customerId as string);
    return sendOk(res, result);
  }),
);

// silence unused
void vtonListQuerySchema;

export default router;
