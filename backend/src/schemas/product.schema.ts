import { z } from 'zod';

/**
 * Product schemas — used by the boutique frontend's product list, product
 * detail page, trending rail, and TRY ON flow.
 *
 * A Product is a garment that a customer can virtually "try on". The data
 * shape mirrors the frontend's `Product` TypeScript type so the API contract
 * is identical end-to-end. Colors + sizes are arrays so the frontend can
 * render swatches and size pickers without post-processing.
 */
export const colorSchema = z.object({
  name: z.string().min(1),
  hex: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
});

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  isNew: z.coerce.boolean().optional(),
  inStock: z.coerce.boolean().optional(),
  sort: z.enum(['trending', 'newest', 'price-asc', 'price-desc']).optional(),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productIdSchema = z.object({
  id: z.string().min(1),
});
