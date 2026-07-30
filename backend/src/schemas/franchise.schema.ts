import { z } from 'zod';

export const franchiseStatus = z.enum(['ACTIVE', 'INACTIVE', 'PAUSED']);

export const createFranchiseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  managerName: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  status: franchiseStatus.optional(),
  customerId: z.string().min(1, 'customerId is required'),
});
export type CreateFranchiseInput = z.infer<typeof createFranchiseSchema>;

export const updateFranchiseSchema = createFranchiseSchema.partial().omit({ customerId: true });
export type UpdateFranchiseInput = z.infer<typeof updateFranchiseSchema>;

export const franchiseIdParamsSchema = z.object({
  id: z.string().min(1),
});
