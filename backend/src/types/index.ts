/**
 * Shared API types.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  message?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export type SortDir = 'asc' | 'desc';

/** Known business-error code prefixes (must match error.middleware.ts). */
export const ERROR_CODES = {
  NO_API_KEY: 'NO_API_KEY',
  NO_CREDITS: 'NO_CREDITS',
  NO_PRICING_TIER: 'NO_PRICING_TIER',
  FASHN_REJECTED: 'FASHN_REJECTED',
  FASHN_ERROR: 'FASHN_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
