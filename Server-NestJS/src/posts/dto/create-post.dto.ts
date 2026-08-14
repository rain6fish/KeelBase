import { IsString, IsOptional, IsInt, IsBoolean, IsDateString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty({ description: 'title' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'content' })
  @IsString()
  @IsOptional()
  content?: string;
}
