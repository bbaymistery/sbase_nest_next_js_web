/**
 * @file cookies.ts
 * @description Helper functions to handle authentication cookies in Next.js.
 *
 * It parses "Set-Cookie" headers coming from the backend API (NestJS)
 * and safely applies them to Next.js cookies.
 */

import { COOKIE_KEYS } from '@sbase/constants';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

type ParsedCookie = {
  name: string;
  value: string;
  options: {
    path: string;
    maxAge?: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
  };
};

/**
 * Parses a single "Set-Cookie" header string into an object with name, value, and options.
 * Example input: "access_token=xyz; Path=/; HttpOnly; SameSite=Lax"
 */
export function parseSetCookieHeader(setCookie: string): ParsedCookie {
  // 1. Split the string by semicolon to separate the cookie name/value from attributes
  const parts = setCookie.split(';').map((part) => part.trim());
  const [nameValue, ...attributes] = parts;

  // 2. Extract cookie name and value
  const separatorIndex = nameValue.indexOf('=');
  const name = nameValue.slice(0, separatorIndex);
  const value = nameValue.slice(separatorIndex + 1);

  // 3. Set default safe options
  const options: ParsedCookie['options'] = {
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'lax',
  };

  // 4. Parse attributes like Path, Max-Age, HttpOnly, Secure, SameSite
  for (const attribute of attributes) {
    const separator = attribute.indexOf('=');
    const key = (separator === -1 ? attribute : attribute.slice(0, separator)).toLowerCase();
    const val = separator === -1 ? '' : attribute.slice(separator + 1);

    switch (key) {
      case 'path': options.path = val;
        break;
      case 'max-age': options.maxAge = Number.parseInt(val, 10);
        break;
      case 'httponly': options.httpOnly = true;
        break;
      case 'secure': options.secure = true;
        break;
      case 'samesite': options.sameSite = val.toLowerCase() as ParsedCookie['options']['sameSite'];
        break;
    }
  }

  return { name, value, options };
}

/**
 * Checks if a cookie name is an authentication token (access_token or refresh_token).
 */
function isAuthCookie(name: string) {
  return (name === COOKIE_KEYS.ACCESS_TOKEN || name === COOKIE_KEYS.REFRESH_TOKEN);
}

/**
 * Reads "Set-Cookie" headers from an API response and saves auth cookies
 * into Next.js Server Action cookie store (for browser).
 */
export async function applyAuthCookiesFromResponse(response: Response) {
  const cookieStore = await cookies();
  for (const header of response.headers.getSetCookie()) {
    const parsed = parseSetCookieHeader(header);
    // Ignore any cookies that are not related to auth
    if (!isAuthCookie(parsed.name)) continue;
    cookieStore.set(parsed.name, parsed.value, parsed.options);
  }
}

/**
 * Takes "Set-Cookie" strings and attaches auth cookies to a Next.js Middleware response.
 */
export function applyAuthCookiesToResponse(response: NextResponse, setCookieHeaders: string[],) {
  for (const header of setCookieHeaders) {
    const parsed = parseSetCookieHeader(header);
    if (!isAuthCookie(parsed.name)) continue;
    response.cookies.set(parsed.name, parsed.value, parsed.options);
  }
}
