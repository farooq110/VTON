import { env } from './env';

/**
 * Centralized config object — single source of truth for runtime config.
 * Anything reading env values should import from here, not from `process.env`.
 */
export const config = {
  env: env.NODE_ENV,
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  port: env.PORT,

  db: {
    url: env.DATABASE_URL,
  },

  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    cookieName: 'admin_token',
  },

  encryption: {
    key: env.ENCRYPTION_KEY, // 64-char hex string (32 bytes)
  },

  redis: {
    url: env.REDIS_URL,
  },

  cors: {
    origin: env.CORS_ORIGIN,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    // Stricter limit for auth endpoints
    authMax: 5,
    authWindowMs: 60_000,
  },

  log: {
    level: env.LOG_LEVEL,
  },

  fashn: {
    baseUrl: env.FASHN_API_BASE_URL,
  },
} as const;

export type Config = typeof config;
