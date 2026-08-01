import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { trackTryonSchema, trackListQuerySchema } from '../schemas/tryon-track.schema';
import * as trackService from '../services/tryon-track.service';
import * as tryonRunService from '../services/tryon-run.service';
import { sendOk, sendPaginated } from '../utils/response';
import { logger } from '../lib/logger';

/**
 * TryOn routes — tracking + AI proxy.
 *
 *   POST /api/tryon/run            → synchronous try-on (submit + poll + return image)
 *   POST /api/tryon/track          → log a try-on request (auth required)
 *   GET  /api/tryon/track/list     → paged list (auth required)
 *   GET  /api/tryon/track/count    → aggregated counts per brand (auth required)
 *
 * ─── API KEY LOGIC ───────────────────────────────────────────────────────
 * The API key is NEVER read from environment variables. Instead:
 *   1. The endpoint resolves the customer from the request body (customerId
 *      or franchiseId) or falls back to the first customer with an active
 *      API key (demo mode).
 *   2. The customer's active (non-revoked, non-expired) API key is loaded
 *      from the database, decrypted, and used to authenticate the FASHN.ai
 *      call.
 *   3. ONLY the FASHN base URL comes from the environment
 *      (FASHN_API_BASE_URL) — set in backend/.env.
 *
 * If NO customer API key exists in the database, the endpoint returns a
 * MOCK result (the user's own image) with `mock: true` so the frontend
 * pipeline completes end-to-end without crashing. Assign a real API key
 * via the admin portal to enable live AI try-on.
 * ──────────────────────────────────────────────────────────────────────────
 */
const router = Router();

const routeLogger = logger.child({ route: 'tryon' });

router.use(requireAuth);

// ─── TryOn AI proxy (synchronous: submit + poll + return) ────────────── //
const tryonRunSchema = z.object({
  userImage: z.string().min(1, 'userImage is required'),
  productSku: z.string().min(1, 'productSku is required'),
  productName: z.string().optional(),
  productCategory: z.string().optional(),
  garmentImage: z.string().optional(),
  franchiseId: z.string().optional(),
  customerId: z.string().optional(),
});

router.post(
  '/run',
  validate({ body: tryonRunSchema }),
  asyncHandler(async (req, res) => {
    const input: tryonRunService.TryonRunInput = req.body;

    routeLogger.info(
      {
        productSku: input.productSku,
        hasFranchise: !!input.franchiseId,
        hasCustomer: !!input.customerId,
        userId: req.user?.sub,
      },
      'POST /api/tryon/run',
    );

    const result = await tryonRunService.tryonRun(input);

    return sendOk(
      res,
      result,
      200,
      result.mock
        ? 'Try-on complete (mock — no customer API key configured)'
        : 'Try-on complete',
    );
  }),
);

// ─── TryOn tracking ───────────────────────────────────────────────────── //

router.post(
  '/track',
  validate({ body: trackTryonSchema }),
  asyncHandler(async (req, res) => {
    const result = await trackService.track(req.body);
    return sendOk(res, result, 201, 'Tracked');
  }),
);

router.get(
  '/track/list',
  validate({ query: trackListQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await trackService.listTracks(req.query as any);
    return sendPaginated(res, result);
  }),
);

router.get(
  '/track/count',
  asyncHandler(async (req, res) => {
    const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : '';
    const count = brandId
      ? await trackService.brandRequestCount(brandId)
      : 0;
    return sendOk(res, { brandId, count });
  }),
);

export default router;
