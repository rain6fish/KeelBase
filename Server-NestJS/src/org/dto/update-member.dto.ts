// SPDX-License-Identifier: Apache-2.0

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsIn, Min } from 'class-validator';
import { OrgMemberRole } from '../org-member-role.enum';

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: OrgMemberRole })
  @IsOptional()
  @IsIn(Object.values(OrgMemberRole))
  role?: OrgMemberRole;

  @ApiPropertyOptional({ description: '归属部门 id；传 null 表示移出部门' })
  @IsOptional()
  @IsInt()
  @Min(1)
  deptId?: number | null;
}
