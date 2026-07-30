import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  notificationIdParamsSchema,
  notificationQuerySchema,
} from '../schemas/notification.schema';
import * as notificationService from '../services/notification.service';
import { parsePaging } from '../utils/pagination';
import { sendOk, sendPaginated } from '../utils/response';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req);
    const customerId =
      typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const unreadOnly =
      typeof req.query.unreadOnly === 'string'
        ? req.query.unreadOnly === 'true' || req.query.unreadOnly === '1'
        : false;
    const result = await notificationService.listNotifications({
      ...paging,
      customerId,
      unreadOnly,
    });
    return sendPaginated(res, result);
  }),
);

router.post(
  '/:id/read',
  validate({ params: notificationIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await notificationService.markRead(req.params.id);
    return sendOk(res, null, 200, 'Notification marked as read');
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const customerId =
      typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const result = await notificationService.markAllRead(customerId);
    return sendOk(res, result, 200, `${result.count} notifications marked as read`);
  }),
);

// silence unused
void notificationQuerySchema;

export default router;
