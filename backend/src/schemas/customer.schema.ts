import { z } from 'zod';

export const customerStatus = z.enum(['ACTIVE', 'SUSPENDED', 'CHURNED', 'TRIAL']);

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Must be a valid email'),
  phone: z.string().optional().nullable(),
  businessName: z.string().min(1, 'Business name is required'),
  businessType: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  status: customerStatus.optional(),
  notes: z.string().optional().nullable(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerIdParamsSchema = z.object({
  id: z.string().min(1),
});

// API keys -------------------------------------------------------------------

export const createApiKeySchema = z.object({
  key: z
    .string()
    .min(8, 'API key must be at least 8 characters'),
  defaultCredit: z.number().int().positive().default(280),
  expiresInDays: z.number().int().positive().default(365),
  label: z.string().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const revokeApiKeySchema = z.object({
  id: z.string().min(1),
});

// Pricing tiers --------------------------------------------------------------

export const pricingTierSchema = z.object({
  startRange: z.number().int().nonnegative(),
  endRange: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
  label: z.string().optional().nullable(),
  active: z.boolean().default(true),
});
export type PricingTierInput = z.infer<typeof pricingTierSchema>;

export const upsertCustomerPricingSchema = z.object({
  tiers: z.array(pricingTierSchema).min(1, 'At least one tier is required'),
});
export type UpsertCustomerPricingInput = z.infer<typeof upsertCustomerPricingSchema>;
