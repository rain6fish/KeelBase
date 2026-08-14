import { IsString, IsOptional, IsInt, IsBoolean, IsDateString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({ description: 'name' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
