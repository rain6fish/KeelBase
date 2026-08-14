import { IsString, IsOptional, IsInt, IsBoolean, IsDateString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookDto {
  @ApiProperty({ description: 'title' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'author' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  author!: string;
}
