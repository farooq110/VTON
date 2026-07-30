import { z } from 'zod';

/**
 * Telemetry schemas — client-side diagnostic logs POSTed by the frontend's
 * `logger` utility (fire-and-forget, only when `settings.telemetryEnabled`
 * is true).
 *
 * These are SEPARATE from the server-side ActivityLog — telemetry captures
 * CLIENT-side events (camera permission denials, model load failures, payload
 * sizes, JS errors) while ActivityLog captures SERVER-side request logs.
 */
export const telemetrySchema = z.object({
  level: z.enum(['info', 'warn', 'error']).default('info'),
  category: z.string().min(1).max(50),
  message: z.string().min(1).max(500),
  detail: z.string().max(2000).optional(),
  timestamp: z.number().int().nonnegative().optional(),
  userAgent: z.string().max(500).optional(),
  url: z.string().max(2000).optional(),
});
export type TelemetryInput = z.infer<typeof telemetrySchema>;

export const telemetryQuerySchema = z.object({
  level: z.enum(['info', 'warn', 'error']).optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});
export type TelemetryQuery = z.infer<typeof telemetryQuerySchema>;
