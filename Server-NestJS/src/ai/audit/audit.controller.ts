import { Controller, Get, Post, Body, Query, Param, ParseIntPipe } from '@nestjs/common';
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
  @ApiQuery({ name: 'agentId', required: false, description: '按 Agent 过滤（Agent Registry → 审计联动）' })
  @ApiQuery({ name: 'orgId', required: false, description: '按组织过滤（ORG-5 组织维度审计）' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  @ApiQuery({ name: 'isError', required: false, description: '按是否错误过滤（E-2 异常视图）' })
  getLogs(@Query() query: AuditQueryDto) {
    const base = {
      limit: query.limit,
      offset: query.offset,
      since: query.since ? new Date(query.since) : undefined,
    };
    if (query.userId) {
      return this.auditService.getUserLogs(query.userId, base);
    }
    return this.auditService.getLogs({
      ...base,
      orgId: query.orgId,
      agentId: query.agentId,
      isError: query.isError,
    });
  }

  @Get('logs/:id/interpretation')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '§22.16 A-4 审计解释器：单行审计 → 业务摘要 + 证据统计（管理员）' })
  interpretation(@Param('id', ParseIntPipe) id: number) {
    return this.auditService.getInterpretation(id);
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

  @Get('action-report')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'AI Action Report：合规证据包（执行/批准/拒绝/阻断 + 副作用 + 哈希链，管理员）' })
  @ApiQuery({ name: 'userId', required: false, description: '按用户过滤（数字 id）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  @ApiQuery({ name: 'limit', required: false, description: '明细样本数（默认 10，最大 50）' })
  getActionReport(
    @Query('userId') userId?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.getActionReport({
      userId: userId ? String(Number(userId)) : undefined,
      since: since ? new Date(since) : undefined,
      limit: limit ? Number(limit) : 10,
    });
  }

  @Get('action-report/export')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'D4 审计证据包导出：ActionReport + 哈希链校验 + 时间戳 + 签名（可提交审计机构）' })
  @ApiQuery({ name: 'userId', required: false, description: '按用户过滤（数字 id）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  @ApiQuery({ name: 'limit', required: false, description: '明细样本数（默认 10，最大 50）' })
  getActionReportExport(
    @Query('userId') userId?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.getActionReportExport({
      userId: userId ? String(Number(userId)) : undefined,
      since: since ? new Date(since) : undefined,
      limit: limit ? Number(limit) : 10,
    });
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
