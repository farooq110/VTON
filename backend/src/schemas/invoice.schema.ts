import { z } from 'zod';

export const generateInvoiceSchema = z.object({
  customerId: z.string().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  currency: z.string().min(1).max(3).default('USD'),
  currencyCode: z.string().length(3).default('USD'),
  notes: z.string().optional().nullable(),
});
export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;

export const listInvoicesQuerySchema = z.object({
  customerId: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

export const invoiceIdParamsSchema = z.object({
  id: z.string().min(1),
});
