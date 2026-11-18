import { IsEnum } from 'class-validator';
import { ORG_ROLES } from '@sbase/constants';
import type { OrgRole } from '@sbase/types';

export class UpdateRoleDto {
  @IsEnum(ORG_ROLES)
  role!: OrgRole;
}
