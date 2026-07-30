import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  createFranchiseSchema,
  updateFranchiseSchema,
  franchiseIdParamsSchema,
} from '../schemas/franchise.schema';
import * as franchiseService from '../services/franchise.service';
import { parsePaging, parseSearch } from '../utils/pagination';
import { sendOk, sendPaginated } from '../utils/response';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req);
    const search = parseSearch(req);
    const customerId =
      typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const result = await franchiseService.listFranchises({
      ...paging,
      customerId,
      search,
    });
    return sendPaginated(res, result);
  }),
);

router.post(
  '/',
  validate({ body: createFranchiseSchema }),
  asyncHandler(async (req, res) => {
    const franchise = await franchiseService.createFranchise(req.body);
    return sendOk(res, franchise, 201, 'Franchise created');
  }),
);

router.get(
  '/:id',
  validate({ params: franchiseIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const franchise = await franchiseService.getFranchise(req.params.id);
    return sendOk(res, franchise);
  }),
);

router.put(
  '/:id',
  validate({ params: franchiseIdParamsSchema, body: updateFranchiseSchema }),
  asyncHandler(async (req, res) => {
    const franchise = await franchiseService.updateFranchise(
      req.params.id,
      req.body,
    );
    return sendOk(res, franchise, 200, 'Franchise updated');
  }),
);

router.delete(
  '/:id',
  validate({ params: franchiseIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await franchiseService.deleteFranchise(req.params.id);
    return sendOk(res, null, 200, 'Franchise deleted');
  }),
);

export default router;
