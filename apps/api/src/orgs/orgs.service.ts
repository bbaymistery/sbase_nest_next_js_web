import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import slugify from 'slugify';
import { DrizzleService } from '../db/drizzle.service.js';
import { organizations, orgMembers, projects } from '../db/schema/index.js';
import { CreateOrgDto } from './dto/create-org.dto.js';

@Injectable()
export class OrgsService {
  constructor(private drizzle: DrizzleService) { }

  /**
   * 🏷️ generateOrgSlug:
   * Organizasyon adı için URL dostu ve veritabanında çakışmayan (unique) bir slug üretir.
   * Örn: "Acme Corp" -> "acme-corp-org-a8b2c1"
   */
  private generateOrgSlug(name: string): string {
    const base = slugify(`${name}-org`, { lower: true, strict: true });
    const suffix = randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
  }

  /**
   * 🏢 getMyOrgs:
   * Giriş yapmış kullanıcının üye olduğu tüm organizasyonları, her organizasyondaki
   * kendi rolünü, toplam proje sayısını ve üye sayısını tek bir SQL sorgusuyla getirir.
   *
   * ❓ Neden innerJoin ve leftJoin kullanıldı?
   * 1. innerJoin(organizations): Kullanıcının üye olduğu organizasyonun detaylarını (isim, slug)
   *    almak için kullanılır. Sadece iki tarafta da karşılığı olan aktif kayıtlar gelir.
   * 2. leftJoin(projects): ÇOK ÖNEMLİ! Eğer innerJoin yapsaydık, henüz hiç projesi olmayan (0 proje)
   *    yeni organizasyonlar listede GÖRÜNMEZDİ! leftJoin sayesinde projesi olmasa bile
   *    organizasyon listelenir ve proje sayısı 0 görünür.
   * 3. groupBy: Projelerle birleştirme yapıldığında satırlar çoğalmasın, her organizasyon
   *    tek bir satır olarak toplansın ve count() doğru çalışsın diye gruplama yapılır.
   */
  async getMyOrgs(userId: string) {
    return this.drizzle.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        role: orgMembers.role,
        // Bu organizasyona ait tekil (distinct) proje sayısı
        projectCount: sql<number>`cast(count(distinct ${projects.id}) as int)`,
        // Bu organizasyona ait silinmemiş aktif toplam üye sayısı (Alt sorgu - Subquery)
        memberCount: sql<number>`(
          select cast(count(*) as int)
          from org_members om
          where om.org_id = ${organizations.id}
            and om.removed_at is null
        )`,
      })
      // 1. Kullanıcının üyelik kayıtlarından başlıyoruz
      .from(orgMembers)
      // 2. Üye olunan organizasyonun adını ve slug'ını çekiyoruz (Zorunlu eşleşme)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      // 3. Organizasyona ait projeleri bağlıyoruz (Proje olmasa bile organizasyonu korur)
      .leftJoin(projects, eq(projects.orgId, organizations.id))
      // 4. Sadece bu kullanıcıya ait ve üyeliği silinmemiş (removedAt is null) olanları filtreliyoruz
      .where(and(eq(orgMembers.userId, userId), isNull(orgMembers.removedAt)))
      // 5. Her organizasyonu tek bir satırda topluyoruz
      .groupBy(organizations.id, orgMembers.role);
  }

  /**
   * 🔍 getOrgBySlug:
   * URL'deki slug ile organizasyonu getirir, ANCAK aynı zamanda sorguyu atan
   * kullanıcının o organizasyonda üye olup olmadığını innerJoin ile doğrular.
   *
   * 🛡️ Güvenlik Avantajı:
   * Eğer kullanıcı o organizasyonun üyesi değilse, innerJoin eşleşme bulamaz ve
   * satır dönmez. Kullanıcıya doğrudan 'Organization not found' (404) dönerek
   * organizasyonun var olduğu bilgisini bile yabancılardan gizleriz.
   */
  async getOrgBySlug(slug: string, userId: string) {
    const [row] = await this.drizzle.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        role: orgMembers.role,
      })
      .from(organizations)
      // Kullanıcının bu organizasyonda aktif üye olup olmadığını kontrol eden kilit eşleşme:
      .innerJoin(
        orgMembers,
        and(
          eq(orgMembers.orgId, organizations.id),
          eq(orgMembers.userId, userId),
          isNull(orgMembers.removedAt),
        ),
      )
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!row) throw new NotFoundException('Organization not found');
    return row;
  }

  /**
   * ✨ createOrg:
   * Yeni bir organizasyon oluşturur ve oluşturan kullanıcıyı otomatik olarak
   * o organizasyonun 'admin' rolündeki üyesi olarak kaydeder.
   */
  async createOrg(dto: CreateOrgDto, userId: string) {
    // 1. Organizasyonu oluştur ve id'sini dön
    const [org] = await this.drizzle.db
      .insert(organizations)
      .values({ name: dto.name, slug: this.generateOrgSlug(dto.name) })
      .returning();

    // 2. Oluşturan kullanıcıyı orgMembers tablosuna 'admin' olarak ekle
    await this.drizzle.db.insert(orgMembers).values({
      orgId: org.id,
      userId,
      role: 'admin',
    });

    return org;
  }
}
