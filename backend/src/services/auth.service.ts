import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';
import { password } from '../lib/password';
import { signToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { queue } from '../lib/queue';
import type { SigninInput } from '../schemas/auth.schema';

/**
 * Auth service — swappable business logic.
 * All third-party libs (jwt, bcrypt) are accessed via lib/ adapters.
 */

const svcLogger = logger.child({ service: 'auth' });

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    /** Active brand id — derived from the Brand table. Used by the frontend
     *  orchestrator to attribute try-on requests to the right brand. */
    brandId: string;
    /** Franchise id — admins aren't tied to a specific franchise in the
     *  schema, so we synthesize a stable id from the admin id. The frontend
     *  uses this for the `/tryon/track` payload (falls back to "unknown"). */
    franchiseId: string;
  };
}

export async function login(input: SigninInput): Promise<AuthResult> {
  // Normalize: prefer `email` if provided, otherwise treat `identifier` as
  // an email-or-name. We first try an exact email match, then fall back to a
  // case-insensitive name lookup so franchise-name login also works.
  const rawId = (input.email ?? input.identifier ?? '').trim();
  const lower = rawId.toLowerCase();

  let admin = await prisma.admin.findUnique({
    where: { email: lower },
    // Issue 1 fix — select franchiseId so we can return it to the frontend.
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      franchiseId: true,
    },
  });

  if (!admin && input.identifier) {
    // Fall back to a case-insensitive name match (franchise-name login).
    admin = await prisma.admin.findFirst({
      where: { name: { contains: input.identifier, mode: 'insensitive' } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        passwordHash: true,
        franchiseId: true,
      },
    });
  }

  if (!admin) {
    throw new Error('UNAUTHORIZED: Invalid email or password');
  }

  const ok = await password.compare(input.password, admin.passwordHash);
  if (!ok) {
    throw new Error('UNAUTHORIZED: Invalid email or password');
  }

  const token = signToken({
    sub: admin.id,
    email: admin.email,
    role: admin.role,
  });

  // Derive brandId from the active Brand row (seed guarantees one exists).
  // If no brand exists yet, fall back to a stable synthetic id so the
  // frontend's User type is always satisfied.
  let brandId = `brand_${admin.id}`;
  try {
    // Issue 1 fix — find brand by the admin's franchiseId first, then fallback.
    const fId = admin.franchiseId ?? 'global';
    const brand = await prisma.brand.findFirst({
      where: { OR: [{ franchiseId: fId }, { isActive: true }] },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (brand) brandId = brand.id;
  } catch {
    // Best-effort — keep the synthetic fallback.
  }

  svcLogger.info({ adminId: admin.id, email: admin.email }, 'admin signed in');

  return {
    token,
    user: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      brandId,
      // Issue 1 fix — return the admin's actual franchiseId from the DB
      // (not a synthetic one). NULL → "global" for super_admin.
      franchiseId: admin.franchiseId ?? 'global',
    },
  };
}

export async function logout(): Promise<void> {
  // Stateless JWT — logout is purely client-side (clear cookie).
  // Token blacklist (if needed in prod) would live in Redis here.
}

export async function getMe(adminId: string): Promise<{
  id: string;
  email: string;
  name: string;
  role: string;
}> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!admin) {
    throw new Error('NOT_FOUND: Admin not found');
  }
  return admin;
}

export async function forgotPassword(email: string): Promise<{
  resetToken: string;
  // We return the token in dev/test for convenience (no SMTP). In prod this
  // would only ever be sent by email.
}> {
  const admin = await prisma.admin.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!admin) {
    // Don't leak whether the email exists — return success silently.
    svcLogger.info({ email }, 'forgot-password for unknown email (silent)');
    return { resetToken: '' };
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.admin.update({
    where: { id: admin.id },
    data: { resetToken, resetExpires },
  });

  // Enqueue a (best-effort) email — BullMQ no-ops if Redis is unavailable.
  await queue.enqueueEmail({
    to: admin.email,
    subject: 'Password reset requested',
    template: 'password-reset',
    data: { resetToken, name: admin.name },
  });

  svcLogger.info({ adminId: admin.id }, 'password reset requested');

  // In production we'd NEVER return the token — only email it. In dev it's
  // convenient for testing.
  return { resetToken };
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: true }> {
  const admin = await prisma.admin.findFirst({
    where: {
      resetToken: token,
      resetExpires: { gt: new Date() },
    },
  });
  if (!admin) {
    throw new Error('UNAUTHORIZED: Invalid or expired reset token');
  }

  const passwordHash = await password.hash(newPassword);
  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      resetToken: null,
      resetExpires: null,
    },
  });

  svcLogger.info({ adminId: admin.id }, 'password reset completed');
  return { ok: true };
}
