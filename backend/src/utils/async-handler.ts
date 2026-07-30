import type { NextFunction, Request, Response, RequestHandler } from 'express';

/**
 * Wrap an async route handler so any rejected promise / thrown error is
 * forwarded to Express's error-handling middleware via next(err).
 *
 * Use on ALL route handlers so errors flow through the centralized
 * error.middleware.ts.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}

/**
 * Wrap a sync handler (rarely needed) — included for completeness.
 */
export function syncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown,
): RequestHandler {
  return (req, res, next) => {
    try {
      fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}
