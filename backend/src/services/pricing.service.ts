import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type {
  CalculateBillingInput,
} from '../schemas/pricing.schema';

const svcLogger = logger.child({ service: 'pricing' });

// -------------------------------------------------------------------------- //
// Tiered billing calculation
// -------------------------------------------------------------------------- //

export interface BillingLineItem {
  type: 'flat' | 'overflow';
  tierLabel: string | null;
  startRange: number;
  endRange: number;
  credits: number;
  priceCents: number;
  priceFormatted: string;
}

export interface BillingResult {
  totalCredits: number;
  lineItems: BillingLineItem[];
  totals: {
    subtotalCents: number;
    currency: string;
    currencyCode: string;
    totalFormatted: string;
  };
}

function formatMoney(cents: number, currencyCode: string): string {
  const major = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(major);
}

/**
 * Progressive tiered billing with pro-rata overflow.
 *
 * Algorithm:
 *   1. Filter active tiers, sort by startRange asc.
 *   2. If usage fits in some tier's [startRange, endRange] → charge that
 *      tier's flat priceCents.
 *   3. If usage exceeds the highest tier's endRange → charge the highest
 *      tier's flat priceCents + pro-rata overflow:
 *          overflowCredits × priceCents / tierSpan
 *      where tierSpan = endRange - startRange + 1.
 *
 * Returns lineItems[] (type "flat" or "overflow") + totals.
 */
export function calculateBilling(input: CalculateBillingInput): BillingResult {
  const { totalCredits, tiers, currency, currencyCode } = input;

  if (totalCredits < 0) {
    throw new Error('VALIDATION: totalCredits must be non-negative');
  }
  if (tiers.length === 0) {
    throw new Error('NO_PRICING_TIER: customer has no pricing tiers');
  }

  const active = tiers
    .filter((t) => t.active ?? true)
    .sort((a, b) => a.startRange - b.startRange);

  if (active.length === 0) {
    throw new Error('NO_PRICING_TIER: customer has no active pricing tiers');
  }

  const lineItems: BillingLineItem[] = [];
  let subtotalCents = 0;

  // Find the tier whose [startRange, endRange] contains totalCredits.
  const fittingTier = active.find(
    (t) => totalCredits >= t.startRange && totalCredits <= t.endRange,
  );

  if (fittingTier) {
    // Case 1: usage is within a tier's range → flat charge
    subtotalCents = fittingTier.priceCents;
    lineItems.push({
      type: 'flat',
      tierLabel: fittingTier.label ?? null,
      startRange: fittingTier.startRange,
      endRange: fittingTier.endRange,
      credits: totalCredits,
      priceCents: fittingTier.priceCents,
      priceFormatted: formatMoney(fittingTier.priceCents, currencyCode),
    });
  } else {
    // Case 2: usage exceeds the highest tier → flat + pro-rata overflow
    const highest = active[active.length - 1];
    if (totalCredits <= highest.endRange) {
      // Shouldn't happen given the find() above, but be defensive
      subtotalCents = highest.priceCents;
      lineItems.push({
        type: 'flat',
        tierLabel: highest.label ?? null,
        startRange: highest.startRange,
        endRange: highest.endRange,
        credits: totalCredits,
        priceCents: highest.priceCents,
        priceFormatted: formatMoney(highest.priceCents, currencyCode),
      });
    } else {
      // Flat charge for the highest tier
      const flatCredits = highest.endRange;
      const flatCents = highest.priceCents;

      // Pro-rata overflow
      const tierSpan = highest.endRange - highest.startRange + 1;
      const overflowCredits = totalCredits - highest.endRange;
      const overflowCents = Math.round(
        (overflowCredits * highest.priceCents) / tierSpan,
      );

      subtotalCents = flatCents + overflowCents;

      lineItems.push({
        type: 'flat',
        tierLabel: highest.label ?? null,
        startRange: highest.startRange,
        endRange: highest.endRange,
        credits: flatCredits,
        priceCents: flatCents,
        priceFormatted: formatMoney(flatCents, currencyCode),
      });

      lineItems.push({
        type: 'overflow',
        tierLabel: highest.label ?? null,
        startRange: highest.endRange + 1,
        endRange: totalCredits,
        credits: overflowCredits,
        priceCents: overflowCents,
        priceFormatted: formatMoney(overflowCents, currencyCode),
      });
    }
  }

  svcLogger.debug(
    { totalCredits, subtotalCents, lineItems: lineItems.length },
    'billing calculated',
  );

  return {
    totalCredits,
    lineItems,
    totals: {
      subtotalCents,
      currency,
      currencyCode,
      totalFormatted: formatMoney(subtotalCents, currencyCode),
    },
  };
}

// -------------------------------------------------------------------------- //
// Pricing tier CRUD (for /pricing/:id routes — these operate on the global
// CustomerPricing table by id, since tiers always belong to a customer).
// -------------------------------------------------------------------------- //

export async function getPricingTier(id: string) {
  const tier = await prisma.customerPricing.findUnique({ where: { id } });
  if (!tier) {
    throw new Error('NOT_FOUND: Pricing tier not found');
  }
  return tier;
}

export async function updatePricingTier(
  id: string,
  input: Partial<{
    startRange: number;
    endRange: number;
    priceCents: number;
    label: string | null;
    active: boolean;
  }>,
) {
  const existing = await prisma.customerPricing.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('NOT_FOUND: Pricing tier not found');
  }
  const tier = await prisma.customerPricing.update({
    where: { id },
    data: input,
  });
  await cacheInvalidateForCustomer(existing.customerId);
  return tier;
}

export async function deletePricingTier(id: string): Promise<void> {
  const existing = await prisma.customerPricing.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('NOT_FOUND: Pricing tier not found');
  }
  await prisma.customerPricing.delete({ where: { id } });
  await cacheInvalidateForCustomer(existing.customerId);
}

async function cacheInvalidateForCustomer(customerId: string): Promise<void> {
  // Importing cache lazily here avoids a circular import noise — but it's fine
  // to import at top. Doing it inline for clarity.
  const { cache } = await import('../lib/cache');
  await cache.del(`customer:${customerId}`);
}

// -------------------------------------------------------------------------- //
// Convenience: calculate billing for a customer using their stored tiers.
// -------------------------------------------------------------------------- //

export async function calculateBillingForCustomer(
  customerId: string,
  totalCredits: number,
  currency = 'USD',
  currencyCode = 'USD',
): Promise<BillingResult> {
  const tiers = await prisma.customerPricing.findMany({
    where: { customerId, active: true },
    orderBy: { startRange: 'asc' },
  });

  if (tiers.length === 0) {
    throw new Error('NO_PRICING_TIER: customer has no active pricing tiers');
  }

  return calculateBilling({
    totalCredits,
    tiers: tiers.map((t) => ({
      startRange: t.startRange,
      endRange: t.endRange,
      priceCents: t.priceCents,
      label: t.label,
      active: t.active,
    })),
    currency,
    currencyCode,
  });
}
