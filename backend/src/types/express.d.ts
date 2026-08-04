import type { Request } from 'express';

/**
 * Augment Express Request with .user (set by auth.middleware.ts).
 * Issue 1 fix — added `franchiseId` so settings/brand can be scoped per franchise.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email: string;
        role: string;
        /** Issue 1 fix — franchiseId for multi-tenant scoping. "global" for super_admin. */
        franchiseId: string;
      } | null;
    }
  }
}

export {};
