import type { Request } from 'express';

/**
 * Augment Express Request with .user (set by auth.middleware.ts).
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email: string;
        role: string;
      } | null;
    }
  }
}

export {};
