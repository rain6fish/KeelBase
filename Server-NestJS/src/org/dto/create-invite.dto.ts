// SPDX-License-Identifier: Apache-2.0

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn, IsInt, Min, IsDateString } from 'class-validator';
import { OrgMemberRole } from '../org-member-role.enum';

export class CreateInviteDto {
  @ApiPropertyOptional({ enum: OrgMemberRole, default: OrgMemberRole.MEMBER })
  @IsOptional()
  @IsIn(Object.values(OrgMemberRole))
  role?: OrgMemberRole;

  @ApiPropertyOptional({ description: '加入后归属部门 id' })
  @IsOptional()
  @IsInt()
  @Min(1)
  deptId?: number;

  @ApiPropertyOptional({ description: '过期时间（ISO 8601），缺省永不过期' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
