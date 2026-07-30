import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { trackTryonSchema, trackListQuerySchema } from '../schemas/tryon-track.schema';
import * as trackService from '../services/tryon-track.service';
import { sendOk, sendPaginated } from '../utils/response';

/**
 * TryOn routes — tracking + AI proxy.
 *
 *   POST /api/tryon/track          → log a try-on request (auth required)
 *   GET  /api/tryon/track/list     → paged list (auth required)
 *   GET  /api/tryon/track/count    → aggregated counts per brand (auth required)
 *   POST /api/tryon/run            → proxy to TryOn AI provider (auth required)
 *
 * The /run endpoint keeps the TryOn AI API key on the server — the frontend
 * never sees it. The server forwards the request to the configured provider
 * (FASHN.ai etc.) and returns the result image.
 */
const router = Router();

router.use(requireAuth);

// ─── TryOn AI proxy ───────────────────────────────────────────────────── //
const tryonRunSchema = z.object({
  userImage: z.string().min(1, 'userImage is required'),
  productSku: z.string().min(1),
  productName: z.string().optional(),
  productCategory: z.string().optional(),
  garmentImage: z.string().optional(),
});

router.post(
  '/run',
  validate({ body: tryonRunSchema }),
  asyncHandler(async (req, res) => {
    const { userImage, productSku, productName, productCategory, garmentImage } = req.body;

    // The actual TryOn AI endpoint + key are configured server-side via env
    // vars — NEVER sent to the client.
    const tryonEndpoint = process.env.TRYON_AI_ENDPOINT || '';
    const tryonApiKey = process.env.TRYON_AI_API_KEY || '';

    if (!tryonEndpoint) {
      throw new Error(
        'NOT_FOUND: TryOn AI endpoint is not configured on the server. Set TRYON_AI_ENDPOINT in the backend .env file.',
      );
    }

    // Forward to the TryOn AI provider
    let aiRes: Response;
    try {
      aiRes = await fetch(tryonEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tryonApiKey ? { Authorization: `Bearer ${tryonApiKey}` } : {}),
        },
        body: JSON.stringify({
          user_image: userImage,
          garment_image: garmentImage ?? '',
          garment_sku: productSku,
          garment_category: productCategory ?? '',
          product_name: productName ?? '',
        }),
      });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Network error';
      throw new Error(`FASHN_ERROR: Failed to reach TryOn AI at ${tryonEndpoint}: ${msg}`);
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      throw new Error(
        `FASHN_ERROR: TryOn AI returned HTTP ${aiRes.status}: ${errText.slice(0, 200)}`,
      );
    }

    const aiData: any = await aiRes.json();
    const resultImage =
      aiData?.result_image ?? aiData?.url ?? aiData?.output ?? aiData?.data?.result_image;

    if (!resultImage) {
      throw new Error('FASHN_ERROR: TryOn AI response missing result image field');
    }

    return sendOk(res, { resultImage }, 200, 'Try-on complete');
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
