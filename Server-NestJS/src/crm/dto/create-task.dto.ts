import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { CRM_TASK_STATUSES } from '../crm-task.entity';

export class CreateTaskDto {
  @ApiPropertyOptional({ description: '关联客户 id' })
  @IsOptional()
  @IsNumber()
  customerId?: number;

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

  @ApiPropertyOptional({ description: '状态', enum: CRM_TASK_STATUSES })
  @IsOptional()
  @IsIn(CRM_TASK_STATUSES)
  status?: string;
}
