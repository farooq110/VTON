import { z } from 'zod';

export const calculateBillingSchema = z.object({
  totalCredits: z.number().int().nonnegative(),
  tiers: z
    .array(
      z.object({
        startRange: z.number().int().nonnegative(),
        endRange: z.number().int().positive(),
        priceCents: z.number().int().nonnegative(),
        label: z.string().optional().nullable(),
        active: z.boolean().optional().default(true),
      }),
    )
    .min(1, 'At least one pricing tier is required'),
  // `currency` accepts a symbol ("$") or code ("USD"); `currencyCode` is the
  // ISO 4217 3-letter code used for Intl.NumberFormat.
  currency: z.string().min(1).max(3).default('USD'),
  currencyCode: z.string().length(3).default('USD'),
});
export type CalculateBillingInput = z.infer<typeof calculateBillingSchema>;

export const pricingIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const updatePricingTierSchema = z.object({
  startRange: z.number().int().nonnegative().optional(),
  endRange: z.number().int().positive().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  label: z.string().optional().nullable(),
  active: z.boolean().optional(),
});
export type UpdatePricingTierInput = z.infer<typeof updatePricingTierSchema>;
