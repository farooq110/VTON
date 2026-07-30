import type { Request } from 'express';
import type { PaginationParams } from '../types';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

/**
 * Parse `page` + `pageSize` query params into safe integers.
 * Falls back to defaults (1 / 20). Caps pageSize at 200 to protect the DB.
 */
export function parsePaging(req: Request): Required<PaginationParams> {
  const rawPage = Number(req.query.page);
  const rawPageSize = Number(req.query.pageSize);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : DEFAULT_PAGE;
  const requestedSize =
    Number.isFinite(rawPageSize) && rawPageSize >= 1 ? Math.floor(rawPageSize) : DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(requestedSize, MAX_PAGE_SIZE);

  return { page, pageSize };
}

export function skipTake({ page, pageSize }: Required<PaginationParams>): {
  skip: number;
  take: number;
} {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Parse `?sort=field:dir` into a [field, 'asc'|'desc'] tuple (or null). */
export function parseSort(
  req: Request,
  allowedFields: string[],
  fallback?: [string, 'asc' | 'desc'],
): [string, 'asc' | 'desc'] | null {
  const raw = typeof req.query.sort === 'string' ? req.query.sort : null;
  if (!raw) return fallback ?? null;
  const [field, dirRaw] = raw.split(':');
  if (!field || !allowedFields.includes(field)) return fallback ?? null;
  const dir: 'asc' | 'desc' = dirRaw === 'desc' ? 'desc' : 'asc';
  return [field, dir];
}

/** Parse a `?search=` query string into a trimmed lowercased value or null. */
export function parseSearch(req: Request): string | null {
  const raw = req.query.search;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.trim();
}
