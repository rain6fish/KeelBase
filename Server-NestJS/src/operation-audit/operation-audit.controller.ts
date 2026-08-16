import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OperationAuditService } from './operation-audit.service';
import { CheckPolicies } from '../common/casl/check-policies.decorator';

@ApiTags('操作审计')
@ApiBearerAuth()
@Controller({ path: 'audit/operations', version: '1' })
export class OperationAuditController {
  constructor(private readonly auditService: OperationAuditService) {}

  @Get('logs')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '操作审计日志（admin）' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'userId', required: false, description: '按用户过滤' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  async logs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('userId') userId?: string,
    @Query('since') since?: string,
  ) {
    return this.auditService.getLogs(page, limit, userId ? Number(userId) : undefined, since ? new Date(since) : undefined);
  }

  @Get('verify')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'HS-11 操作审计哈希链完整性校验（admin）' })
  async verify() {
    return this.auditService.verifyChain();
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '操作审计统计（按 action 分组，admin）' })
  async stats() {
    return this.auditService.getStats();
  }
}
