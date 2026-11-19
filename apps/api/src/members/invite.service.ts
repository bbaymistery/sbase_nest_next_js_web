import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { and, eq, isNull } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service.js';
import { organizations, orgMembers, users } from '../db/schema/index.js';
import { INVITE_EXPIRES_IN } from '@sbase/constants';

/**
 * 📨 InvitePayload:
 * Davetiye JWT token'ının içine şifrelenen gizli veri paketi.
 */
interface InvitePayload {
  email: string;
  orgId: string;
  orgName: string;
}

/**
 * 💌 INVITE SERVICE (Organizasyon Davetiye & E-Posta Servisi)
 *
 * Bu servis takım arkadaşlarını davet etme (Magic Link üretimi),
 * Resend API ile e-posta gönderme ve davetiyeyi kabul etme süreçlerini yönetir.
 */
@Injectable()
export class InviteService {
  private resend: Resend;

  constructor(
    private drizzle: DrizzleService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    // Resend e-posta sağlayıcısını çevre değişkenindeki API anahtarıyla başlatıyoruz
    this.resend = new Resend(this.configService.get('RESEND_API_KEY'));
  }

  /**
   * 📤 sendInvite:
   * Belirtilen e-posta adresine organizasyona katılım davetiyesi e-postası gönderir.
   *
   * Akış Adımları:
   * 1. Organizasyonun var olup olmadığını teyit eder.
   * 2. Bu e-posta adresine sahip kullanıcının zaten bu organizasyonda AKTİF bir üye olup olmadığını kontrol eder.
   * 3. 24 saat geçerli (`INVITE_EXPIRES_IN`) imzalı bir JWT token üretir.
   * 4. Resend üzerinden şık bir HTML e-posta içinde davet kabul bağlantısını (`inviteUrl`) gönderir.
   *
   * @param {string} orgSlug - Davet eden organizasyonun URL slug'ı
   * @param {string} email - Davet edilecek kişinin e-posta adresi
   */
  async sendInvite(orgSlug: string, email: string) {
    // 1. Organizasyonu veritabanından buluyoruz
    const [org] = await this.drizzle.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);

    if (!org) throw new BadRequestException('Organization not found');

    // 2. Kullanıcı veritabanında var mı ve zaten bu organizasyonun aktif üyesi mi kontrol ediyoruz
    const existingUser = await this.drizzle.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      const existingMember = await this.drizzle.db
        .select()
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.orgId, org.id),
            eq(orgMembers.userId, existingUser[0].id),
            isNull(orgMembers.removedAt),
          ),
        )
        .limit(1);

      if (existingMember.length > 0) {
        throw new BadRequestException(
          'User is already a member of this organization',
        );
      }
    }

    // 3. Güvenli, süreli (24 saat) JWT davet token'ı imzalıyoruz
    const token = this.jwtService.sign(
      { email, orgId: org.id, orgName: org.name } satisfies InvitePayload,
      {
        secret: this.configService.get('INVITE_SECRET'),
        expiresIn: INVITE_EXPIRES_IN,
      },
    );

    // 4. Davet kabul bağlantısını oluşturuyoruz
    const inviteUrl = `${this.configService.get<string>('API_URL')}/auth/invite/accept?token=${token}`;

    // 5. Resend API aracılığıyla davet e-postasını gönderiyoruz
    const { data, error } = await this.resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: `You've been invited to join ${org.name} on Supavolt`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>You're invited to join ${org.name}</h2>
          <p>Someone has invited you to collaborate on Supavolt.</p>
          <a
            href="${inviteUrl}"
            style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
            Accept invite
          </a>
          <p style="color: #999; font-size: 13px;">This link expires in 24 hours.</p>
        </div>
      `,
    });
    if (error) {
      console.error('❌ Resend göndərmə xətası:', error);
      throw new BadRequestException(
        `Email göndərilə bilmədi: ${error.message}`,
      );
    }
    return { message: 'Invite sent' };
  }

  /**
   * 📥 acceptInvite:
   * Kullanıcı e-postasındaki "Accept invite" bağlantısına tıkladığında çalışır.
   *
   * Akış Adımları:
   * 1. JWT token'ın geçerliliğini ve süresini (24 saat) doğrular.
   * 2. Kullanıcı daha önce kayıt olmamışsa onun için otomatik bir `users` kaydı oluşturur.
   * 3. Zaten organizasyona katılmışsa tekrar eklemez (idempotency).
   * 4. Yeni üyeyi organizasyona varsayılan olarak 'developer' rolüyle kaydeder.
   *
   * @param {string} token - E-postadan gelen JWT davet token'ı
   */
  async acceptInvite(token: string) {
    let payload: InvitePayload;

    // 1. Token'ı 'INVITE_SECRET' ile çözüp doğruluyoruz
    try {
      payload = this.jwtService.verify<InvitePayload>(token, {
        secret: this.configService.get('INVITE_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired invite link');
    }

    // 2. Bu e-postaya sahip bir kullanıcı hesabı var mı bakıyoruz
    let [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, payload.email))
      .limit(1);

    // Eğer henüz sistemde kullanıcı kaydı yoksa, e-postasıyla yeni kullanıcı oluşturuyoruz
    if (!user) {
      const [newUser] = await this.drizzle.db
        .insert(users)
        .values({ email: payload.email })
        .returning();
      user = newUser;
    }

    // 3. Kullanıcı zaten organizasyonda aktif üye mi kontrol ediyoruz
    const existing = await this.drizzle.db
      .select()
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, payload.orgId),
          eq(orgMembers.userId, user.id),
          isNull(orgMembers.removedAt),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return { message: 'Already a member' };
    }

    // 4. Kullanıcıyı organizasyona 'developer' rolü ile üye yapıyoruz
    await this.drizzle.db.insert(orgMembers).values({
      orgId: payload.orgId,
      userId: user.id,
      role: 'developer',
    });

    return { message: 'Invite accepted', email: user.email };
  }
}
