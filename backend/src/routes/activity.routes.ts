import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { requireAuth } from '../middleware/auth.middleware';
import * as activityService from '../services/activity.service';
import { sendOk } from '../utils/response';

const router = Router();

router.use(requireAuth);

router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const summary = await activityService.getActivitySummary();
    return sendOk(res, summary);
  }),
);

router.get(
  '/peaks',
  asyncHandler(async (req, res) => {
    const days =
      typeof req.query.days === 'string'
        ? Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365)
        : 30;
    const peaks = await activityService.getPeakTimes(days);
    return sendOk(res, peaks);
  }),
);

export default router;
