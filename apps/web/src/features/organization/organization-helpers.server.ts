import { redirect } from 'next/navigation';
import apiClient from '@/lib/axios';
import { retrieveTokenFromCookie } from '@/server-utils/utils';
import { COOKIE_KEYS } from '@sbase/constants';
import type { OrganizationWithMeta } from '@sbase/types';

/**
 * 🏢 ORGANIZATION SERVER HELPERS (Sunucu Veri Çekme Katmanı)
 * 1. Sorumlulukların Ayrımı (Separation of Concerns):
 *    - `server-utils/utils.ts` -> Düşük seviyeli genel bir araçtır. Tek görevi çerezden token'ı okumaktır.
 *    - `organization-helpers.server.ts` -> Organizasyon özelliğine (feature) özel "Data Access Layer" (Veri Erişim Katmanı)dır.
 *      Backend'deki NestJS API'sine (`/orgs`) gerçek HTTP isteklerini bu dosya atar.
 *
 * 2. `.server.ts` Uzantısının Amacı:
 *    - Bu dosyanın ve içindeki fonksiyonların YALNIZCA sunucuda (Server Components veya Server Actions)
 *      çalışacağını garanti eder. İstemci (Client/Browser) JavaScript paketine dahil edilmez, böylece hem
 *      güvenlik artar hem de tarayıcıya fazladan JS indirilmez.
 *
 * 3. Birlikte Nasıl Çalışırlar?
 *    Bu dosya içindeki fonksiyonlar, çerezden token okumak için az önce yazdığımız `retrieveTokenFromCookie()`
 *    fonksiyonunu çağırır, aldığı token ile NestJS'e istek yapar ve gelen sonucu sayfaya döndürür.
 */

/**
 * 📋 retrieveMyOrganizationsFromApi:
 * Oturum açmış kullanıcının üyesi olduğu tüm organizasyonları ve istatistiklerini (üye sayısı, proje sayısı vb.)
 * doğrudan NestJS backend API'sinden (`GET /orgs`) çeker.
 *
 * Akış Adımları:
 * 1. `retrieveTokenFromCookie()` ile çerezden kullanıcının access_token'ını alır.
 *    (Token yoksa kullanıcı zaten utils içinde `/login`e şutlanır).
 * 2. Axios (`apiClient`) ile NestJS API'sine sunucudan sunucuya (Server-to-Server) istek gönderir.
 * 3. İstek başlığına (Headers) Cookie bilgisi eklenir.
 * 4. API hata dönerse (örn: token süresi dolmuşsa veya 401 almışsa), kullanıcı `/login` sayfasına yönlendirilir.
 *
 * @returns {Promise<OrganizationWithMeta[]>} Kullanıcının organizasyon listesi
 */
export async function retrieveMyOrganizationsFromApi(): Promise<OrganizationWithMeta[]> {
  // 1. Sunucu çerez deposundan güvenli şekilde Access Token'ı çekiyoruz
  const token = await retrieveTokenFromCookie();

  try {
    // 2. NestJS Backend'e '/orgs' uç noktası üzerinden istek yapıyoruz
    const { data } = await apiClient.get<OrganizationWithMeta[]>('/orgs', {
      headers: {
        Cookie: `${COOKIE_KEYS.ACCESS_TOKEN}=${token}`,
      },
    });

    // 3. Başarılı veriyi Server Component'a geri döndürüyoruz
    return data;
  } catch {
    // 4. Backend yetki hatası veya başka bir hata dönerse kullanıcıyı giriş sayfasına yönlendiriyoruz
    redirect('/login');
  }
}

/**
 * 🔍 retrieveOrganizationBySlugFromApi:
 * Belirli bir organizasyonun URL slug değerine (örn: 'my-team-slug') göre
 * detaylarını NestJS backend API'sinden (`GET /orgs/:slug`) çeker.
 *
 * Akış Adımları:
 * 1. Token'ı çerezden okur.
 * 2. NestJS'e `GET /orgs/${slug}` isteği atar.
 * 3. Eğer kullanıcı bu organizasyonun üyesi değilse veya slug geçersizse (404/403/500),
 *    kullanıcıyı dashboard ana listesine (`/organizations`) yönlendirir.
 *
 * @param {string} slug - Organizasyonun benzersiz URL adı (örnek: "google", "sbase-team")
 * @returns {Promise<any>} İlgili organizasyonun detay bilgisi
 */
export async function retrieveOrganizationBySlugFromApi(slug: string) {
  // 1. Çerezden kullanıcı token'ını alıyoruz
  const token = await retrieveTokenFromCookie();

  try {
    // 2. Slug parametresini kullanarak backend'den ilgili organizasyonun verisini istiyoruz
    const { data } = await apiClient.get(`/orgs/${slug}`, {
      headers: { Cookie: `${COOKIE_KEYS.ACCESS_TOKEN}=${token}` },
    });

    // 3. Organizasyon detaylarını döndürüyoruz
    return data;
  } catch {
    // 4. Organizasyon bulunamazsa veya erişim yetkisi yoksa organizasyonlar ana sayfasına yönlendiriyoruz
    redirect('/organizations');
  }
}
