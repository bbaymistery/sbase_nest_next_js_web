import { redirect } from 'next/navigation';
import { retrieveMyOrganizationsFromApi } from '@/features/organization/organization-helpers.server';

/**
 * 🚦 DASHBOARD YÖNLENDİRİCİSİ (Traffic Controller / Dispatcher Page)
 *
 * Kullanıcı giriş yaptığında veya doğrudan '/dashboard' linkine tıkladığında,
 * Supabase gibi multi-tenant (çok kiracılı) sistemlerde tek bir sabit "dashboard" ekranı yoktur.
 * Her şey bir Organizasyon (`/organizations/:slug/projects`) altında yaşar.
 *
 * 🧠 Akıllı UX Mantığı:
 * 1. Kullanıcının organizasyonlarını backend'den çekeriz (`retrieveMyOrganizationsFromApi`).
 * 2. Eğer kullanıcının SADECE 1 TANE organizasyonu varsa (`orgs.length === 1`):
 *    Kullanıcıyı boş yere seçim ekranıyla oyalamayız. Doğrudan o organizasyonun projeler sayfasına
 *    şutlarız: `/organizations/${orgs[0].slug}/projects` (Mükemmel kullanıcı deneyimi).
 * 3. Eğer kullanıcının 1'den fazla organizasyonu varsa veya hiç yoksa:
 *    Seçim yapabilmesi veya yeni organizasyon açabilmesi için `/organizations` sayfasına yönlendiririz.
 *
 * Bu sayfa kullanıcıya hiçbir HTML çizmez (render etmez); yalnızca akıllı bir trafik polisi gibi çalışır.
 */
export default async function DashboardPage() {
    // 1. Kullanıcının üye olduğu organizasyonları API'den çekiyoruz
    const orgs = await retrieveMyOrganizationsFromApi();
    console.log(orgs);

    // 2. Tek bir organizasyon varsa doğrudan onun projeler sayfasına git
    if (orgs.length === 1) {
        redirect(`/organizations/${orgs[0].slug}/projects`);
    }

    // 3. Birden fazla varsa veya hiç yoksa organizasyon listeleme/seçme ekranına git
    redirect('/organizations');
}
