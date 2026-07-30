import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { fashnClient, wrapFashnError } from '../lib/fashn-client';
import { decryptApiKey } from '../lib/crypto';
import { createNotification } from './notification.service';
import type { SubmitTryonInput } from '../schemas/vton.schema';
import type { PaginationParams } from '../types';

const svcLogger = logger.child({ service: 'vton' });

export interface VtonListParams extends PaginationParams {
  customerId?: string;
  franchiseId?: string;
  status?: string;
}

// -------------------------------------------------------------------------- //
// submitTryon (franchise-first)
// -------------------------------------------------------------------------- //

export async function submitTryon(input: SubmitTryonInput) {
  // 1. Look up franchise → derive customerId
  const franchise = await prisma.franchise.findUnique({
    where: { id: input.franchiseId },
    include: { customer: { select: { id: true, name: true } } },
  });
  if (!franchise) {
    throw new Error('NOT_FOUND: Franchise not found');
  }
  const customerId = franchise.customer.id;

  // 2. Find customer's active API key (non-revoked, non-expired)
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      customerId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!apiKey) {
    throw new Error(
      `NO_API_KEY: customer ${customerId} has no active API key`,
    );
  }

  // 3. Check credit limit
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

  // 4. Verify customer has at least one pricing tier
  const tierCount = await prisma.customerPricing.count({
    where: { customerId, active: true },
  });
  if (tierCount === 0) {
    throw new Error(
      `NO_PRICING_TIER: customer ${customerId} has no active pricing tier`,
    );
  }

  // 5. Compute inputsHash for caching/dedup
  const inputsHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(input.inputs))
    .digest('hex');

  // 6. Call FASHN.ai POST /v1/run with decrypted API key
  const decryptedKey = decryptApiKey(apiKey.keyEncrypted);
  let fashnId: string | null = null;
  let initialStatus = 'pending';
  try {
    const result = await fashnClient.run(decryptedKey, input.inputs);
    fashnId = result.id;
    initialStatus = mapFashnStatus(result.status);
  } catch (err) {
    // Re-throw with the FASHN_REJECTED / FASHN_ERROR prefix preserved.
    throw wrapFashnError(err as Error, 'submitTryon.run');
  }

  // 7. Persist VtonRequest row
  const vtonRequest = await prisma.vtonRequest.create({
    data: {
      apiKeyId: apiKey.id,
      customerId,
      franchiseId: franchise.id,
      fashnId,
      inputsHash,
      status: initialStatus,
      inputs: JSON.stringify(input.inputs),
      creditsUsed: 0,
    },
    select: {
      id: true,
      fashnId: true,
      status: true,
      createdAt: true,
    },
  });

  svcLogger.info(
    {
      vtonRequestId: vtonRequest.id,
      fashnId,
      customerId,
      franchiseId: franchise.id,
    },
    'VTON try-on submitted',
  );

  return {
    id: vtonRequest.id,
    fashnId: vtonRequest.fashnId,
    status: vtonRequest.status,
    message: 'Try-on request submitted successfully',
  };
}

// -------------------------------------------------------------------------- //
// pollTryon — fetch latest status from FASHN.ai and sync DB
// -------------------------------------------------------------------------- //

export async function pollTryon(id: string) {
  const vtonRequest = await prisma.vtonRequest.findUnique({
    where: { id },
    include: { apiKey: true },
  });
  if (!vtonRequest) {
    throw new Error('NOT_FOUND: VTON request not found');
  }

  if (!vtonRequest.fashnId) {
    return {
      id: vtonRequest.id,
      status: vtonRequest.status,
      fashnId: null,
      output: vtonRequest.output ? JSON.parse(vtonRequest.output) : null,
      error: vtonRequest.errorMessage
        ? { name: vtonRequest.errorName, message: vtonRequest.errorMessage }
        : null,
      creditsUsed: vtonRequest.creditsUsed,
      completedAt: vtonRequest.completedAt,
    };
  }

  // If already terminal, return without calling FASHN
  if (vtonRequest.status === 'completed' || vtonRequest.status === 'failed') {
    return {
      id: vtonRequest.id,
      status: vtonRequest.status,
      fashnId: vtonRequest.fashnId,
      output: vtonRequest.output ? safeJsonParse(vtonRequest.output) : null,
      error: vtonRequest.errorMessage
        ? { name: vtonRequest.errorName, message: vtonRequest.errorMessage }
        : null,
      creditsUsed: vtonRequest.creditsUsed,
      completedAt: vtonRequest.completedAt,
    };
  }

  // Call FASHN status endpoint
  const decryptedKey = decryptApiKey(vtonRequest.apiKey.keyEncrypted);
  let fashnStatus;
  try {
    fashnStatus = await fashnClient.status(decryptedKey, vtonRequest.fashnId);
  } catch (err) {
    throw wrapFashnError(err as Error, 'pollTryon.status');
  }

  const newStatus = mapFashnStatus(fashnStatus.status);
  const updateData: Record<string, unknown> = { status: newStatus };

  if (newStatus === 'completed') {
    updateData.output = fashnStatus.output ? JSON.stringify(fashnStatus.output) : null;
    updateData.completedAt = new Date();
    // Estimate credits used (FASHN returns this; otherwise default to 1)
    updateData.creditsUsed = (fashnStatus as { credits_used?: number }).credits_used ?? 1;

    // Bump API key usedCredit
    await prisma.apiKey.update({
      where: { id: vtonRequest.apiKeyId },
      data: {
        usedCredit: { increment: updateData.creditsUsed as number },
        lastUsedAt: new Date(),
      },
    });
  } else if (newStatus === 'failed') {
    updateData.errorName = fashnStatus.error?.name ?? 'FashnError';
    updateData.errorMessage = fashnStatus.error?.message ?? 'Try-on failed';
    updateData.completedAt = new Date();
  }

  await prisma.vtonRequest.update({
    where: { id },
    data: updateData,
  });

  return {
    id: vtonRequest.id,
    status: newStatus,
    fashnId: vtonRequest.fashnId,
    output: fashnStatus.output ?? null,
    error: fashnStatus.error ?? null,
    creditsUsed: (updateData.creditsUsed as number) ?? 0,
    completedAt: (updateData.completedAt as Date | undefined) ?? null,
  };
}

// -------------------------------------------------------------------------- //
// listTryonRequests
// -------------------------------------------------------------------------- //

export async function listTryonRequests(params: VtonListParams) {
  const where: Record<string, unknown> = {};
  if (params.customerId) where.customerId = params.customerId;
  if (params.franchiseId) where.franchiseId = params.franchiseId;
  if (params.status) where.status = params.status;

  const [items, total] = await Promise.all([
    prisma.vtonRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        customer: { select: { id: true, name: true, businessName: true } },
        franchise: { select: { id: true, name: true } },
        apiKey: { select: { id: true, keyHint: true } },
      },
    }),
    prisma.vtonRequest.count({ where }),
  ]);

  return { items, total, page: params.page, pageSize: params.pageSize };
}

// -------------------------------------------------------------------------- //
// credits summary
// -------------------------------------------------------------------------- //

export async function getCreditsSummary(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new Error('NOT_FOUND: Customer not found');
  }

  const apiKeys = await prisma.apiKey.findMany({
    where: { customerId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      keyHint: true,
      keyPrefix: true,
      defaultCredit: true,
      usedCredit: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalDefault = apiKeys.reduce((s, k) => s + k.defaultCredit, 0);
  const totalUsed = apiKeys.reduce((s, k) => s + k.usedCredit, 0);

  return {
    customerId,
    activeKeys: apiKeys.length,
    totalDefaultCredit: totalDefault,
    totalUsedCredit: totalUsed,
    remainingCredit: Math.max(0, totalDefault - totalUsed),
    utilizationPct: totalDefault > 0 ? (totalUsed / totalDefault) * 100 : 0,
    keys: apiKeys,
  };
}

// -------------------------------------------------------------------------- //
// helpers
// -------------------------------------------------------------------------- //

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

function safeJsonParse<T = unknown>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
