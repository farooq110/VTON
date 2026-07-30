import type { Response } from 'express';

/**
 * Consistent response shape:
 *   { success: true, data, message }
 *   { success: false, error: { code, message }, message }
 */

export interface OkBody<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ErrBody {
  success: false;
  error: { code: string; message: string };
  message?: string;
}

export function ok<T>(data: T, message?: string): OkBody<T> {
  return { success: true, data, message };
}

export function err(
  code: string,
  message: string,
  _status?: number,
): ErrBody {
  return { success: false, error: { code, message }, message };
}

/** Express helpers — set status + send body in one call. */
export function sendOk<T>(
  res: Response,
  data: T,
  status = 200,
  message?: string,
): Response {
  return res.status(status).json(ok(data, message));
}

export function sendErr(
  res: Response,
  status: number,
  code: string,
  message: string,
  extraMessage?: string,
): Response {
  return res.status(status).json(err(code, message, status));
}

/** Paginated wrapper. */
export function sendPaginated<T>(
  res: Response,
  result: {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
  },
): Response {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const hasMore = result.page < totalPages;
  return res.status(200).json(
    ok({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages,
      hasMore,
    }),
  );
}
