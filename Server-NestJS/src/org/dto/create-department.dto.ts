import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, MaxLength, Min } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ maxLength: 100, example: '研发部' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: '上级部门 id，缺省为组织根' })
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number;

  @ApiPropertyOptional({ description: '排序权重，越小越靠前' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
