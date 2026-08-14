import { IsObject, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartFlowDto {
  @ApiPropertyOptional({ description: '流程上下文数据（供节点表达式/提示词使用）', example: { days: 5, reason: '家事' } })
  @IsObject()
  @IsOptional()
  data?: Record<string, any>;
}
