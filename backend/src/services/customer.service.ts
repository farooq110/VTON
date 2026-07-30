import { prisma } from '../lib/prisma';
import { cache, TTL } from '../lib/cache';
import { logger } from '../lib/logger';
import {
  encryptApiKey,
  keyHint,
  keyPrefix,
} from '../lib/crypto';
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  CreateApiKeyInput,
  UpsertCustomerPricingInput,
} from '../schemas/customer.schema';
import type { PaginationParams } from '../types';

const svcLogger = logger.child({ service: 'customer' });

// -------------------------------------------------------------------------- //
// Customers
// -------------------------------------------------------------------------- //

export async function listCustomers(params: PaginationParams & { search?: string | null }) {
  const where: Record<string, unknown> = {};
  if (params.search) {
    where.OR = [
      { name: { contains: params.search } },
      { email: { contains: params.search } },
      { businessName: { contains: params.search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        _count: {
          select: {
            franchises: true,
            apiKeys: true,
            vtonRequests: true,
          },
        },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total, page: params.page, pageSize: params.pageSize };
}

export async function getCustomer(id: string) {
  const cacheKey = `customer:${id}`;
  const cached = await cache.get<unknown>(cacheKey);
  if (cached) return cached;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      franchises: true,
      apiKeys: {
        select: {
          id: true,
          keyHint: true,
          keyPrefix: true,
          defaultCredit: true,
          usedCredit: true,
          expiresAt: true,
          revokedAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
      },
      pricingTiers: {
        where: { active: true },
        orderBy: { startRange: 'asc' },
      },
      _count: {
        select: {
          usages: true,
          vtonRequests: true,
          invoices: true,
          notifications: true,
        },
      },
    },
  });

  if (!customer) {
    throw new Error('NOT_FOUND: Customer not found');
  }

  await cache.set(cacheKey, customer, TTL.MEDIUM);
  return customer;
}

export async function createCustomer(input: CreateCustomerInput) {
  const customer = await prisma.customer.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      businessName: input.businessName,
      businessType: input.businessType ?? null,
      taxId: input.taxId ?? null,
      address: input.address ?? null,
      status: input.status ?? 'ACTIVE',
      notes: input.notes ?? null,
    },
  });
  await cache.invalidatePattern('customers:*');
  svcLogger.info({ customerId: customer.id }, 'customer created');
  return customer;
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('NOT_FOUND: Customer not found');
  }

  const data: Record<string, unknown> = { ...input };
  if (input.email) data.email = input.email.toLowerCase();

  const customer = await prisma.customer.update({
    where: { id },
    data,
  });

  await cache.del(`customer:${id}`);
  await cache.invalidatePattern('customers:*');
  return customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('NOT_FOUND: Customer not found');
  }
  await prisma.customer.delete({ where: { id } });
  await cache.del(`customer:${id}`);
  await cache.invalidatePattern('customers:*');
}

// -------------------------------------------------------------------------- //
// API Keys
// -------------------------------------------------------------------------- //

export async function listApiKeys(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new Error('NOT_FOUND: Customer not found');
  }
  return prisma.apiKey.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      keyHint: true,
      keyPrefix: true,
      defaultCredit: true,
      usedCredit: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
}

export async function createApiKey(customerId: string, input: CreateApiKeyInput) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new Error('NOT_FOUND: Customer not found');
  }

  const keyEncrypted = encryptApiKey(input.key);
  const expiresAt = new Date(
    Date.now() + (input.expiresInDays ?? 365) * 24 * 60 * 60 * 1000,
  );

  const apiKey = await prisma.apiKey.create({
    data: {
      keyEncrypted,
      keyHint: keyHint(input.key),
      keyPrefix: keyPrefix(input.key),
      customerId,
      defaultCredit: input.defaultCredit ?? 280,
      expiresAt,
    },
    select: {
      id: true,
      keyHint: true,
      keyPrefix: true,
      defaultCredit: true,
      usedCredit: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  await cache.del(`customer:${customerId}`);
  svcLogger.info({ customerId, apiKeyId: apiKey.id }, 'api key created');
  return apiKey;
}

export async function revokeApiKey(customerId: string, apiKeyId: string): Promise<void> {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: apiKeyId, customerId },
  });
  if (!apiKey) {
    throw new Error('NOT_FOUND: API key not found');
  }
  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { revokedAt: new Date() },
  });
  await cache.del(`customer:${customerId}`);
}

// -------------------------------------------------------------------------- //
// Pricing tiers
// -------------------------------------------------------------------------- //

export async function listCustomerPricing(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new Error('NOT_FOUND: Customer not found');
  }
  return prisma.customerPricing.findMany({
    where: { customerId },
    orderBy: { startRange: 'asc' },
  });
}

export async function upsertCustomerPricing(
  customerId: string,
  input: UpsertCustomerPricingInput,
) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new Error('NOT_FOUND: Customer not found');
  }

  // Replace strategy: wipe + recreate (simple + predictable).
  await prisma.$transaction([
    prisma.customerPricing.deleteMany({ where: { customerId } }),
    prisma.customerPricing.createMany({
      data: input.tiers.map((t) => ({
        customerId,
        startRange: t.startRange,
        endRange: t.endRange,
        priceCents: t.priceCents,
        label: t.label ?? null,
        active: t.active ?? true,
      })),
    }),
  ]);

  await cache.del(`customer:${customerId}`);
  return prisma.customerPricing.findMany({
    where: { customerId },
    orderBy: { startRange: 'asc' },
  });
}
