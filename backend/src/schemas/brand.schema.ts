import { z } from 'zod';

/**
 * Brand schemas — used by the frontend's boutique UI (HomePage cover banner,
 * brand logo, brand name, tagline).
 *
 * Issue 2 fix — logoUrl and coverBannerUrl now accept null (the frontend
 * sends the full brand object which has nullable fields). Previously the
 * schema used `z.string().url().or(z.literal(''))` which rejected null,
 * causing "Expected string, received null" validation errors when the
 * frontend sent `logoUrl: null` (which is the default for a fresh brand).
 */
export const brandUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  tagline: z.string().min(1).max(200).optional(),
  // Accept string (URL or data URL), null (clear), or undefined (skip).
  logoUrl: z.string().max(10_000_000).nullable().optional(),
  coverBannerUrl: z.string().max(10_000_000).nullable().optional(),
  customName: z.string().max(120).nullable().optional(),
  customLogoUrl: z.string().max(10_000_000).nullable().optional(),
  customCoverBannerUrl: z.string().max(10_000_000).nullable().optional(),
  primaryColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .or(z.literal(''))
    .nullable()
    .optional(),
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .or(z.literal(''))
    .nullable()
    .optional(),
  id: z.string().optional(),
  isActive: z.boolean().optional(),
});
export type BrandUpdateInput = z.infer<typeof brandUpdateSchema>;

export const brandIdSchema = z.object({
  id: z.string().min(1),
});
