import { z } from 'zod';

export const notificationQuerySchema = z.object({
  customerId: z.string().optional(),
  unreadOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

export const notificationIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const createNotificationSchema = z.object({
  customerId: z.string().optional().nullable(),
  type: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(['INFO', 'WARN', 'ERROR', 'SUCCESS']).default('INFO'),
});
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
