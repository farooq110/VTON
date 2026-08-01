import type { NextFunction, Request, Response, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { config } from '../config';

/**
 * CENTRALIZED error handler — the SINGLE funnel through which every error
 * passes before reaching the client.
 *
 * Handles ALL of these error types:
 *
 *   1. Business errors        — message starts with a known prefix (NO_API_KEY:,
 *                                NO_CREDITS:, FASHN_REJECTED:, etc.)
 *   2. Zod validation errors  — 422 VALIDATION
 *   3. Prisma known errors    — P2002 (unique constraint), P2025 (not found),
 *                                P2003 (foreign key), P2014 (invalid relation),
 *                                P2015 (required relation not found)
 *   4. JSON parse errors      — SyntaxError from express.json() → 400 BAD_JSON
 *   5. Payload too large      — EntitytooLargeError from express.json() → 413
 *   6. Multer errors          — file upload errors → 400
 *   7. URIError               — bad URI encoding → 400
 *   8. Timeout / abort errors — ECONNRESET, ETIMEDOUT, AbortError → 504
 *   9. Auth errors            — 401 UNAUTHORIZED, 403 FORBIDDEN
 *  10. Explicit status errors — err.status set by middleware
 *  11. Fallback               — 500 INTERNAL (stack logged, not leaked in prod)
 *
 * Strategy:
 *   - Inspect err.message for known business-error prefixes → map to HTTP status.
 *   - Inspect err.code for Prisma / system error codes.
 *   - Inspect err.type for express body-parser errors.
 *   - Inspect err.name for SyntaxError / URIError / MulterError / AbortError.
 *   - ZodError → 422 VALIDATION.
 *   - System errors (no match) → 500 INTERNAL, with stack trace logged but
 *     NOT leaked to the client in prod.
 */

interface ErrorLike extends Error {
  status?: number;
  code?: string;
  expose?: boolean;
  type?: string; // express body-parser sets this
  // multer
  field?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Map of "message prefix" → { httpStatus, code }
const PREFIX_MAP: Array<{
  prefix: string;
  status: number;
  code: string;
}> = [
  { prefix: 'NO_API_KEY:', status: 400, code: 'NO_API_KEY' },
  { prefix: 'NO_CREDITS:', status: 402, code: 'NO_CREDITS' },
  { prefix: 'NO_PRICING_TIER:', status: 400, code: 'NO_PRICING_TIER' },
  { prefix: 'FASHN_REJECTED:', status: 502, code: 'FASHN_REJECTED' },
  { prefix: 'FASHN_ERROR:', status: 502, code: 'FASHN_ERROR' },
  { prefix: 'NOT_FOUND:', status: 404, code: 'NOT_FOUND' },
  { prefix: 'VALIDATION:', status: 422, code: 'VALIDATION' },
  { prefix: 'UNAUTHORIZED:', status: 401, code: 'UNAUTHORIZED' },
  { prefix: 'FORBIDDEN:', status: 403, code: 'FORBIDDEN' },
  { prefix: 'CONFLICT:', status: 409, code: 'CONFLICT' },
  { prefix: 'RATE_LIMITED:', status: 429, code: 'RATE_LIMITED' },
  { prefix: 'BAD_REQUEST:', status: 400, code: 'BAD_REQUEST' },
  { prefix: 'TIMEOUT:', status: 504, code: 'TIMEOUT' },
];

// Map of Prisma error codes → { httpStatus, code, defaultMessage }
const PRISMA_CODE_MAP: Record<string, { status: number; code: string; message: string }> = {
  P2002: { status: 409, code: 'CONFLICT', message: 'A record with this value already exists' },
  P2003: { status: 400, code: 'FOREIGN_KEY_VIOLATION', message: 'Referenced record does not exist' },
  P2014: { status: 400, code: 'INVALID_RELATION', message: 'Invalid relation in query' },
  P2015: { status: 404, code: 'NOT_FOUND', message: 'Required relation not found' },
  P2025: { status: 404, code: 'NOT_FOUND', message: 'Resource not found' },
  P2021: { status: 500, code: 'TABLE_MISSING', message: 'Database table does not exist' },
  P2022: { status: 500, code: 'COLUMN_MISSING', message: 'Database column does not exist' },
  P1001: { status: 503, code: 'DB_UNREACHABLE', message: 'Database is unreachable' },
  P1002: { status: 504, code: 'DB_TIMEOUT', message: 'Database query timed out' },
  P1008: { status: 504, code: 'DB_TIMEOUT', message: 'Database connection timed out' },
  P1017: { status: 503, code: 'DB_DISCONNECTED', message: 'Database connection was closed' },
};

function classify(err: ErrorLike): { status: number; code: string; message: string } {
  // ─── 1. Zod validation errors ──────────────────────────────────────
  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    const path = firstIssue?.path?.join('.') ?? '';
    const msg = firstIssue?.message ?? 'Validation failed';
    return {
      status: 422,
      code: 'VALIDATION',
      message: path ? `${path}: ${msg}` : msg,
    };
  }

  // ─── 2. Known business-error prefixes ──────────────────────────────
  for (const { prefix, status, code } of PREFIX_MAP) {
    if (err.message.startsWith(prefix)) {
      const rest = err.message.slice(prefix.length).trim();
      return { status, code, message: rest || err.message };
    }
  }

  // ─── 3. Express body-parser errors (JSON parse, payload too large) ─
  // express.json() sets err.type = 'entity.parse.failed' for bad JSON,
  // 'entity.too.large' for payload > limit, 'entity.verify.failed' for
  // malformed body.
  if (err.type === 'entity.parse.failed') {
    return {
      status: 400,
      code: 'BAD_JSON',
      message: 'Request body is not valid JSON',
    };
  }
  if (err.type === 'entity.too.large') {
    return {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the maximum allowed size',
    };
  }
  if (err.type === 'entity.verify.failed') {
    return {
      status: 400,
      code: 'BAD_BODY',
      message: 'Request body verification failed',
    };
  }

  // ─── 4. Multer file upload errors ──────────────────────────────────
  if (err.name === 'MulterError') {
    const multerMessages: Record<string, string> = {
      LIMIT_FILE_SIZE: 'Uploaded file exceeds the size limit',
      LIMIT_FILE_COUNT: 'Too many files uploaded',
      LIMIT_FIELD_KEY: 'Field name too long',
      LIMIT_FIELD_VALUE: 'Field value too long',
      LIMIT_FIELD_COUNT: 'Too many form fields',
      LIMIT_UNEXPECTED_FILE: 'Unexpected form field',
    };
    return {
      status: 400,
      code: 'UPLOAD_ERROR',
      message: multerMessages[err.code ?? ''] ?? `File upload error: ${err.message}`,
    };
  }

  // ─── 5. URIError (bad URL encoding) ────────────────────────────────
  if (err instanceof URIError) {
    return {
      status: 400,
      code: 'BAD_URI',
      message: 'Malformed URI in request',
    };
  }

  // ─── 6. SyntaxError (non-JSON, e.g. in URL parsing) ────────────────
  // Note: JSON parse errors are caught by the body-parser check above
  // (err.type === 'entity.parse.failed'). A bare SyntaxError reaching
  // here is likely from URL parsing or similar.
  if (err.name === 'SyntaxError' && !err.type) {
    return {
      status: 400,
      code: 'SYNTAX_ERROR',
      message: 'Syntax error in request',
    };
  }

  // ─── 7. Network / timeout / abort errors ───────────────────────────
  if (err.name === 'AbortError' || err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    return {
      status: 504,
      code: 'TIMEOUT',
      message: 'Request timed out',
    };
  }
  if (err.code === 'ECONNRESET') {
    return {
      status: 502,
      code: 'CONNECTION_RESET',
      message: 'Upstream connection was reset',
    };
  }
  if (err.code === 'ECONNREFUSED') {
    return {
      status: 502,
      code: 'UPSTREAM_UNREACHABLE',
      message: 'Upstream service is unreachable',
    };
  }
  if (err.code === 'ENOTFOUND') {
    return {
      status: 502,
      code: 'DNS_FAILURE',
      message: 'Could not resolve upstream host',
    };
  }

  // ─── 8. Prisma known errors ────────────────────────────────────────
  if (err.code && PRISMA_CODE_MAP[err.code]) {
    const mapped = PRISMA_CODE_MAP[err.code];
    return { status: mapped.status, code: mapped.code, message: mapped.message };
  }

  // ─── 9. Explicit status set by middleware (e.g. notFoundHandler) ───
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 600) {
    return {
      status: err.status,
      code: err.code ?? 'ERROR',
      message: err.expose ? err.message : 'Request failed',
    };
  }

  // ─── 10. Fallback — truly unexpected ───────────────────────────────
  return {
    status: 500,
    code: 'INTERNAL',
    message: config.isProd ? 'Internal server error' : err.message,
  };
}

export const errorHandler: ErrorRequestHandler = (
  err: ErrorLike,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  const { status, code, message } = classify(err);

  const logPayload = {
    err: {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code,
      type: err.type,
    },
    method: req.method,
    path: req.path,
    statusCode: status,
    errorCode: code,
    userId: req.user?.sub,
    ip: req.ip,
  };

  if (status >= 500) {
    logger.child({ middleware: 'error' }).error(logPayload, 'Unhandled error');
  } else if (status >= 400) {
    logger.child({ middleware: 'error' }).warn(logPayload, 'Client error');
  }

  // Don't leak stack traces in prod
  const responseBody = {
    success: false as const,
    error: { code, message },
    message: status >= 500 && config.isProd ? 'Internal server error' : message,
  };

  res.status(status).json(responseBody);
};

/** Helper to construct a typed business error (matches the prefix contract). */
export function businessError(
  prefix: string,
  detail: string,
): Error {
  return new Error(`${prefix}: ${detail}`);
}
