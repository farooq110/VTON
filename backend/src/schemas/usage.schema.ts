import { z } from 'zod';

export const usageQuerySchema = z.object({
  customerId: z.string().optional(),
  franchiseId: z.string().optional(),
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

export const customerIdParamsSchema = z.object({
  customerId: z.string().min(1),
});

export const consumeUsageSchema = z.object({
  customerId: z.string().min(1),
  franchiseId: z.string().optional().nullable(),
  apiKeyId: z.string().optional().nullable(),
  creditsUsed: z.number().int().positive().default(1),
  endpoint: z.string().optional(),
  method: z.string().optional(),
  statusCode: z.number().int().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});
export type ConsumeUsageInput = z.infer<typeof consumeUsageSchema>;
