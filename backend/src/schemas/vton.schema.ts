import { z } from 'zod';

export const tryonInputSchema = z.object({
  model_image: z.string().url('model_image must be a URL'),
  garment_image: z.string().url('garment_image must be a URL'),
  category: z.string().optional(),
  mode: z.string().optional(),
  garment_photo_type: z.string().optional(),
  num_samples: z.number().int().positive().max(4).optional(),
  return_base64: z.boolean().optional(),
});
export type TryonInput = z.infer<typeof tryonInputSchema>;

export const submitTryonSchema = z.object({
  franchiseId: z.string().min(1, 'franchiseId is required'),
  inputs: z.array(tryonInputSchema).min(1, 'At least one input is required').max(4),
});
export type SubmitTryonInput = z.infer<typeof submitTryonSchema>;

export const vtonListQuerySchema = z.object({
  customerId: z.string().optional(),
  franchiseId: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

export const vtonIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const vtonCreditsQuerySchema = z.object({
  customerId: z.string().min(1),
});
