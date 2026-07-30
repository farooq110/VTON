import { z } from 'zod';

/**
 * Brand schemas — used by the frontend's boutique UI (HomePage cover banner,
 * brand logo, brand name, tagline).
 *
 * The Brand model is intentionally lightweight — it represents the
 * "storefront" identity a customer sees when they walk up to a kiosk. The
 * admin portal can edit it via the Admin API; the frontend reads it via the
 * public `/api/brand` endpoint.
 */
export const brandUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  tagline: z.string().min(1).max(200).optional(),
  logoUrl: z.string().url().or(z.literal('')).optional(),
  coverBannerUrl: z.string().url().or(z.literal('')).optional(),
  customName: z.string().max(120).nullable().optional(),
  customLogoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  customCoverBannerUrl: z.string().url().or(z.literal('')).nullable().optional(),
  primaryColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .or(z.literal(''))
    .optional(),
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .or(z.literal(''))
    .optional(),
});
export type BrandUpdateInput = z.infer<typeof brandUpdateSchema>;

export const brandIdSchema = z.object({
  id: z.string().min(1),
});
