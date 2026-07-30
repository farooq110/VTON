import type { NextFunction, Request, Response, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { config } from '../config';

/**
 * CENTRALIZED error handler.
 *
 * ALL errors (sync thrown, async rejected, system-level like ECONNRESET, plus
 * Zod validation errors) flow through this single middleware.
 *
 * Strategy:
 *   - Inspect err.message for known business-error prefixes → map to HTTP status.
 *   - ZodError → 422 VALIDATION.
 *   - System errors (no .message prefix match) → 500 INTERNAL, with stack trace
 *     logged but NOT leaked to the client in prod.
 */

interface ErrorLike extends Error {
  status?: number;
  code?: string;
  expose?: boolean;
  // express
  type?: string;
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
];

function classify(err: ErrorLike): { status: number; code: string; message: string } {
  // Zod
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

  // Known prefix
  for (const { prefix, status, code } of PREFIX_MAP) {
    if (err.message.startsWith(prefix)) {
      const rest = err.message.slice(prefix.length).trim();
      return { status, code, message: rest || err.message };
    }
  }

  // Explicit status set (e.g. throw Object.assign(new Error(), { status }))
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 600) {
    return {
      status: err.status,
      code: err.code ?? 'ERROR',
      message: err.expose ? err.message : 'Request failed',
    };
  }

  // Prisma known errors → friendly messages
  if (err.code === 'P2025') {
    return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' };
  }
  if (err.code === 'P2002') {
    return {
      status: 409,
      code: 'CONFLICT',
      message: 'A record with this value already exists',
    };
  }

  // Fallback
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
