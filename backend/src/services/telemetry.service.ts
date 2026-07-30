import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { TelemetryInput, TelemetryQuery } from '../schemas/telemetry.schema';

/**
 * Telemetry service — persists client-side diagnostic logs.
 *
 * The frontend's `logger` utility POSTs error-level logs here (fire-and-forget)
 * when `settings.telemetryEnabled` is true. This gives the backend visibility
 * into client-side failures (camera permission denials, model load failures,
 * network errors) that would otherwise be invisible.
 *
 * All writes are best-effort — failures are logged but never thrown back to
 * the client (telemetry must never break the user's app experience).
 */

const svcLogger = logger.child({ service: 'telemetry' });

export async function record(input: TelemetryInput): Promise<{ id: string; ok: true }> {
  try {
    const row = await prisma.telemetryLog.create({
      data: {
        level: input.level,
        category: input.category,
        message: input.message,
        detail: input.detail ?? null,
        timestamp: input.timestamp ? new Date(input.timestamp) : new Date(),
        userAgent: input.userAgent ?? null,
        url: input.url ?? null,
      },
    });
    return { id: row.id, ok: true };
  } catch (err) {
    // Swallow — telemetry is best-effort.
    svcLogger.error(
      { err: (err as Error).message, category: input.category },
      'failed to persist telemetry log',
    );
    return { id: 'telemetry_failed', ok: true };
  }
}

export interface TelemetryListResult {
  items: Array<{
    id: string;
    level: string;
    category: string;
    message: string;
    detail: string | null;
    timestamp: string;
    userAgent: string | null;
    url: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export async function list(query: TelemetryQuery): Promise<TelemetryListResult> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (query.level) where.level = query.level;
  if (query.category) where.category = query.category;

  try {
    const [rows, total] = await Promise.all([
      prisma.telemetryLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.telemetryLog.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        level: r.level,
        category: r.category,
        message: r.message,
        detail: r.detail,
        timestamp: r.timestamp.toISOString(),
        userAgent: r.userAgent,
        url: r.url,
      })),
      total,
      page,
      pageSize,
    };
  } catch (err) {
    svcLogger.error(
      { err: (err as Error).message },
      'failed to list telemetry logs',
    );
    return { items: [], total: 0, page, pageSize };
  }
}
