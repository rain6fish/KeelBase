// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Body, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditStatsService } from './audit-stats.service';
import { AuditQueryService } from './audit-query.service';
import { AuditEvidenceService } from './audit-evidence.service';
import { CoverageService } from './coverage.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { CheckPolicies } from '../../common/casl/check-policies.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Every read here is gated on `can('read', 'AuditLog')` rather than the blanket `can('manage','all')`
 * the rest of the console uses. The reason is AW-2: an audit reader has to reach this surface **without
 * being an admin** — handing them admin would also make them the operator they are supposed to review.
 * `manage all` implies `read` on any subject, so admins are unaffected; a plain user still fails.
 *
 * ⚠ Scope: this controller judges `read AuditLog`. The auditor's other reads are widened separately,
 * one surface at a time — governance policy, tool inventory and the approval queue now judge their own
 * `read` subjects in `AiController`, and operation audit still requires `manage all`. Writes,
 * approvals and executions are never part of the widening.
 *
 * 这里每个读端点判的都是 `can('read', 'AuditLog')`，而不是控制台其余部分用的那条 `can('manage','all')`。
 * 理由是 `AW-2`：审计读者必须**不必是管理员**就能到这一面 —— 给他 `admin` 就等于让他同时是他本该复核
 * 的那个操作者。`manage all` 蕴含任意主体上的 `read`，故**管理员不受影响**；普通用户照旧过不去。
 *
 * ⚠ **范围**：本控制器判 `read AuditLog`。审计读者的其余读面按**一面一面**的方式另案放宽 —— 治理策略、
 * 工具清单、审批队列现已在 `AiController` 各自判 `read` 主体，操作审计仍要求 `manage all`。写、审批、
 * 执行永远不在这轮放宽之内。
 */
@ApiTags('审计')
@ApiBearerAuth()
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    // 聚合统计已拆到独立服务（健康清单 §3 阶段 3）：写入/链 与 只读聚合 不再挤在同一个类里
    private readonly auditStats: AuditStatsService,
    // 查询域同理（同阶段 3 第二刀）：过滤与行映射独立于写入
    private readonly auditQuery: AuditQueryService,
    // 证据/报表域（阶段 3 第三刀）：报表、证据包、解释、身份链与链校验——读侧举证能力
    private readonly auditEvidence: AuditEvidenceService,
    // AW-3 覆盖声明：把「这份口径读了什么、看不了什么」从登记表算出来
    private readonly coverage: CoverageService,
  ) {}

  @Get('logs')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'AI 审计日志（管理员）' })
  @ApiQuery({ name: 'userId', required: false, description: '按用户过滤' })
  @ApiQuery({ name: 'agentId', required: false, description: '按 Agent 过滤（Agent Registry → 审计联动）' })
  @ApiQuery({ name: 'orgId', required: false, description: '按组织过滤（ORG-5 组织维度审计）' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  @ApiQuery({ name: 'isError', required: false, description: '按是否错误过滤（E-2 异常视图）' })
  @ApiQuery({ name: 'denied', required: false, description: '仅越权/阻断事件（A-8：isError + authorization 非空）' })
  getLogs(@Query() query: AuditQueryDto) {
    const base = {
      limit: query.limit,
      offset: query.offset,
      since: query.since ? new Date(query.since) : undefined,
    };
    if (query.userId) {
      return this.auditQuery.getUserLogs(query.userId, base);
    }
    return this.auditQuery.getLogs({
      ...base,
      orgId: query.orgId,
      agentId: query.agentId,
      isError: query.isError,
      denied: query.denied,
    });
  }

  /**
   * AW-3 coverage statement: what this window was read from, and what reading it cannot show. Every
   * gap comes from `coverage-gaps.ts`, and the verdict is computed from the fact set the service
   * assembles — so this endpoint has no opinion of its own to go stale.
   *
   * Defaults to the last 30 days when no window is given. Same gate as the rest of this controller.
   *
   * `AW-3` 覆盖声明：这个时间窗是从什么读来的，以及**这么读看不了什么**。每一条缺口都来自
   * `coverage-gaps.ts`，结论由服务组装出的那组事实算出 —— 故这个端点自己没有会陈旧的判断。
   *
   * 不给时间窗时默认最近 30 天。判据同本控制器其余端点。
   */
  @Get('coverage')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'AW-3 覆盖声明：口径 + 已知缺口（管理员 / 审计读者）' })
  getCoverage(@Query() query: AuditQueryDto) {
    const until = query.until ? new Date(query.until) : new Date();
    const since = query.since
      ? new Date(query.since)
      : new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.coverage.forScope({ since, until, userId: query.userId });
  }

  @Get('logs/:id/interpretation')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({
    summary:
      '§internal.16 A-4 + P0-20 单事件解释面：一行审计 → 业务摘要 + 证据统计 + 它引起的副作用 + ' +
      '业务那一腿（操作审计）+ 谁批准 + 一个状态（失败/待确认/补偿中/补偿成功/结果未知/…）（管理员）',
  })
  interpretation(@Param('id', ParseIntPipe) id: number) {
    return this.auditEvidence.getInterpretation(id);
  }

  @Get('logs/:id/chain')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: '§internal.16 A-5 跨系统身份链：Human→Agent→Tool→Action + 授权依据（管理员）' })
  chain(@Param('id', ParseIntPipe) id: number) {
    return this.auditEvidence.getChain(id);
  }

  @Get('verify')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'HS-11 审计哈希链完整性校验（管理员）' })
  verify() {
    return this.auditEvidence.verifyChain();
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: '全局 AI 用量统计（管理员）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  getStats(@Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.auditStats.getAllStats(sinceDate);
  }

  @Get('cost')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'AI 成本看板：按用户×模型×意图聚合 tokens（管理员）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  getCost(@Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.auditStats.getCostBreakdown(sinceDate);
  }

  @Get('action-report')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'AI Action Report：合规证据包（执行/批准/拒绝/阻断 + 副作用 + 哈希链，管理员）' })
  @ApiQuery({ name: 'userId', required: false, description: '按用户过滤（数字 id）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  @ApiQuery({ name: 'limit', required: false, description: '明细样本数（默认 10，最大 50）' })
  getActionReport(
    @Query('userId') userId?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditEvidence.getActionReport({
      userId: userId ? String(Number(userId)) : undefined,
      since: since ? new Date(since) : undefined,
      limit: limit ? Number(limit) : 10,
    });
  }

  @Get('action-report/export')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'D4 审计证据包导出：ActionReport + 哈希链校验 + 时间戳 + 签名（可提交审计机构）' })
  @ApiQuery({ name: 'userId', required: false, description: '按用户过滤（数字 id）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  @ApiQuery({ name: 'limit', required: false, description: '明细样本数（默认 10，最大 50）' })
  getActionReportExport(
    @Query('userId') userId?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditEvidence.getActionReportExport({
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
    return this.auditQuery.submitFeedback(
      String(user.sub),
      dto.conversationId,
      dto.feedback,
      dto.note,
    );
  }
}
