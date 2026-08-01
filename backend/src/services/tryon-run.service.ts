import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { fashnClient, wrapFashnError } from '../lib/fashn-client';
import { decryptApiKey } from '../lib/crypto';
import { createNotification } from './notification.service';
import { getProductBySku } from './product.service';

const svcLogger = logger.child({ service: 'tryon-run' });

/**
 * tryon-run.service — synchronous try-on execution for the customer-facing
 * frontend.
 *
 * DIFFERENCE vs. vton.service.submitTryon:
 *   - submitTryon is async (submit → poll separately). Used by the admin portal.
 *   - tryonRun is synchronous (submit → poll → return final image). Used by the
 *     customer-facing frontend which expects an immediate result image.
 *
 * API KEY LOGIC (per customer):
 *   1. Resolve the customer from the request body (customerId or franchiseId).
 *   2. If neither is provided OR the franchise doesn't exist, fall back to the
 *      first customer that has an active (non-revoked, non-expired) API key.
 *      This keeps the demo functional out-of-the-box.
 *   3. Look up that customer's active API key — NEVER from process.env.
 *   4. Check credit limit; notify + throw NO_CREDITS if exhausted.
 *   5. Call FASHN.ai POST /v1/run with the decrypted key.
 *   6. Poll FASHN.ai GET /v1/status/{id} until terminal (completed/failed)
 *      or the 90s timeout expires.
 *   7. Increment usedCredit + lastUsedAt on the API key.
 *   8. Return the first output image URL.
 *
 * ONLY the FASHN base URL comes from the environment (FASHN_API_BASE_URL) —
 * the API key is always per-customer from the database.
 */

const POLL_MAX_MS = 90_000; // 90s ceiling for the whole submit+poll cycle
const POLL_INTERVAL_MS = 1_500;

export interface TryonRunInput {
  userImage: string; // base64 data URL or http URL
  productSku: string;
  productName?: string;
  productCategory?: string;
  garmentImage?: string; // base64 data URL or http URL
  franchiseId?: string;
  customerId?: string;
}

export interface TryonRunResult {
  resultImage: string;
  mock: boolean;
  provider: string;
  id?: string;
  creditsUsed?: number;
  customerId?: string;
  message?: string;
}

/**
 * Resolves which customer's API key to use, in priority order:
 *   1. body.customerId (explicit)
 *   2. body.franchiseId → franchise.customerId
 *   3. Fallback: first customer with ANY active API key (demo mode)
 *
 * Returns { customer, apiKey } or null if no usable key exists anywhere.
 */
async function resolveCustomerAndKey(input: TryonRunInput): Promise<{
  customerId: string;
  apiKey: NonNullable<Awaited<ReturnType<typeof prisma.apiKey.findFirst>>>;
} | null> {
  // 1. Explicit customerId
  if (input.customerId) {
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        customerId: input.customerId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (apiKey) return { customerId: input.customerId, apiKey };
    // Fall through to franchise lookup / fallback
  }

  // 2. franchiseId → customer
  if (input.franchiseId) {
    const franchise = await prisma.franchise.findUnique({
      where: { id: input.franchiseId },
      include: { customer: { select: { id: true } } },
    });
    if (franchise) {
      const apiKey = await prisma.apiKey.findFirst({
        where: {
          customerId: franchise.customerId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (apiKey) return { customerId: franchise.customerId, apiKey };
    }
  }

  // 3. Fallback: first customer with ANY active key
  const fallbackKey = await prisma.apiKey.findFirst({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    include: { customer: { select: { id: true } } },
  });
  if (fallbackKey) {
    svcLogger.warn(
      { customerId: fallbackKey.customerId },
      'No explicit customer/franchise matched — using fallback customer API key (demo mode)',
    );
    return { customerId: fallbackKey.customerId, apiKey: fallbackKey };
  }

  return null;
}

/**
 * Runs the full synchronous try-on flow.
 *
 * If NO customer API key exists in the entire database, returns a MOCK result
 * (the user's own image echoed back) with `mock: true` so the frontend
 * pipeline completes end-to-end without crashing.
 */
export async function tryonRun(input: TryonRunInput): Promise<TryonRunResult> {
  svcLogger.info(
    { productSku: input.productSku, hasFranchise: !!input.franchiseId, hasCustomer: !!input.customerId },
    'tryonRun started',
  );

  // ─── Resolve customer + active API key ──────────────────────────────
  const resolved = await resolveCustomerAndKey(input);

  if (!resolved) {
    // No API key anywhere — mock mode
    svcLogger.warn(
      { productSku: input.productSku },
      'No active API key found for ANY customer — returning mock result',
    );
    return {
      resultImage: input.userImage,
      mock: true,
      provider: 'mock',
      message: 'No active customer API key found. Assign one via the admin portal to enable real AI try-on.',
    };
  }

  const { customerId, apiKey } = resolved;

  // ─── Credit limit check ─────────────────────────────────────────────
  if (apiKey.usedCredit >= apiKey.defaultCredit) {
    await createNotification({
      customerId,
      type: 'LIMIT_EXCEEDED',
      title: 'API credit limit exceeded',
      message: `API key ${apiKey.keyHint} has reached its credit limit (${apiKey.usedCredit}/${apiKey.defaultCredit}). Top up required to continue VTON requests.`,
      severity: 'ERROR',
    });
    throw new Error(
      `NO_CREDITS: API key ${apiKey.keyHint} has reached its credit limit (${apiKey.usedCredit}/${apiKey.defaultCredit})`,
    );
  }

  // ─── Resolve garment image ──────────────────────────────────────────
  // If the frontend didn't pass a garmentImage, look up the product by SKU
  // and use its garmentOverlayUrl (or imageUrl as fallback).
  let garmentImage = input.garmentImage;
  if (!garmentImage) {
    const product = await getProductBySku(input.productSku);
    garmentImage = product?.garmentOverlayUrl ?? product?.imageUrl ?? '';
  }
  if (!garmentImage) {
    throw new Error(
      `VALIDATION: No garment image available for product SKU ${input.productSku}. Set a garmentOverlayUrl on the product or pass garmentImage in the request body.`,
    );
  }

  // ─── Compute inputsHash (dedup/caching key) ─────────────────────────
  const inputsHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ userImage: input.userImage, garmentImage, productSku: input.productSku }))
    .digest('hex');

  // ─── Submit to FASHN.ai ─────────────────────────────────────────────
  const decryptedKey = decryptApiKey(apiKey.keyEncrypted);
  const fashnInput = {
    model_image: input.userImage,
    garment_image: garmentImage,
    category: input.productCategory,
    num_samples: 1,
    return_base64: false,
  };

  let fashnId: string;
  let initialStatus: string;
  try {
    const result = await fashnClient.run(decryptedKey, [fashnInput]);
    fashnId = result.id;
    initialStatus = result.status;
  } catch (err) {
    throw wrapFashnError(err as Error, 'tryonRun.submit');
  }

  svcLogger.info({ fashnId, customerId, productSku: input.productSku }, 'FASHN job submitted');

  // ─── Persist VtonRequest row ────────────────────────────────────────
  const vtonRequest = await prisma.vtonRequest.create({
    data: {
      apiKeyId: apiKey.id,
      customerId,
      franchiseId: input.franchiseId ?? null,
      fashnId,
      inputsHash,
      status: mapFashnStatus(initialStatus),
      inputs: JSON.stringify(fashnInput),
      creditsUsed: 0,
    },
    select: { id: true, fashnId: true, status: true },
  });

  // ─── Poll FASHN status until terminal ───────────────────────────────
  const pollStart = Date.now();
  let finalStatus = initialStatus;
  let output: string[] | null = null;
  let errorInfo: { name: string; message: string } | null = null;
  let creditsUsed = 1;

  while (Date.now() - pollStart < POLL_MAX_MS) {
    let statusResult;
    try {
      statusResult = await fashnClient.status(decryptedKey, fashnId);
    } catch (err) {
      throw wrapFashnError(err as Error, 'tryonRun.poll');
    }
    finalStatus = statusResult.status;

    if (finalStatus === 'completed') {
      output = statusResult.output ?? null;
      creditsUsed = (statusResult as { credits_used?: number }).credits_used ?? 1;
      break;
    }
    if (finalStatus === 'failed') {
      errorInfo = statusResult.error ?? { name: 'FashnError', message: 'Try-on failed' };
      break;
    }
    // Still processing — wait and retry
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Timeout — mark as failed
  if (finalStatus !== 'completed' && finalStatus !== 'failed') {
    finalStatus = 'failed';
    errorInfo = { name: 'TimeoutError', message: `FASHN job did not complete within ${POLL_MAX_MS / 1000}s` };
  }

  // ─── Update VtonRequest + API key ───────────────────────────────────
  const updateData: Record<string, unknown> = {
    status: mapFashnStatus(finalStatus),
    completedAt: new Date(),
  };

  if (finalStatus === 'completed') {
    updateData.output = output ? JSON.stringify(output) : null;
    updateData.creditsUsed = creditsUsed;
    // Bump API key usedCredit + lastUsedAt
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        usedCredit: { increment: creditsUsed },
        lastUsedAt: new Date(),
      },
    });
  } else if (finalStatus === 'failed') {
    updateData.errorName = errorInfo?.name ?? 'FashnError';
    updateData.errorMessage = errorInfo?.message ?? 'Try-on failed';
  }

  await prisma.vtonRequest.update({
    where: { id: vtonRequest.id },
    data: updateData,
  });

  // ─── Return result or throw ─────────────────────────────────────────
  if (finalStatus === 'completed' && output && output.length > 0) {
    svcLogger.info(
      { vtonRequestId: vtonRequest.id, fashnId, creditsUsed, durationMs: Date.now() - pollStart },
      'FASHN job completed',
    );
    return {
      resultImage: output[0],
      mock: false,
      provider: 'fashn',
      id: vtonRequest.id,
      creditsUsed,
      customerId,
    };
  }

  // Failed
  throw new Error(
    `FASHN_ERROR: ${errorInfo?.name ?? 'FashnError'} — ${errorInfo?.message ?? 'Try-on failed'}`,
  );
}

// ─── helpers ──────────────────────────────────────────────────────────── //

function mapFashnStatus(s: string): string {
  switch (s) {
    case 'starting':
    case 'in_queue':
    case 'processing':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return s;
  }
}
