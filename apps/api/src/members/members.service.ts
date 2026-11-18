import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service.js';
import { orgMembers, organizations, users } from '../db/schema/index.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

/**
 * 👥 MEMBERS SERVICE (Organizasyon Üyeleri Yönetim Servisi)
 *
 * Bu servis bir organizasyondaki (takımdaki) üyelerin listelenmesi, rollerinin
 * değiştirilmesi (admin/developer) ve üyelikten çıkarılması (soft-delete) işlemlerini yürütür.
 */
@Injectable()
export class MembersService {
  constructor(private drizzle: DrizzleService) {}

  /**
   * 📋 getMembers:
   * Verilen organizasyon slug'ına (`orgSlug`) ait aktif üyelerin listesini döner.
   *
   * 🔗 İlişkisel Veritabanı Mantığı (Joins):
   * 1. `orgMembers` tablosundan başlar.
   * 2. `innerJoin(organizations)` -> Organizasyonun slug eşleşmesini sağlar.
   * 3. `innerJoin(users)` -> Üyenin kullanıcı bilgilerini (ad, email, avatar vb.) çeker.
   * 4. `isNull(orgMembers.removedAt)` -> Çıkarılmış (soft-deleted) üyeleri listeye DAHİL ETMEZ.
   *
   * @param {string} orgSlug - Organizasyonun URL adı (örn: "my-team")
   * @returns Üyelerin rolleri ve kullanıcı detaylarıyla birlikte listesi
   */
  async getMembers(orgSlug: string) {
    return this.drizzle.db
      .select({
        id: orgMembers.id,
        role: orgMembers.role,
        createdAt: orgMembers.createdAt,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(
        and(eq(organizations.slug, orgSlug), isNull(orgMembers.removedAt)),
      );
  }

  /**
   * 🛡️ updateRole:
   * Bir üyenin organizasyondaki yetkisini günceller (örn: 'admin' <-> 'developer').
   *
   * ⚠️ Kritik Güvenlik Kuralı:
   * Eğer bir admin'in yetkisi 'developer' seviyesine düşürülüyorsa (demote),
   * organizasyonda başka aktif bir admin kalıp kalmadığı kontrol edilir.
   * Son admin'in yetkisi asla düşürülemez!
   *
   * @param {string} orgSlug - Organizasyon slug'ı
   * @param {string} memberId - Güncellenecek üyelik kaydının ID'si
   * @param {UpdateRoleDto} dto - Yeni atanacak rol
   */
  async updateRole(orgSlug: string, memberId: string, dto: UpdateRoleDto) {
    // 1. Eğer admin rolünden developer rolüne düşürülüyorsa son admin kontrolü yap
    if (dto.role === 'developer') {
      await this.ensureNotLastAdmin(orgSlug, memberId);
    }

    // 2. Üyenin yeni rolünü veritabanında güncelle
    const [updated] = await this.drizzle.db
      .update(orgMembers)
      .set({ role: dto.role })
      .where(eq(orgMembers.id, memberId))
      .returning();

    // 3. Kayıt bulunamadıysa 404 hatası fırlat
    if (!updated) throw new NotFoundException('Member not found');
    return updated;
  }

  /**
   * 🚪 removeMember:
   * Bir üyeyi organizasyondan çıkarır.
   *
   * 💡 Soft-Delete (Yumuşak Silme) Yaklaşımı:
   * Veritabanından satırı fiziksel olarak silmek (`DELETE FROM`) yerine,
   * `removedAt: new Date()` tarihi atanır. Böylece geçmiş loglar, audit kayıtları
   * ve veri bütünlüğü korunur.
   *
   * ⚠️ Kritik Kontrol:
   * Organizasyondaki son admin kendini veya başka tek admini silemez!
   *
   * @param {string} orgSlug - Organizasyon slug'ı
   * @param {string} memberId - Çıkarılacak üyelik kaydının ID'si
   */
  async removeMember(orgSlug: string, memberId: string) {
    // 1. Son kalan adminin silinmesini engelle
    await this.ensureNotLastAdmin(orgSlug, memberId);

    // 2. Soft-delete: removedAt kolonuna silinme zamanını damgala
    const [updated] = await this.drizzle.db
      .update(orgMembers)
      .set({ removedAt: new Date() })
      .where(eq(orgMembers.id, memberId))
      .returning();

    if (!updated) throw new NotFoundException('Member not found');
    return { message: 'Member removed' };
  }

  /**
   * 🔒 ensureNotLastAdmin (Private Yardımcı Fonksiyon):
   * Bir organizasyonun "yöneticisiz (öksüz)" kalmasını engeller.
   *
   * Kontrol Mantığı:
   * 1. Organizasyondaki aktif (silinmemiş) tüm admin'leri bulur.
   * 2. Eğer hedef üye bir admin ise VE toplam admin sayısı yalnızca 1 ise:
   *    İşlemi durdurup 400 BadRequestException fırlatır.
   */
  private async ensureNotLastAdmin(orgSlug: string, memberId: string) {
    const admins = await this.drizzle.db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(
        and(
          eq(organizations.slug, orgSlug),
          eq(orgMembers.role, 'admin'),
          isNull(orgMembers.removedAt),
        ),
      );

    const targetIsAdmin = admins.some((a) => a.id === memberId);

    if (targetIsAdmin && admins.length === 1) {
      throw new BadRequestException(
        'Cannot remove or demote the last admin of an organization',
      );
    }
  }
}
