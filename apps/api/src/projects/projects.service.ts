import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import slugify from 'slugify';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DrizzleService } from '../db/drizzle.service.js';
import { projects, organizations, orgMembers } from '../db/schema/index.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { PROJECT_KEY_ROLES } from '@sbase/constants';

/**
 * 🚀 PROJECTS SERVICE (Layihələrin İdarə Edilməsi və Provisioning Servisi)
 *
 * Bu servis Supabase arxitekturasının ən mühüm nüvəsidir:
 * 1. Hər bir təşkilat üçün yeni layihələr (projects) yaradır.
 * 2. Multi-tenancy (Çoxicarəçilik) üçün PostgreSQL-də hər layihəyə fərdi `SCHEMA` açır (`CREATE SCHEMA`).
 * 3. Hər layihə üçün `anonKey` (müştəri/frontend) və `serviceRoleKey` (admin backend) API açarlarını generasiya edir.
 * 4. Layihələri çəkərkən ciddi təhlükəsizlik (RBAC / Membership) yoxlaması aparır.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private drizzle: DrizzleService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) { }

  // ===========================================================================
  // 🛠️ KÖMƏKÇİ (UTIL) METODLAR
  // ===========================================================================

  /**
   * 🏷️ generateProjectSlug:
   * Layihənin adından URL üçün uyğun unikal slug yaradır.
   * Məsələn: "E-Commerce App" ➔ "e-commerce-app-7f3b12"
   *
   * Sonda əlavə olunan 3 baytlıq (6 simvollu hex) təsadüfi kod iki eyni adlı layihənin
   * URL toqquşmasının (collision) qarşısını alır.
   */
  private generateProjectSlug(name: string): string {
    const base = slugify(name, { lower: true, strict: true });
    const suffix = randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
  }

  /**
   * 🗄️ generateDbSchema:
   * PostgreSQL-də hər bir layihənin cədvəllərini bir-birindən tam təcrid etmək üçün
   * unikal schema adı generasiya edir (Məsələn: "proj_9a8b1c2d").
   */
  private generateDbSchema(): string {
    return `proj_${randomBytes(4).toString('hex')}`;
  }

  /**
   * 🔑 signProjectKey:
   * Supabase-in məşhur API açarlarını (anon_key və service_role_key) JWT kimi imzalayır.
   *
   * @param projectId - Açarı verilən layihənin unikal ID-si
   * @param role - Açara verilən hüquq:
   *               - 'anon': Brauzerdə/mobil tətbiqdə işlədilən ictimai açar (RLS qaydalarına tabedir)
   *               - 'service_role': RLS qaydalarını aşan (bypass edən) tam səlahiyyətli backend açarı
   *
   * Qeyd: Bu açarların müddəti 100 il ('100y') qoyulur, çünki onlar istifadəçi tokeni deyil;
   * layihə açarlarıdır və yalnız təhlükəsizlik problemi olduqda əllə yenilənir (rotate edilir).
   */
  private signProjectKey(projectId: string, role: string): string {
    return this.jwtService.sign(
      { projectId, role },
      {
        secret: this.configService.get<string>('PROJECT_JWT_SECRET'),
        // Layihə açarlarının vaxtı bitmir — oğurlanarsa əllə dəyişdirilir
        expiresIn: '100y',
      },
    );
  }

  /**
   * 🏗️ provisionSchema (Verilənlər Bazasında Ayrılmış Məkan Açmaq):
   * PostgreSQL-də birbaşa SQL icra edərək fiziki schema yaradır:
   * `CREATE SCHEMA IF NOT EXISTS "proj_xxx"`
   *
   * Beləliklə, Layihə A-nın açdığı cədvəllər (məsələn, "users", "todos") Layihə B-nin cədvəllərinə qətiyyən qarışmır.
   */
  private async provisionSchema(dbSchema: string): Promise<void> {
    await this.drizzle.db.execute(`CREATE SCHEMA IF NOT EXISTS "${dbSchema}"`);
  }

  // ===========================================================================
  // 📋 SORĞULAR (QUERIES)
  // ===========================================================================

  /**
   * 📂 getProjectsForOrg:
   * Verilmiş təşkilatın (`orgSlug`) layihələrini siyahı şəklində qaytarır.
   *
   * 🛡️ TƏHLÜKƏSİZLİK MƏNTİQİ:
   * 1. `innerJoin(organizations)`: projects cədvəlində orgSlug yoxdur (yalnız orgId var).
   *    Bu join sayəsində URL-dən gələn `orgSlug`-a uyğun layihələri tapırıq.
   * 2. `innerJoin(orgMembers)`: ƏN VACİB TƏHLÜKƏSİZLİK QALXANI!
   *    Yoxlayır ki, sorğu atan istifadəçi (`userId`) bu təşkilatın həqiqətən aktiv üzvüdürmü?
   *    Əgər kənar biri (və ya xaker) başqa şirkətin slug-ını URL-ə yazsa, `innerJoin` kəsişmə
   *    olmadığı üçün heç bir nəticə vermir və boş massiv `[]` qaytarır!
   */
  async getProjectsForOrg(orgSlug: string, userId: string) {
    return this.drizzle.db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        projectUrl: projects.projectUrl,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .innerJoin(organizations, eq(projects.orgId, organizations.id))
      .innerJoin(
        orgMembers,
        and(
          eq(orgMembers.orgId, organizations.id),
          eq(orgMembers.userId, userId),
          isNull(orgMembers.removedAt),
        ),
      )
      .where(eq(organizations.slug, orgSlug));
  }

  /**
   * 🔍 getProjectBySlug:
   * Təşkilat və layihə slug-ına görə tək bir layihənin bütün detallarını qaytarır.
   * Eyni şəkildə yalnız həmin təşkilatın aktiv üzvü olan istifadəçilərə icazə verilir.
   * Layihə tapılmazsa və ya istifadəçinin baxmağa icazəsi yoxdursa ➔ 404 NotFoundException atır.
   */
  async getProjectBySlug(orgSlug: string, projectSlug: string, userId: string) {
    const [row] = await this.drizzle.db
      .select()
      .from(projects)
      .innerJoin(organizations, eq(projects.orgId, organizations.id))
      .innerJoin(
        orgMembers,
        and(
          eq(orgMembers.orgId, organizations.id),
          eq(orgMembers.userId, userId),
          isNull(orgMembers.removedAt),
        ),
      )
      .where(
        and(eq(organizations.slug, orgSlug), eq(projects.slug, projectSlug)),
      )
      .limit(1);

    if (!row) throw new NotFoundException('Project not found');
    return row;
  }

  /**
   * ➕ createProject (Tam Layihə Yaradılma Prosesi):
   * Təşkilat daxilində yeni bir Supabase layihəsi inşa edir.
   *
   * Addım-addım necə işləyir?
   * 1. `organizations` cədvəlindən təşkilat tapılır (yoxdursa 404 atılır).
   * 2. Unikal slug (`projectSlug`), təcrid olunmuş schema adı (`dbSchema`),
   *    layihənin API URL-i və Auth üçün şifrələmə açarı (`authJwtSecret`) hazırlanır.
   * 3. PostgreSQL-də fiziki olaraq həmin schema yaradılır (`provisionSchema`).
   * 4. Layihə verilənlər bazasına qeyd olunur (ilkin olaraq açarlar boş göndərilir,
   *    çünki açarları imzalamaq üçün bazanın verdiyi `project.id` lazımdır).
   * 5. Alınan `project.id` ilə `anonKey` və `serviceRoleKey` JWT-ləri imzalanır.
   * 6. `update` sorğusu ilə bu açarlar layihəyə yazılır və tam hazır obyekt geri qaytarılır.
   */
  async createProject(orgSlug: string, dto: CreateProjectDto) {
    // 1. Təşkilatın bazada mövcudluğunu yoxlayırıq
    const [org] = await this.drizzle.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);

    if (!org) throw new NotFoundException('Organization not found');

    // 2. Layihə parametrlərini generasiya edirik
    const projectSlug = this.generateProjectSlug(dto.name);
    const dbSchema = this.generateDbSchema();
    const projectUrl = `${this.configService.get<string>('API_URL')}/projects/${projectSlug}`;
    const authJwtSecret = randomBytes(32).toString('hex');

    // 3. PostgreSQL-də layihə üçün fiziki schema açırıq
    await this.provisionSchema(dbSchema);

    // 4. Layihəni bazaya daxil edib yaranan project.id-ni əldə edirik
    const [project] = await this.drizzle.db
      .insert(projects)
      .values({
        orgId: org.id,
        name: dto.name,
        slug: projectSlug,
        dbSchema,
        projectUrl,
        anonKey: '',
        serviceRoleKey: '',
        authJwtSecret,
      })
      .returning();

    // 5. Layihənin ID-si ilə 'anon' və 'service_role' açarlarını imzalayırıq
    const anonKey = this.signProjectKey(project.id, PROJECT_KEY_ROLES.ANON);
    const serviceRoleKey = this.signProjectKey(
      project.id,
      PROJECT_KEY_ROLES.SERVICE_ROLE,
    );

    // 6. İmzalanmış açarları layihə sətrinə əlavə edib yenilənmiş layihəni qaytarırıq
    const [updated] = await this.drizzle.db
      .update(projects)
      .set({ anonKey, serviceRoleKey })
      .where(eq(projects.id, project.id))
      .returning();

    return updated;
  }
}
