import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MembersService } from './members.service.js';
import { InviteService } from './invite.service.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { InviteMemberDto } from './dto/invite-member.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OrgRoleGuard } from '../auth/guards/org-role.guard.js';
import { RequireOrgRole } from '../auth/decorators/require-org-role.decorator.js';

/**
 * 🎮 MEMBERS CONTROLLER (Organizasyon Üyeleri HTTP Uç Noktaları)
 *
 * Rota Kalıbı: `/orgs/:slug/members`
 *
 * 🛡️ Güvenlik Katmanları (2 Aşamalı Koruma):
 * 1. `JwtAuthGuard`: Kullanıcının giriş yapıp yapmadığını (çerez veya Bearer token) kontrol eder.
 * 2. `OrgRoleGuard`: Kullanıcının URL'deki `:slug` organizasyonunun üyesi olup olmadığını ve rolünü denetler.
 */
@Controller('orgs/:slug/members')
@UseGuards(JwtAuthGuard, OrgRoleGuard)
export class MembersController {
  constructor(
    private membersService: MembersService,
    private inviteService: InviteService,
  ) {}

  /**
   * 👥 GET /orgs/:slug/members
   * Organizasyondaki tüm aktif üyeleri listeler.
   * Bu rotaya organizasyondaki tüm üyeler (admin ve developer) erişebilir.
   */
  @Get()
  getMembers(@Param('slug') slug: string) {
    return this.membersService.getMembers(slug);
  }

  /**
   * 👑 PATCH /orgs/:slug/members/:memberId/role
   * Bir üyenin rolünü günceller (örn: developer -> admin veya tersi).
   *
   * 🔒 RBAC Yetkisi:
   * `@RequireOrgRole('admin')` -> Yalnızca organizasyon yöneticileri (admin) rol değiştirebilir!
   */
  @Patch(':memberId/role')
  @RequireOrgRole('admin')
  updateRole(
    @Param('slug') slug: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.membersService.updateRole(slug, memberId, dto);
  }

  /**
   * ❌ DELETE /orgs/:slug/members/:memberId
   * Bir üyeyi organizasyondan çıkarır (soft-delete).
   *
   * 🔒 RBAC Yetkisi:
   * `@RequireOrgRole('admin')` -> Yalnızca admin yetkisine sahip kullanıcılar üye çıkarabilir.
   */
  @Delete(':memberId')
  @RequireOrgRole('admin')
  removeMember(
    @Param('slug') slug: string,
    @Param('memberId') memberId: string,
  ) {
    return this.membersService.removeMember(slug, memberId);
  }

  /**
   * ✉️ POST /orgs/:slug/members/invite
   * Belirtilen e-posta adresine organizasyona katılım davetiyesi gönderir.
   *
   * 🔒 RBAC Yetkisi:
   * `@RequireOrgRole('admin')` -> Yalnızca adminler yeni üye davet edebilir.
   */
  @Post('invite')
  @RequireOrgRole('admin')
  sendInvite(@Param('slug') slug: string, @Body() dto: InviteMemberDto) {
    return this.inviteService.sendInvite(slug, dto.email);
  }
}
