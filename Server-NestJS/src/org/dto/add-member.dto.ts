import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsIn, Min } from 'class-validator';
import { OrgMemberRole } from '../org-member-role.enum';

export class AddMemberDto {
  @ApiProperty({ description: '要加入的用户 id' })
  @IsInt()
  @Min(1)
  userId!: number;

  @ApiPropertyOptional({ enum: OrgMemberRole, default: OrgMemberRole.MEMBER })
  @IsOptional()
  @IsIn(Object.values(OrgMemberRole))
  role?: OrgMemberRole;

  @ApiPropertyOptional({ description: '归属部门 id' })
  @IsOptional()
  @IsInt()
  @Min(1)
  deptId?: number;
}
