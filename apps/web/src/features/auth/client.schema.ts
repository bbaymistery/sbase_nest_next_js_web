/**
 * @file client.schema.ts
 * @description Client-side Zod validation schemas for authentication forms (Login & Register).
 *
 * Enforces contract parity with `@sbase/types` via the `satisfies` operator,
 * ensuring form fields remain synchronized with backend DTOs without widening
 * or losing Zod's rich type-inference capabilities.
 */

import { z } from 'zod';
import type { LoginInput, RegisterInput } from '@sbase/types';

/**
 * Validation schema for the user login form.
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
}) satisfies z.ZodType<LoginInput>;

/**
 * Validation schema for user registration.
 * Enforces minimum password strength and mandatory display name.
 */
export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
}) satisfies z.ZodType<RegisterInput>;
