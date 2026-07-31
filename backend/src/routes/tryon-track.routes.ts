import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { trackTryonSchema, trackListQuerySchema } from '../schemas/tryon-track.schema';
import * as trackService from '../services/tryon-track.service';
import { sendOk, sendPaginated } from '../utils/response';
import { logger } from '../lib/logger';

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
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RESILIENCE: When `TRYON_AI_ENDPOINT` (or `TRYON_AI_API_KEY`) is NOT set,
 * the route returns a 200 MOCK response that echoes the user's captured image
 * back as the "result". This makes the app fully functional out-of-the-box —
 * no external AI provider setup required for demos / development. The
 * response payload includes `mock: true` so the frontend can surface a
 * "preview" badge if desired.
 *
 * Previously, a missing `TRYON_AI_ENDPOINT` caused a `NOT_FOUND:` error which
 * the centralized error middleware mapped to HTTP 404 — confusing the frontend
 * (and the developer) because the route itself exists. The mock fallback
 * eliminates that 404 entirely.
 * ───────────────────────────────────────────────────────────────────────────
 */
const router = Router();

const routeLogger = logger.child({ route: 'tryon' });

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

    // ─── MOCK FALLBACK ──────────────────────────────────────────────────
    // If the AI provider isn't configured, return the user's image as the
    // "result" so the frontend pipeline completes end-to-end. This is what
    // the frontend's orchestrator already does in its catch block — moving
    // the fallback to the backend eliminates the HTTP 404 entirely and gives
    // us a single source of truth for the mock behavior.
    if (!tryonEndpoint) {
      routeLogger.warn(
        { productSku },
        'TRYON_AI_ENDPOINT not configured — returning mock result',
      );
      return sendOk(
        res,
        {
          resultImage: userImage,
          mock: true,
          provider: 'mock',
          message: 'Mock result — set TRYON_AI_ENDPOINT in backend/.env to enable real AI.',
        },
        200,
        'Try-on complete (mock)',
      );
    }

    // ─── REAL AI CALL ───────────────────────────────────────────────────
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
      // Use FASHN_ERROR prefix → HTTP 502 (not 404). This makes the failure
      // mode unambiguous: the route works, but the upstream provider is
      // unreachable.
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
      aiData?.result_image ??
      aiData?.output ??
      (Array.isArray(aiData?.output) ? aiData.output[0] : undefined) ??
      aiData?.url ??
      aiData?.data?.result_image ??
      aiData?.data?.url;

    if (!resultImage) {
      throw new Error('FASHN_ERROR: TryOn AI response missing result image field');
    }

    return sendOk(
      res,
      {
        resultImage,
        mock: false,
        provider: process.env.TRYON_AI_PROVIDER || 'fashn',
      },
      200,
      'Try-on complete',
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
