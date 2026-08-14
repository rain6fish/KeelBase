import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  MinLength,
  MaxLength,
  IsDateString,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventColorRole } from '../event-color-role.enum';

export class CreateEventDto {
  @ApiProperty({ description: '事件标题', example: '团队周会' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: '事件描述' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '开始时间 (ISO 8601)', example: '2026-07-24T09:00:00Z' })
  @IsDateString()
  startTime!: string;

  @ApiProperty({ description: '结束时间 (ISO 8601)', example: '2026-07-24T10:00:00Z' })
  @IsDateString()
  endTime!: string;

  @ApiPropertyOptional({ description: '地点' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ description: '颜色角色', enum: EventColorRole, default: 0 })
  @IsEnum(EventColorRole)
  @IsOptional()
  colorRole?: EventColorRole;

  @ApiPropertyOptional({ description: '是否取消', default: false })
  @IsBoolean()
  @IsOptional()
  isCancelled?: boolean;

  @ApiPropertyOptional({ description: '是否重复事件', default: false })
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @ApiPropertyOptional({ description: '提前 N 分钟提醒（null 不提醒）', example: 30 })
  @IsInt()
  @Min(0)
  @Max(10080)
  @IsOptional()
  reminderMinutes?: number;
}
