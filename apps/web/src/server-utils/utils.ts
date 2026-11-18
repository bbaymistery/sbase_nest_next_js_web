/**
 * @file utils.ts (Sunucu Tarafı Yardımcı Araçları / Server Utilities)
 *
 * 🎯 BU DOSYANIN AMACI:
 * Next.js Server Component'lerinde veya Server Action'larında çalışırken,
 * kullanıcının oturum çerezinden (cookie) access_token'ı güvenle almak için kullanılır.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_KEYS } from '@sbase/constants';

/**
 * 🔑 retrieveTokenFromCookie:
 * Next.js sunucu çerez deposundan kullanıcının 'access_token'ını okur.
 *
 * 🛡️ Güvenlik Koruması:
 * - Eğer token çerezlerde varsa: Token metnini (string) döner.
 * - Eğer token YOKSA (kullanıcı giriş yapmamışsa veya çerez silinmişse):
 *   Fonksiyon kodun çalışmasını anında keser ve kullanıcıyı doğrudan '/login'
 *   sayfasına şutlar (redirect).
 *
 * 💡 Nerede Kullanılır?
 * Dashboard, Organizations veya Proje sayfalarında backend API'sine (NestJS)
 * sunucu tarafından 'Authorization: Bearer <token>' başlığı ile istek atarken kullanılır.
 *
 * @returns {Promise<string>} Geçerli ve doğrulanmış access_token string değeri
 */
export async function retrieveTokenFromCookie(): Promise<string> {
  // 1. Next.js'in sunucu tarafı çerez deposuna erişiyoruz
  const cookieStore = await cookies();

  // 2. '@sbase/constants' içinden sabit anahtarla access_token'ı okuyoruz
  const token = cookieStore.get(COOKIE_KEYS.ACCESS_TOKEN)?.value;

  // 3. Token yoksa oturum kapalı demektir; kullanıcıyı hemen giriş sayfasına yönlendir
  if (!token) redirect('/login');

  // 4. Token varsa döner (TypeScript artık bunun undefined olmadığını %100 bilir)
  return token;
}
