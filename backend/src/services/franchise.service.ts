import { prisma } from '../lib/prisma';
import { cache, TTL } from '../lib/cache';
import { logger } from '../lib/logger';
import type {
  CreateFranchiseInput,
  UpdateFranchiseInput,
} from '../schemas/franchise.schema';
import type { PaginationParams } from '../types';

const svcLogger = logger.child({ service: 'franchise' });

export async function listFranchises(
  params: PaginationParams & {
    customerId?: string;
    search?: string | null;
  },
) {
  const where: Record<string, unknown> = {};
  if (params.customerId) where.customerId = params.customerId;
  if (params.search) {
    where.OR = [
      { name: { contains: params.search } },
      { managerName: { contains: params.search } },
      { email: { contains: params.search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.franchise.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        customer: { select: { id: true, name: true, businessName: true } },
        _count: { select: { vtonRequests: true, usages: true } },
      },
    }),
    prisma.franchise.count({ where }),
  ]);

  return { items, total, page: params.page, pageSize: params.pageSize };
}

export async function getFranchise(id: string) {
  const cacheKey = `franchise:${id}`;
  const cached = await cache.get<unknown>(cacheKey);
  if (cached) return cached;

  const franchise = await prisma.franchise.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, businessName: true } },
      _count: { select: { vtonRequests: true, usages: true } },
    },
  });

  if (!franchise) {
    throw new Error('NOT_FOUND: Franchise not found');
  }
  await cache.set(cacheKey, franchise, TTL.MEDIUM);
  return franchise;
}

export async function createFranchise(input: CreateFranchiseInput) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
  });
  if (!customer) {
    throw new Error('NOT_FOUND: Customer not found');
  }

  const franchise = await prisma.franchise.create({
    data: {
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      managerName: input.managerName ?? null,
      address: input.address ?? null,
      status: input.status ?? 'ACTIVE',
      customerId: input.customerId,
    },
    include: {
      customer: { select: { id: true, name: true, businessName: true } },
    },
  });

  await cache.invalidatePattern('franchises:*');
  svcLogger.info({ franchiseId: franchise.id, customerId: input.customerId }, 'franchise created');
  return franchise;
}

export async function updateFranchise(id: string, input: UpdateFranchiseInput) {
  const existing = await prisma.franchise.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('NOT_FOUND: Franchise not found');
  }

  const franchise = await prisma.franchise.update({
    where: { id },
    data: input,
    include: {
      customer: { select: { id: true, name: true, businessName: true } },
    },
  });

  await cache.del(`franchise:${id}`);
  await cache.invalidatePattern('franchises:*');
  return franchise;
}

export async function deleteFranchise(id: string): Promise<void> {
  const existing = await prisma.franchise.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('NOT_FOUND: Franchise not found');
  }
  await prisma.franchise.delete({ where: { id } });
  await cache.del(`franchise:${id}`);
  await cache.invalidatePattern('franchises:*');
}
