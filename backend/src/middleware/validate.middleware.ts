import type { NextFunction, Request, Response, RequestHandler } from 'express';
import type { AnyZodObject, ZodSchema } from 'zod';
import { ZodError } from 'zod';

type Location = 'body' | 'query' | 'params';

interface ValidateOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Zod validation middleware wrapper.
 *
 * Validates req.body / req.query / req.params against the provided schemas.
 * On success: replaces the req property with the parsed (and coerced) result.
 * On failure: forwards a ZodError to next(), which the centralized error
 * middleware turns into a 422 VALIDATION response.
 */
export function validate(opts: ValidateOptions): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (opts.body) {
        req.body = opts.body.parse(req.body);
      }
      if (opts.query) {
        const parsed = opts.query.parse(req.query);
        // Replace query object (preserve pagination helpers reading req.query)
        req.query = parsed as typeof req.query;
      }
      if (opts.params) {
        req.params = opts.params.parse(req.params) as typeof req.params;
      }
      next();
    } catch (err) {
      // Tag ZodErrors so the error middleware treats them uniformly
      if (err instanceof ZodError) {
        next(err);
      } else {
        next(err);
      }
    }
  };
}

/** Convenience builder for a body-only schema. */
export function validateBody(schema: AnyZodObject): RequestHandler {
  return validate({ body: schema });
}

/** Convenience builder for a query-only schema. */
export function validateQuery(schema: AnyZodObject): RequestHandler {
  return validate({ query: schema });
}
