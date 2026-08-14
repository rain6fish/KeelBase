import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class SubmitRequestDto {
  @ApiProperty({ description: '申请标题' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: '申请说明' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;
}
