import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { ConsumeUsageInput } from '../schemas/usage.schema';
import type { PaginationParams } from '../types';

const svcLogger = logger.child({ service: 'usage' });

export interface UsageListParams extends PaginationParams {
  customerId?: string;
  franchiseId?: string;
  start?: Date;
  end?: Date;
}

export async function listUsage(params: UsageListParams) {
  const where: Record<string, unknown> = {};
  if (params.customerId) where.customerId = params.customerId;
  if (params.franchiseId) where.franchiseId = params.franchiseId;
  if (params.start || params.end) {
    where.day = {};
    if (params.start) (where.day as { gte?: Date }).gte = params.start;
    if (params.end) (where.day as { lte?: Date }).lte = params.end;
  }

  const [items, total] = await Promise.all([
    prisma.usage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        customer: { select: { id: true, name: true, businessName: true } },
        franchise: { select: { id: true, name: true } },
      },
    }),
    prisma.usage.count({ where }),
  ]);

  return { items, total, page: params.page, pageSize: params.pageSize };
}

export async function getUsageByCustomer(
  customerId: string,
  params: PaginationParams & { start?: Date; end?: Date },
) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new Error('NOT_FOUND: Customer not found');
  }

  const where: Record<string, unknown> = { customerId };
  if (params.start || params.end) {
    where.day = {};
    if (params.start) (where.day as { gte?: Date }).gte = params.start;
    if (params.end) (where.day as { lte?: Date }).lte = params.end;
  }

  const [items, total] = await Promise.all([
    prisma.usage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        franchise: { select: { id: true, name: true } },
      },
    }),
    prisma.usage.count({ where }),
  ]);

  // Also return aggregate stats
  const aggregates = await prisma.usage.aggregate({
    where,
    _sum: { creditsUsed: true },
    _count: { _all: true },
  });

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    summary: {
      totalCredits: aggregates._sum.creditsUsed ?? 0,
      totalRequests: aggregates._count._all,
    },
  };
}

export async function consumeUsage(input: ConsumeUsageInput) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
  });
  if (!customer) {
    throw new Error('NOT_FOUND: Customer not found');
  }

  if (input.franchiseId) {
    const franchise = await prisma.franchise.findFirst({
      where: { id: input.franchiseId, customerId: input.customerId },
    });
    if (!franchise) {
      throw new Error('NOT_FOUND: Franchise not found for this customer');
    }
  }

  const usage = await prisma.usage.create({
    data: {
      customerId: input.customerId,
      franchiseId: input.franchiseId ?? null,
      apiKeyId: input.apiKeyId ?? null,
      creditsUsed: input.creditsUsed,
      endpoint: input.endpoint ?? null,
      method: input.method ?? null,
      statusCode: input.statusCode ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      day: new Date(),
    },
  });

  // If an API key was supplied, bump its usedCredit
  if (input.apiKeyId) {
    await prisma.apiKey.update({
      where: { id: input.apiKeyId },
      data: {
        usedCredit: { increment: input.creditsUsed },
        lastUsedAt: new Date(),
      },
    });
  }

  svcLogger.info(
    { usageId: usage.id, customerId: input.customerId, credits: input.creditsUsed },
    'usage consumed',
  );
  return usage;
}
