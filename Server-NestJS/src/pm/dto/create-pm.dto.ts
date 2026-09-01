// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { PROJECT_STATUSES } from '../pm-project.entity';
import { MILESTONE_STATUSES } from '../pm-milestone.entity';
import { PM_TASK_STATUSES } from '../pm-task.entity';

export class CreateProjectDto {
  @ApiProperty({ description: '项目名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '状态', enum: PROJECT_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: '风险等级' })
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  riskLevel?: string;

  @ApiPropertyOptional({ description: '开始日期（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '截止日期（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateMilestoneDto {
  @ApiProperty({ description: '里程碑标题' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: '截止日期（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: '状态', enum: MILESTONE_STATUSES })
  @IsOptional()
  @IsIn(MILESTONE_STATUSES)
  status?: string;
}

export class CreateTaskDto {
  @ApiProperty({ description: '项目 id' })
  @IsNumber()
  projectId!: number;

  @ApiProperty({ description: '任务标题' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '截止日期（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: '状态', enum: PM_TASK_STATUSES })
  @IsOptional()
  @IsIn(PM_TASK_STATUSES)
  status?: string;
}

export class CreateRiskDto {
  @ApiPropertyOptional({ description: '风险等级' })
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  level?: string;

  @ApiProperty({ description: '风险原因' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: '发现时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  detectedAt?: string;
}
