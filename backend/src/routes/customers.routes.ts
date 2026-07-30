import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerIdParamsSchema,
  createApiKeySchema,
  upsertCustomerPricingSchema,
} from '../schemas/customer.schema';
import * as customerService from '../services/customer.service';
import { parsePaging, parseSearch, skipTake } from '../utils/pagination';
import { sendOk, sendPaginated } from '../utils/response';

const router = Router();

router.use(requireAuth);

// List + create
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req);
    const search = parseSearch(req);
    const result = await customerService.listCustomers({ ...paging, search });
    return sendPaginated(res, result);
  }),
);

router.post(
  '/',
  validate({ body: createCustomerSchema }),
  asyncHandler(async (req, res) => {
    const customer = await customerService.createCustomer(req.body);
    return sendOk(res, customer, 201, 'Customer created');
  }),
);

// Detail / update / delete
router.get(
  '/:id',
  validate({ params: customerIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const customer = await customerService.getCustomer(req.params.id);
    return sendOk(res, customer);
  }),
);

router.put(
  '/:id',
  validate({ params: customerIdParamsSchema, body: updateCustomerSchema }),
  asyncHandler(async (req, res) => {
    const customer = await customerService.updateCustomer(req.params.id, req.body);
    return sendOk(res, customer, 200, 'Customer updated');
  }),
);

router.delete(
  '/:id',
  validate({ params: customerIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await customerService.deleteCustomer(req.params.id);
    return sendOk(res, null, 200, 'Customer deleted');
  }),
);

// API keys
router.get(
  '/:id/api-keys',
  validate({ params: customerIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const keys = await customerService.listApiKeys(req.params.id);
    return sendOk(res, keys);
  }),
);

router.post(
  '/:id/api-keys',
  validate({ params: customerIdParamsSchema, body: createApiKeySchema }),
  asyncHandler(async (req, res) => {
    const key = await customerService.createApiKey(req.params.id, req.body);
    return sendOk(res, key, 201, 'API key created');
  }),
);

router.delete(
  '/:id/api-keys/:apiKeyId',
  validate({ params: customerIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await customerService.revokeApiKey(req.params.id, req.params.apiKeyId);
    return sendOk(res, null, 200, 'API key revoked');
  }),
);

// Pricing tiers
router.get(
  '/:id/pricing',
  validate({ params: customerIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const tiers = await customerService.listCustomerPricing(req.params.id);
    return sendOk(res, tiers);
  }),
);

router.post(
  '/:id/pricing',
  validate({ params: customerIdParamsSchema, body: upsertCustomerPricingSchema }),
  asyncHandler(async (req, res) => {
    const tiers = await customerService.upsertCustomerPricing(
      req.params.id,
      req.body,
    );
    return sendOk(res, tiers, 200, 'Pricing tiers saved');
  }),
);

// silence unused import in some build configs
void skipTake;

export default router;
