/**
 * @file proxy.ts (Next.js Rota Koruması ve Oturum Bekçisi / Middleware)
 *
 * 🎯 BU DOSYANIN AMACI VE ROLÜ:
 * Bu dosya, Next.js uygulamasının "Trafik Polisi"dir. Kullanıcı herhangi bir
 * sayfaya gitmek istediğinde sayfa ekrana basılmadan ÖNCE araya girer ve şunları yapar:
 *
 * 1. 🛡️ Sayfa Koruması (Protected Routes): Giriş yapmamış kullanıcıların
 *    `/dashboard` veya `/organizations` sayfalarına girmesini engeller, `/login`'e atar.
 * 2. 🔄 Sessiz Token Yenileme (Silent Token Refresh): 15 dakikalık access_token'ın
 *    süresi bittiğinde, kullanıcıyı siteden atmadan arka planda refresh_token ile
 *    otomatik olarak yeni token alır ve kesintisiz deneyim sunar.
 * 3. 🚫 Zaten Giriş Yapmış Olanı Engelleme: Giriş yapmış kullanıcının tekrar
 *    `/login` veya `/register` sayfalarına girmesine izin vermez, `/dashboard`'a yönlendirir.
 * 4. ⚡ Neden 'jose' kütüphanesi?: Klasik 'jsonwebtoken' kütüphanesi Next.js
 *    Middleware ortamında çalışmaz. 'jose' ise modern Web Crypto API ile hafif ve tam uyumludur.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE_KEYS } from '@sbase/constants';
import * as jose from 'jose';
import { applyAuthCookiesToResponse } from '@/features/auth/cookies';

// Giriş veya kayıt sayfaları (Kullanıcı zaten giriş yapmışsa buralara girememeli)
const AUTH_ROUTES = ['/login', '/register'];

/**
 * 🔄 refreshSession:
 * access_token'ın süresi dolduğunda (15 dk), refresh_token'ı kullanarak
 * NestJS API'sine gizlice istek atar ve yeni çerezleri (cookies) günceller.
 *
 * @param refreshToken - Tarayıcıdaki geçerli refresh_token
 * @param response - Kullanıcıya dönecek olan Next.js yanıt nesnesi
 * @returns Yenileme başarılıysa `true`, başarısızsa (token geçersizse) `false`
 */
async function refreshSession(refreshToken: string, response: NextResponse,): Promise<boolean> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) return false;

  // 1. NestJS backend'inin /auth/refresh kapısına refresh_token ile istek atıyoruz
  const refreshRes = await fetch(`${apiUrl}/auth/refresh`, {
    method: 'POST',
    headers: { Cookie: `${COOKIE_KEYS.REFRESH_TOKEN}=${refreshToken}` },
  });

  // Yenileme başarısız olduysa (refresh token da geçersiz veya süresi dolmuşsa)
  if (!refreshRes.ok) return false;

  // 2. API'nin döndüğü yeni Set-Cookie başlıklarını alıp Next.js yanıtına işliyoruz
  applyAuthCookiesToResponse(response, refreshRes.headers.getSetCookie());
  return true;
}

/**
 * 🛡️ proxy:
 * Next.js'e gelen her sayfa isteğini yakalayan ana bekçi fonksiyonu.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Kullanıcının tarayıcısındaki çerezlerden token'ları okuyoruz
  const accessToken = request.cookies.get(COOKIE_KEYS.ACCESS_TOKEN)?.value;
  const refreshToken = request.cookies.get(COOKIE_KEYS.REFRESH_TOKEN)?.value;

  // 2. Kullanıcı şu anda hangi sayfaya gitmeye çalışıyor?
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r)); // /login veya /register mi?
  const isProtected = pathname.startsWith('/organizations') || pathname.startsWith('/dashboard'); // Korumalı panel mi?

  // 3. access_token geçerli mi? ('jose' kütüphanesi ile kriptografik doğrulama)
  let isValid = false;
  if (accessToken && process.env.JWT_ACCESS_SECRET) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
      await jose.jwtVerify(accessToken, secret);
      isValid = true; // Token sağlam ve süresi henüz dolmamış
    } catch {
      // Token'ın süresi dolmuş (15 dk geçmiş) veya geçersiz; isValid = false kalır
    }
  }

  // ---------------------------------------------------------------------------
  // SENARYO A: Giriş yapmış kullanıcı tekrar /login veya /register'a girmeye çalışırsa
  // ---------------------------------------------------------------------------
  if (isAuthRoute && isValid) {
    // Zaten içeride, onu doğrudan ana panele gönder
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // access_token bitmiş ama refresh_token varsa yine de /login'e sokma, yenileyip /dashboard'a at
  if (isAuthRoute && refreshToken) {
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    if (await refreshSession(refreshToken, response)) return response;
  }

  // ---------------------------------------------------------------------------
  // SENARYO B: Giriş yapmamış veya token'ı bitmiş kullanıcı /dashboard'a girmeye çalışırsa
  // ---------------------------------------------------------------------------
  if (isProtected && !isValid) {
    // Kurtarma Planı: access_token bitmiş ama refresh_token var mı?
    if (refreshToken) {
      const response = NextResponse.next();
      // Arka planda token'ı sessizce yenilemeyi dene:
      if (await refreshSession(refreshToken, response)) return response;
    }

    // refresh_token da yoksa veya süresi dolmuşsa (7 gün geçmişse), giriş yapmaya zorla:
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // ---------------------------------------------------------------------------
  // SENARYO C: Her şey yolundaysa veya halka açık bir sayfaysa geçişe izin ver
  // ---------------------------------------------------------------------------
  return NextResponse.next();
}

/**
 * ⚙️ config.matcher:
 * Hangi sayfalarda bu proxy'nin çalışacağını belirler.
 * Statik resimler, CSS, JS ve favicon gibi gereksiz dosyaları süzgeçten geçirip yormaz.
 */
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'], };
