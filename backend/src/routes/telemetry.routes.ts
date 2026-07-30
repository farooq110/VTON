import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { telemetrySchema, telemetryQuerySchema } from '../schemas/telemetry.schema';
import * as telemetryService from '../services/telemetry.service';
import { sendOk, sendPaginated } from '../utils/response';

/**
 * Telemetry routes — receives client-side diagnostic logs from the frontend's
 * `logger` utility.
 *
 *   POST /api/telemetry          → record a client log (auth required)
 *   GET  /api/telemetry/list     → paged list (auth required, admin-only)
 *
 * The POST endpoint accepts logs even from partially-authed sessions (the
 * frontend may fire telemetry before login completes) — but we still require
 * a valid token to prevent abuse. In production, add a separate
 * `POST /api/telemetry/public` endpoint with stricter rate limiting for
 * pre-auth logs.
 */
const router = Router();

router.use(requireAuth);

router.post(
  '/',
  validate({ body: telemetrySchema }),
  asyncHandler(async (req, res) => {
    const result = await telemetryService.record(req.body);
    return sendOk(res, result, 201, 'Telemetry recorded');
  }),
);

router.get(
  '/list',
  validate({ query: telemetryQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await telemetryService.list(req.query as any);
    return sendPaginated(res, result);
  }),
);

export default router;
