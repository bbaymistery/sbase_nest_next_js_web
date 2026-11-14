'use server';

/**
 * @file action.ts
 * @description Next.js Server Action that handles both Login and Register form submissions.
 *
 * It validates incoming form data with Zod, sends the request to the NestJS backend API,
 * forwards authentication cookies to the browser, and redirects to the dashboard.
 */

import { redirect } from 'next/navigation';
import { authServerSchema } from './server.schema';
import { AUTH_INTENT } from './constants';
import { applyAuthCookiesFromResponse } from './cookies';

/**
 * State object returned to the frontend form (e.g. for `useActionState`).
 */
export type AuthActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Main authentication Server Action.
 *
 * @param _prev - Previous state from useActionState hook.
 * @param formData - Form data sent from the browser form.
 * @returns An error object if validation or API fails; redirects on success.
 */
export async function authAction(_prev: AuthActionState, formData: FormData,): Promise<AuthActionState> {
  // 1. Convert FormData into a regular JavaScript object
  const raw = Object.fromEntries(formData);

  // 2. Validate form input using Zod schema
  const parsed = authServerSchema.safeParse(raw);

  if (!parsed.success) {
    // Return validation errors for individual inputs (e.g. invalid email format)
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // 3. Separate intent ('LOGIN' or 'REGISTER') from the actual form fields
  const { intent, ...data } = parsed.data;

  let res: Response;

  // 4. Send request to backend API depending on intent
  switch (intent) {
    case AUTH_INTENT.LOGIN: {
      res = await fetch(`${process.env.API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json();
        return { error: body.message ?? 'Login failed' };
      }

      break;
    }

    case AUTH_INTENT.REGISTER: {
      res = await fetch(`${process.env.API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json();
        return { error: body.message ?? 'Registration failed' };
      }

      break;
    }
  }

  // 5. Forward authentication cookies from backend response into Next.js cookie store
  await applyAuthCookiesFromResponse(res!);

  // 6. Redirect authenticated user to the main dashboard
  redirect('/dashboard');
}
