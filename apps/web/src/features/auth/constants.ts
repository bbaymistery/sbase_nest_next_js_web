/**
 * @file constants.ts
 * @description Authentication feature constants and discriminant action types.
 *
 * Provides single-source-of-truth action identifiers (`AUTH_INTENT`)
 * for unified form submissions and server-side discrimination.
 */

export const AUTH_INTENT = {
  LOGIN: 'LOGIN',
  REGISTER: 'REGISTER',
} as const;

export type AuthIntent = (typeof AUTH_INTENT)[keyof typeof AUTH_INTENT];
