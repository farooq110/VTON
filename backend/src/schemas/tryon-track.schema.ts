import { z } from 'zod';

/**
 * TryOn tracking schemas — used by the frontend's try-on orchestrator to log
 * every successful (or failed) virtual try-on against a brand + franchise so
 * the admin portal can show per-brand request counts.
 *
 * The shape matches what the frontend's `useTryOnOrchestrator` hook posts to
 * `/api/tryon/track` (fire-and-forget on the client; never blocks the UI).
 */
export const trackTryonSchema = z.object({
  brandId: z.string().min(1),
  franchiseId: z.string().min(1),
  userId: z.string().min(1),
  productSku: z.string().min(1),
  timestamp: z.number().int().nonnegative().optional(),
  status: z.enum(['success', 'failed', 'skipped']).default('success'),
  durationMs: z.number().int().nonnegative().optional(),
});
export type TrackTryonInput = z.infer<typeof trackTryonSchema>;

export const trackListQuerySchema = z.object({
  brandId: z.string().min(1).optional(),
  franchiseId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});
export type TrackListQuery = z.infer<typeof trackListQuerySchema>;
