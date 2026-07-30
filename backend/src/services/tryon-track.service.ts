import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { TrackTryonInput, TrackListQuery } from '../schemas/tryon-track.schema';

/**
 * TryOn tracking service — persists a row in `TryOnLog` every time the
 * frontend's orchestrator completes a TryOn AI call (success or failure).
 *
 * The frontend calls `POST /api/tryon/track` fire-and-forget; this service
 * must never throw back to the client — tracking failures are logged but
 * swallowed so they don't block the user's try-on experience.
 */

const svcLogger = logger.child({ service: 'tryon-track' });

export interface TrackResult {
  id: string;
  ok: true;
}

export async function track(input: TrackTryonInput): Promise<TrackResult> {
  try {
    const row = await prisma.tryOnLog.create({
      data: {
        brandId: input.brandId,
        franchiseId: input.franchiseId,
        userId: input.userId,
        productSku: input.productSku,
        status: input.status,
        durationMs: input.durationMs,
        timestamp: input.timestamp ? new Date(input.timestamp) : new Date(),
      },
    });
    return { id: row.id, ok: true };
  } catch (err) {
    // Swallow — tracking is best-effort. Don't break the user's try-on flow.
    svcLogger.error(
      { err: (err as Error).message, brandId: input.brandId },
      'failed to persist tryon track row',
    );
    return { id: 'track_failed', ok: true };
  }
}

export interface TrackListResult {
  items: Array<{
    id: string;
    brandId: string;
    franchiseId: string;
    userId: string;
    productSku: string;
    status: string;
    durationMs: number | null;
    timestamp: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lists try-on log rows — used by the admin portal's per-brand usage
 * dashboard. Never throws; on DB failure returns an empty page.
 */
export async function listTracks(
  query: TrackListQuery,
): Promise<TrackListResult> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (query.brandId) where.brandId = query.brandId;
  if (query.franchiseId) where.franchiseId = query.franchiseId;
  if (query.userId) where.userId = query.userId;

  try {
    const [rows, total] = await Promise.all([
      prisma.tryOnLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.tryOnLog.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        brandId: r.brandId,
        franchiseId: r.franchiseId,
        userId: r.userId,
        productSku: r.productSku,
        status: r.status,
        durationMs: r.durationMs,
        timestamp: r.timestamp.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  } catch (err) {
    svcLogger.error(
      { err: (err as Error).message },
      'failed to list tryon tracks',
    );
    return { items: [], total: 0, page, pageSize };
  }
}

/**
 * Aggregated count of try-on requests per brand. Used by the admin portal's
 * brand dashboard card ("N requests this week"). Never throws.
 */
export async function brandRequestCount(brandId: string): Promise<number> {
  try {
    return await prisma.tryOnLog.count({ where: { brandId } });
  } catch (err) {
    svcLogger.error(
      { err: (err as Error).message, brandId },
      'failed to count tryon tracks for brand',
    );
    return 0;
  }
}
