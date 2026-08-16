import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { CheckPolicies } from '../../common/casl/check-policies.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

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

  @Get('verify')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'HS-11 审计哈希链完整性校验（管理员）' })
  verify() {
    return this.auditService.verifyChain();
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '全局 AI 用量统计（管理员）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  getStats(@Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.auditService.getAllStats(sinceDate);
  }

  @Get('cost')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI 成本看板：按用户×模型×意图聚合 tokens（管理员）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  getCost(@Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.auditService.getCostBreakdown(sinceDate);
  }

  @Post('feedback')
  @ApiOperation({ summary: 'AI-18 对话反馈：对某次对话点赞/点踩' })
  async submitFeedback(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.auditService.submitFeedback(
      String(user.sub),
      dto.conversationId,
      dto.feedback,
      dto.note,
    );
  }
}
