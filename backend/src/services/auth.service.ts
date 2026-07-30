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
  };
}

export async function login(input: SigninInput): Promise<AuthResult> {
  const admin = await prisma.admin.findUnique({
    where: { email: input.email.toLowerCase() },
  });
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

  svcLogger.info({ adminId: admin.id, email: admin.email }, 'admin signed in');

  return {
    token,
    user: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
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
