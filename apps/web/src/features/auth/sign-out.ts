'use server';

/**
 * @file sign-out.ts
 * @description Next.js Server Action for user sign-out and session revocation.
 *
 * Implements a dual-layer logout flow:
 * 1. Back-channel revocation: Notifies backend API to revoke active refresh tokens.
 * 2. Front-channel cleanup: Clears auth cookies (ACCESS_TOKEN, REFRESH_TOKEN) via Next.js cookie store.
 * 3. Redirects the unauthenticated user back to `/login`.
 */

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { COOKIE_KEYS } from '@sbase/constants';

export async function signOut() {
  // 1. Notify API service to invalidate server-side session/refresh tokens
  await fetch(`${process.env.API_URL}/auth/logout`, { method: 'POST' });

  // 2. Remove authentication cookies from client's browser
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_KEYS.ACCESS_TOKEN);
  cookieStore.delete(COOKIE_KEYS.REFRESH_TOKEN);

  // 3. Redirect to login view
  redirect('/login');
}
