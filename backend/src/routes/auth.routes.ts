import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate.middleware';
import { authRateLimit } from '../middleware/rate-limit.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  signinSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/auth.schema';
import * as authService from '../services/auth.service';
import { config } from '../config';
import type { Response, Request } from 'express';

const router = Router();

function setAuthCookie(res: Response, token: string): void {
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d (matches JWT_EXPIRES_IN default)
    path: '/',
  });
}

router.post(
  '/signin',
  authRateLimit,
  validate({ body: signinSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    setAuthCookie(res, result.token);
    res.status(200).json({
      success: true,
      data: { user: result.user },
      message: 'Signed in',
    });
  }),
);

router.post(
  '/signout',
  asyncHandler(async (_req, res) => {
    await authService.logout();
    res.clearCookie(config.auth.cookieName, { path: '/' });
    res.status(200).json({
      success: true,
      data: null,
      message: 'Signed out',
    });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const me = await authService.getMe(req.user!.sub);
    res.status(200).json({ success: true, data: me });
  }),
);

router.post(
  '/forgot-password',
  authRateLimit,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body.email);
    res.status(200).json({
      success: true,
      data: null,
      // In dev we surface the resetToken for convenience (no SMTP); in prod
      // it's only ever emailed.
      message: result.resetToken
        ? `Password reset requested (dev token: ${result.resetToken})`
        : 'If that email exists, a reset link has been sent',
    });
  }),
);

router.post(
  '/reset-password',
  validate({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.password);
    res.status(200).json({
      success: true,
      data: null,
      message: 'Password has been reset',
    });
  }),
);

export default router;
