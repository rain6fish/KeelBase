import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { CheckPolicies } from '../../common/casl/check-policies.decorator';

@ApiTags('审计')
@ApiBearerAuth()
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI 审计日志（管理员）' })
  @ApiQuery({ name: 'userId', required: false, description: '按用户过滤' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  getLogs(@Query() query: AuditQueryDto) {
    const options = { limit: query.limit, offset: query.offset, since: query.since ? new Date(query.since) : undefined };
    if (query.userId) {
      return this.auditService.getUserLogs(query.userId, options);
    }
    return this.auditService.getLogs(options);
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '全局 AI 用量统计（管理员）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  getStats(@Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.auditService.getAllStats(sinceDate);
  }
}
