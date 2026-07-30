import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';
import { password as passwordLib } from '../lib/password';
import { signToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { queue } from '../lib/queue';

/**
 * Passcode-based sign-in service — implements the user's required 2-step flow:
 *
 *   Step 1: User enters email + password.
 *           → Server validates credentials.
 *           → Server generates a 6-digit passcode, stores it (hashed) with a
 *             10-minute TTL, and emails it to the user.
 *           → Returns `{ challengeId, email, message }` (no token yet).
 *
 *   Step 2: User enters the 6-digit passcode.
 *           → Server verifies the passcode against the stored hash.
 *           → On success: returns `{ token, user }` (same shape as `/signin`).
 *           → On failure: returns UNAUTHORIZED with attempt count.
 *
 * **Loose coupling:** email sending goes through `queue.enqueueEmail()` which
 * no-ops if Redis/SMTP isn't configured — so the flow always works in dev
 * (the passcode is also surfaced in the response message for dev convenience).
 *
 * **Security:** passcodes are stored as SHA-256 hashes (never plaintext),
 * expire after 10 minutes, and lock out after 5 failed attempts (require a
 * fresh `/passcode/send` call to retry).
 */

const svcLogger = logger.child({ service: 'passcode' });

const PASSCODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

export interface PasscodeChallenge {
  challengeId: string;
  email: string;
  expiresInMs: number;
  /** Returned ONLY in dev so the user can sign in without SMTP. */
  devPasscode?: string;
}

export interface PasscodeVerifyResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

/** Generates a cryptographically-random 6-digit passcode (000000–999999). */
function generatePasscode(): string {
  // crypto.randomInt(0, 1_000_000) returns a uniform int in [0, 1_000_000).
  // Pad to 6 digits so the user always sees a consistent format.
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, '0');
}

/** SHA-256 hex hash of the passcode — never store plaintext. */
function hashPasscode(passcode: string): string {
  return crypto.createHash('sha256').update(passcode).digest('hex');
}

/**
 * Step 1 — validates email + password, then issues a fresh passcode challenge.
 * Always returns a `challengeId` so the caller can reference this attempt in
 * step 2. Throws UNAUTHORIZED if credentials are invalid.
 */
export async function sendPasscode(input: {
  email: string;
  password: string;
}): Promise<PasscodeChallenge> {
  const email = input.email.toLowerCase().trim();

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    throw new Error('UNAUTHORIZED: Invalid email or password');
  }

  const ok = await passwordLib.compare(input.password, admin.passwordHash);
  if (!ok) {
    throw new Error('UNAUTHORIZED: Invalid email or password');
  }

  // Generate + hash the passcode. The plaintext is NEVER persisted.
  const passcode = generatePasscode();
  const passcodeHash = hashPasscode(passcode);
  const expires = new Date(Date.now() + PASSCODE_TTL_MS);

  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      passcode: passcodeHash,
      passcodeExpires: expires,
      passcodeAttempts: 0,
    },
  });

  // Enqueue the email — no-ops if Redis/SMTP isn't available.
  await queue.enqueueEmail({
    to: admin.email,
    subject: 'Your Atelier Nova sign-in code',
    template: 'passcode',
    data: { passcode, name: admin.name, expiresInMin: 10 },
  });

  svcLogger.info({ adminId: admin.id, email: admin.email }, 'passcode issued');

  return {
    challengeId: admin.id,
    email: admin.email,
    expiresInMs: PASSCODE_TTL_MS,
    // In dev, surface the passcode so the user can sign in without SMTP.
    // In prod, only the email contains it.
    devPasscode: process.env.NODE_ENV === 'production' ? undefined : passcode,
  };
}

/**
 * Step 2 — verifies the 6-digit passcode against the stored hash. On success,
 * returns the auth token (same shape as `/signin`). On failure, throws
 * UNAUTHORIZED with a friendly message including remaining attempts.
 *
 * `identifier` is the admin id (returned as `challengeId` in step 1) OR the
 * email — both are accepted so the frontend doesn't have to thread the id.
 */
export async function verifyPasscode(input: {
  identifier: string;
  passcode: string;
}): Promise<PasscodeVerifyResult> {
  const identifier = input.identifier.trim();
  const passcode = input.passcode.trim();

  // Allow lookup by either id or email.
  const admin = await prisma.admin.findFirst({
    where: {
      OR: [{ id: identifier }, { email: identifier.toLowerCase() }],
    },
  });

  if (!admin || !admin.passcode || !admin.passcodeExpires) {
    throw new Error('UNAUTHORIZED: No active passcode challenge. Request a new code.');
  }

  // Expired?
  if (admin.passcodeExpires.getTime() < Date.now()) {
    throw new Error('UNAUTHORIZED: Passcode expired. Request a new code.');
  }

  // Locked out?
  if (admin.passcodeAttempts >= MAX_ATTEMPTS) {
    throw new Error(
      `UNAUTHORIZED: Too many incorrect attempts (${MAX_ATTEMPTS}). Request a new code.`,
    );
  }

  // Verify the passcode (constant-time-ish via SHA-256 comparison).
  const expectedHash = hashPasscode(passcode);
  if (admin.passcode !== expectedHash) {
    await prisma.admin.update({
      where: { id: admin.id },
      data: { passcodeAttempts: { increment: 1 } },
    });
    const remaining = MAX_ATTEMPTS - (admin.passcodeAttempts + 1);
    throw new Error(
      `UNAUTHORIZED: Incorrect passcode. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    );
  }

  // Success — clear the passcode + issue JWT.
  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      passcode: null,
      passcodeExpires: null,
      passcodeAttempts: 0,
    },
  });

  const token = signToken({
    sub: admin.id,
    email: admin.email,
    role: admin.role,
  });

  svcLogger.info({ adminId: admin.id }, 'passcode verified — signed in');

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
