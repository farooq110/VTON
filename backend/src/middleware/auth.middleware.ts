import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { config } from '../config';
import { verifyToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

/**
 * JWT verification from cookie (named `admin_token`).
 * On success: attaches `req.user = { sub, email, role }`.
 * On failure: 401 with UNAUTHORIZED.
 *
 * Routes that need auth mount `requireAuth` as middleware.
 */
export const requireAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing auth token' },
        message: 'Authentication required',
      });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
        message: 'Please sign in again',
      });
    }

    // Confirm the admin still exists (cheap)
    const admin = await prisma.admin.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });
    if (!admin) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Account not found' },
        message: 'Account no longer exists',
      });
    }

    req.user = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    };
    next();
  } catch (err) {
    logger
      .child({ middleware: 'auth' })
      .error({ err: (err as Error).message }, 'auth middleware failure');
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: 'Auth check failed' },
      message: 'Internal error',
    });
  }
};

/**
 * Optional auth — attaches req.user if a valid token is present, but doesn't
 * fail otherwise. Useful for /health or routes that personalize based on auth.
 */
export const optionalAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = readToken(req);
    if (!token) return next();
    const payload = verifyToken(token);
    const admin = await prisma.admin.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });
    if (admin) {
      req.user = { sub: admin.id, email: admin.email, role: admin.role };
    }
  } catch {
    // ignore — optional
  }
  next();
};

function readToken(req: Request): string | null {
  // 1. Cookie (preferred)
  const cookieToken = (req.cookies && req.cookies[config.auth.cookieName]) as
    | string
    | undefined;
  if (cookieToken) return cookieToken;

  // 2. Authorization: Bearer <token> (fallback for non-browser clients)
  const auth = req.headers.authorization;
  if (auth && /^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, '').trim();
  }
  return null;
}
