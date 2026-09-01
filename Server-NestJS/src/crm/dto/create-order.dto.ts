// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ORDER_STATUSES } from '../crm-order.entity';

export class CreateOrderDto {
  @ApiProperty({ description: '订单金额' })
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  amount!: number;

  @ApiPropertyOptional({ description: '状态', enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: '下单日期（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @ApiPropertyOptional({ description: '到期日期（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
