import type { NextFunction, Request, Response, RequestHandler } from 'express';

/**
 * 404 handler — matches any method/path not handled by an earlier route.
 * Forwards a NOT_FOUND error to the centralized middleware.
 */
export const notFoundHandler: RequestHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const err = new Error('NOT_FOUND: The requested resource was not found');
  // tagging helps the error middleware classify
  (err as { status?: number}).status = 404;
  next(err);
};
