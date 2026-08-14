import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../common/entities/user.entity';

export class UpdateUserRoleDto {
  @ApiProperty({ description: '用户角色', enum: UserRole, example: UserRole.ADMIN })
  @IsEnum(UserRole)
  role!: UserRole;
}
