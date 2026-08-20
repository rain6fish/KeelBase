import { IsString, IsOptional, IsInt, IsBoolean, IsDateString, MinLength, MaxLength, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookDto {
  @ApiProperty({ description: 'title' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'author' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  author!: string;

  @ApiProperty({ description: 'status', enum: ['unread', 'reading', 'finished'] })
  @IsString()
  @IsIn(['unread', 'reading', 'finished'])
  status!: string;

  @ApiPropertyOptional({ description: 'rating' })
  @IsInt()
  @IsOptional()
  rating?: number;
}
