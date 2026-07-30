import rateLimit, { type Options } from 'express-rate-limit';
import { config } from '../config';

/**
 * Rate limiting configuration.
 *
 * - Global API limiter (applied to all /api routes): window × max from env.
 * - Auth limiter (stricter): 5 attempts / minute / IP for /api/auth/signin.
 */

const keyGenerator = (req: { ip?: string }): string => req.ip ?? 'unknown';

const standardHeaders = true;
const legacyHeaders = false;

export const globalRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders,
  legacyHeaders,
  keyGenerator,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
    },
    message: 'Rate limit exceeded',
  },
} as Partial<Options>);

export const authRateLimit = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMax,
  standardHeaders,
  legacyHeaders,
  keyGenerator,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sign-in attempts, please try again later',
    },
    message: 'Too many sign-in attempts',
  },
} as Partial<Options>);
