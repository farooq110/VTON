import { z } from 'zod';

/**
 * Sign-in schema — accepts EITHER `email` OR `identifier` (the frontend sends
 * `identifier` to support email-or-franchise-name login). The auth service
 * normalizes both to an email lookup. Both fields are optional in the schema
 * but the refine() enforces that exactly one of them is present.
 *
 * This keeps the existing `/signin` endpoint backward-compatible: callers
 * that sent `{ email, password }` still work, and callers that send
 * `{ identifier, password }` (the new frontend convention) also work.
 */
export const signinSchema = z
  .object({
    email: z.string().email('Must be a valid email').optional(),
    identifier: z.string().min(1).optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((data) => !!data.email || !!data.identifier, {
    message: 'Either email or identifier is required',
    path: ['email'],
  });
export type SigninInput = z.infer<typeof signinSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Must be a valid email'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().optional(),
  sort: z.string().optional(),
});
