import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../db/drizzle.service.js';
import { organizations, orgMembers } from '../../db/schema/index.js';
import { ORG_ROLE_KEY } from '../decorators/require-org-role.decorator.js';
import type { OrgRole } from '@sbase/types';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

/**
 * Guard that verifies the user belongs to the target organization
 * and possesses the required role (e.g., 'admin' or 'developer').
 */
@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(
    private drizzle: DrizzleService,
    private reflector: Reflector,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Read required role metadata attached via @RequireOrgRole() decorator
    const requiredRole = this.reflector.get<OrgRole>(ORG_ROLE_KEY, context.getHandler(),);

    // 2. Extract authenticated user from JWT and org slug from route params (/orgs/:slug/...)
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const orgSlug = request.params['slug'] as string;

    // 3. Check if user is an active member of this organization
    const [member] = await this.drizzle.db
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(
        and(
          eq(organizations.slug, orgSlug),
          eq(orgMembers.userId, user.sub),
          isNull(orgMembers.removedAt),
        ),
      )
      .limit(1);

    // 4. Return 404 if org does not exist or user is not a member (hides existence from unauthorized users)
    if (!member) throw new NotFoundException('Organization not found');

    // 5. Enforce role requirements (e.g. reject developer from admin-only routes)
    if (requiredRole && member.role !== requiredRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // 6. Attach verified role to request for downstream handlers and allow access
    request.memberRole = member.role;
    return true;
  }
}
