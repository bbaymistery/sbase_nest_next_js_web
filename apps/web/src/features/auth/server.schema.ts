/**
 * @file server.schema.ts
 * @description Server-side validation schema for unified authentication Server Actions.
 *
 * Utilizes a Zod discriminated union keyed on `intent` to dynamically branch
 * validation between Login and Register payloads. Reuses existing client schema
 * definitions (`.shape`) to enforce DRY principles and eliminate schema drift.
 */

import { z } from 'zod';
import { AUTH_INTENT } from './constants';
import { loginSchema, registerSchema } from './client.schema';

export const authServerSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal(AUTH_INTENT.LOGIN),
    ...loginSchema.shape,
  }),
  z.object({
    intent: z.literal(AUTH_INTENT.REGISTER),
    ...registerSchema.shape,
  }),
]);



export type AuthServerInput = z.infer<typeof authServerSchema>;