import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { pingDatabase, disconnectPrisma } from '../lib/prisma';
import { pingRedis, isUsingFallback } from '../lib/redis';

const router = Router();

/**
 * GET /health — DB + Redis connectivity check.
 * Returns 200 if DB is reachable; 503 otherwise.
 * Redis falling back to in-memory is reported but does NOT fail the check
 * (the app keeps working).
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([pingDatabase(), pingRedis()]);

    const status = dbOk ? 'ok' : 'degraded';
    const httpStatus = dbOk ? 200 : 503;

    res.status(httpStatus).json({
      success: dbOk,
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          ok: dbOk,
        },
        redis: {
          ok: redisOk,
          fallback: isUsingFallback(),
          note: isUsingFallback()
            ? 'Redis unavailable — using in-memory LRU cache (no-op queues)'
            : 'connected',
        },
      },
    });
  }),
);

router.get(
  '/shutdown',
  asyncHandler(async (_req, res) => {
    await disconnectPrisma();
    res.status(200).json({ success: true, message: 'DB disconnected' });
  }),
);

export default router;
