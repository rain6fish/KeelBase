// SPDX-License-Identifier: Apache-2.0

import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  ParseIntPipe,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService } from '../../governance-shared/services/audit.service';
import { AuditStatsService } from '../../governance-shared/services/audit-stats.service';
import { AuditQueryService } from '../../governance-shared/services/audit-query.service';
import { AuditEvidenceService } from '../../governance-shared/services/audit-evidence.service';
import { CoverageService } from '../../governance-shared/services/coverage.service';
import { AuditReviewService } from '../../governance-shared/services/audit-review.service';
import { AuditQueryDto } from '../dto/audit-query.dto';
import { AuditAnswersQueryDto } from '../dto/audit-answers-query.dto';
import { SubmitFeedbackDto } from '../dto/submit-feedback.dto';
import { AuditAnswersService } from '../services/audit-answers.service';
import { AuditObjectIndexService } from '../services/audit-object-index.service';
import { objectTypeOptions } from '../services/audit-export-vocabulary';
import { CreateAuditReviewDto } from '../dto/create-audit-review.dto';
import { CheckPolicies } from '../../common/casl/check-policies.decorator';
import { ResponseOrdering } from '../../common/decorators/response-ordering.decorator';
import {
  AUDIT_LOG_LIST_ORDERING,
  CHAIN_WALK_ORDERING,
  REPORT_ROWS_ORDERING,
} from '../services/ordering';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  projectAuditEntityForCaller,
  projectAuditRowsForCaller,
} from '../services/audit-reader-projection';

/**
 * Every read here is gated on `can('read', 'AuditLog')` rather than the blanket `can('manage','all')`
 * the rest of the console uses. The reason is AW-2: an audit reader has to reach this surface **without
 * being an admin** — handing them admin would also make them the operator they are supposed to review.
 * `manage all` implies `read` on any subject, so admins are unaffected; a plain user still fails.
 *
 * ⚠ Scope: this controller judges `read AuditLog`. The auditor's other reads are widened separately,
 * one surface at a time — governance policy, tool inventory and the approval queue judge their own
 * `read` subjects in `AiController`, and operation audit judges `read OperationAudit` in its own
 * controller. Approvals and executions are never part of the widening. The one write here is
 * `POST /audit/reviews` (AW-12): signing a review receipt **is** the act of reading asserted, so the
 * reader's own grant is what authorises it — an operator write would have to be someone else's.
 *
 * 这里每个读端点判的都是 `can('read', 'AuditLog')`，而不是控制台其余部分用的那条 `can('manage','all')`。
 * 理由是 `AW-2`：审计读者必须**不必是管理员**就能到这一面 —— 给他 `admin` 就等于让他同时是他本该复核
 * 的那个操作者。`manage all` 蕴含任意主体上的 `read`，故**管理员不受影响**；普通用户照旧过不去。
 *
 * ⚠ **范围**：本控制器判 `read AuditLog`。审计读者的其余读面按**一面一面**的方式另案放宽 —— 治理策略、
 * 工具清单、审批队列在 `AiController` 各自判 `read` 主体，操作审计在自己的控制器里判 `read OperationAudit`。
 * 审批与执行永远不在这轮放宽之内。这里唯一的写是 `POST /audit/reviews`（AW-12）：签一张复核回执**就是**
 * 「我读过」这个断言本身，故授权它的是读者自己那条授予 —— 交给操作者去写，复核就变成了别人的事。
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
    // AW-12 记录级复核：回执写入（链上）与复核状态读取
    private readonly auditReview: AuditReviewService,
    // U1: business-object → audit rows, and the six-answer export built from the same rows.
    // U1：业务对象 → 审计行，以及由同一批行拼出的六问导出。
    private readonly objectIndex: AuditObjectIndexService,
    private readonly answers: AuditAnswersService,
  ) {}

  @Get('logs')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ResponseOrdering(AUDIT_LOG_LIST_ORDERING)
  @ApiOperation({ summary: 'AI 审计日志（管理员 / 审计读者）' })
  @ApiQuery({ name: 'userId', required: false, description: '按用户过滤' })
  @ApiQuery({ name: 'agentId', required: false, description: '按 Agent 过滤（Agent Registry → 审计联动）' })
  @ApiQuery({ name: 'orgId', required: false, description: '按组织过滤（ORG-5 组织维度审计）' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  @ApiQuery({ name: 'isError', required: false, description: '按是否错误过滤（E-2 异常视图）' })
  @ApiQuery({ name: 'denied', required: false, description: '仅越权/阻断事件（A-8：isError + authorization 非空）' })
  @ApiQuery({ name: 'until', required: false, description: '结束时间（ISO 8601）—— 与 since 一起构成闭合期间' })
  @ApiQuery({ name: 'objectType', required: false, description: '业务对象类型（与 objectId 成对）' })
  @ApiQuery({ name: 'objectId', required: false, description: '业务对象 id（与 objectType 成对）' })
  async getLogs(@Query() query: AuditQueryDto, @CurrentUser() user: JwtPayload) {
    // Period is the requested window, closed on both ends. Org is the reader's account scope and is
    // applied inside the service — the request's `orgId` only narrows it.
    // 期间就是请求的窗口，两端闭合。组织是读者的账号范围，在服务里施加 —— 请求的 `orgId` 只能收紧它。
    const ids = await this._objectRowIds(query.objectType, query.objectId);
    const base = {
      limit: query.limit,
      offset: query.offset,
      since: query.since ? new Date(query.since) : undefined,
      until: query.until ? new Date(query.until) : undefined,
      ids,
    };
    const reader = { userId: user.sub, role: user.role };
    const rows = query.userId
      ? await this.auditQuery.getUserLogs(query.userId, base, reader)
      : await this.auditQuery.getLogs(
          {
            ...base,
            orgId: query.orgId,
            agentId: query.agentId,
            isError: query.isError,
            denied: query.denied,
          },
          reader,
        );
    // AW-2: the row an audit reader receives is rebuilt from the whitelist, so a column added later is
    // not visible by default. Admins keep the full row (unchanged behaviour).
    // AW-2：审计读者收到的行由白名单重建，故日后新增的列默认不可见。管理员保留整行（行为不变）。
    return projectAuditRowsForCaller(rows, user.role);
  }

  /**
   * The six answers, as product words, ready to be written as one CSV row each.
   *
   * <p>Six columns and **zero internal names**: the vocabulary module is the only place an internal
   * token becomes text, and it never echoes an unknown one. The scope is the reader's, exactly like
   * the list — an auditor's organisation, or their own rows when they belong to none.
   *
   * 六问，已是产品词，每条记录可直接写成一个 CSV 行。
   *
   * <p>六列、**0 处内部名**：把内部令牌翻成文字的只有词表模块一处，且它绝不回显不认识的令牌。
   * 范围与列表完全相同 —— 审计读者的组织，不属于任何组织时退回本人行。
   */
  @Get('answers')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'U1 六问导出：对象 + 区间 → 六列产品词（管理员 / 审计读者）' })
  @ApiQuery({ name: 'objectType', required: false, description: '业务对象类型（与 objectId 成对）' })
  @ApiQuery({ name: 'objectId', required: false, description: '业务对象 id（与 objectType 成对）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  @ApiQuery({ name: 'until', required: false, description: '结束时间（ISO 8601）' })
  @ApiQuery({ name: 'limit', required: false, description: '最多导出的记录数（默认 500，上限 1000）' })
  async getAnswers(@Query() query: AuditAnswersQueryDto, @CurrentUser() user: JwtPayload) {
    const ids = await this._objectRowIds(query.objectType, query.objectId);
    return this.answers.export(
      {
        objectType: query.objectType,
        objectId: query.objectId,
        since: query.since ? new Date(query.since) : undefined,
        until: query.until ? new Date(query.until) : undefined,
        limit: query.limit,
      },
      ids,
      { userId: user.sub, role: user.role },
    );
  }

  /**
   * The business nouns a reader may search by. Served from the export's own vocabulary so the
   * picker and the CSV cannot name the same object differently.
   *
   * 读者可以按之检索的业务名词。由导出自己的词表提供，使选择器与 CSV 不会把同一个对象叫成两个名字。
   */
  @Get('object-types')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'U1 业务对象类型清单（对象检索用；管理员 / 审计读者）' })
  getObjectTypes() {
    return objectTypeOptions();
  }

  /**
   * Turn `(objectType, objectId)` into audit row ids, or `undefined` when no object filter was
   * given. Half a filter is a **400** rather than "every row": a typo that silently widens the read
   * is the failure mode this guard exists to stop. An index that does not exist in this process is
   * a **503** — never an empty page, which would read as "no match".
   *
   * 把 `(objectType, objectId)` 变成审计行 id；没有给对象过滤时返回 `undefined`。半个过滤条件是
   * **400**，不是「全部行」：一个悄悄把读数放大的输入错误，正是这条护栏要拦住的东西。本进程没有索引
   * 时答 **503** —— 绝不是一个空页，那会被读成「无匹配」。
   */
  private async _objectRowIds(
    objectType?: string,
    objectId?: number,
  ): Promise<number[] | undefined> {
    if (!objectType && objectId == null) return undefined;
    if (!objectType || objectId == null) {
      throw new BadRequestException('objectType and objectId must be given together');
    }
    if (!this.objectIndex.available) {
      throw new ServiceUnavailableException(
        'The business-object index is not available in this deployment; search by period instead.',
      );
    }
    return this.objectIndex.auditRowIdsFor(objectType, objectId);
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
  getCoverage(@Query() query: AuditQueryDto, @CurrentUser() user: JwtPayload) {
    const until = query.until ? new Date(query.until) : new Date();
    const since = query.since
      ? new Date(query.since)
      : new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);
    // AW-2 aggregate half: the counts in the statement are scoped like the rows it describes.
    // AW-2 聚合那一半：声明里的计数与它所描述的行受同一个范围约束。
    return this.coverage.forScope({
      since,
      until,
      userId: query.userId,
      reader: { userId: user.sub, role: user.role },
    });
  }

  /**
   * AW-12 review status: who is assigned to read these records, how often, which chain positions a
   * receipt covers, and which ones nobody has attested to. Computed from the chain — a receipt is an
   * `audit_review` row, so deleting one turns its range back into unreviewed, and forging one fails
   * `GET /audit/verify`.
   *
   * Global like `verify` (a receipt is an attestation about chain positions, not personal data).
   * `AW-12` 复核状态：谁被指派读这些记录、多久一次、哪些链位已被回执覆盖、哪些没人签过。由链算出 ——
   * 回执就是一条 `audit_review` 行，故删一条其区间就变回未复核、伪造一条则 `GET /audit/verify` 不通过。
   * 与 `verify` 一样取全局（回执是对链位的陈述，不是个人数据）。
   */
  @Get('reviews')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'AW-12 记录复核状态：复核人/频度配置 + 已复核与未复核链位（管理员 / 审计读者）' })
  getReviews() {
    return this.auditReview.status();
  }

  /**
   * Sign a review receipt. This is the controller's **only write**: the receipt is an audit row, and
   * writing it is the act being attested. When `AUDIT_REVIEW_OWNER` is configured only that account
   * may sign (the service enforces it); when it is not, any audit reader may — and the coverage
   * statement says the deployment is unassigned.
   *
   * 签一张复核回执。这是本控制器**唯一的写**：回执是一条审计行，写它本身就是被见证的那个动作。
   * 配置了 `AUDIT_REVIEW_OWNER` 时只有该账号能签（服务里强制执行）；未配置时任何审计读者都可签 —— 而
   * 覆盖声明会说明这个部署没有指派复核人。
   */
  @Post('reviews')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'AW-12 签复核回执（写入审计链，管理员 / 审计读者）' })
  createReview(@CurrentUser() user: JwtPayload, @Body() dto: CreateAuditReviewDto) {
    return this.auditReview.record(
      { id: Number(user.sub), username: user.username },
      { fromId: dto.fromId, throughId: dto.throughId },
    );
  }

  @Get('logs/:id/interpretation')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({
    summary:
      '§internal.16 A-4 + P0-20 单事件解释面：一行审计 → 业务摘要 + 证据统计 + 它引起的副作用 + ' +
      '业务那一腿（操作审计）+ 谁批准 + 一个状态（失败/待确认/补偿中/补偿成功/结果未知/…）（管理员 / 审计读者）',
  })
  async interpretation(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    const result = await this.auditEvidence.getInterpretation(id, {
      userId: user.sub,
      role: user.role,
    });
    // The embedded row is a row too: an audit reader gets the whitelisted shape here as well.
    // 内嵌的那一行同样是「行」：审计读者在这里拿到的也是白名单形状。
    return { ...result, row: projectAuditEntityForCaller(result.row, user.role) };
  }

  @Get('logs/:id/chain')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: '§internal.16 A-5 跨系统身份链：Human→Agent→Tool→Action + 授权依据（管理员 / 审计读者）' })
  chain(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.auditEvidence.getChain(id, { userId: user.sub, role: user.role });
  }

  @Get('verify')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ResponseOrdering(CHAIN_WALK_ORDERING)
  @ApiOperation({ summary: 'HS-11 审计哈希链完整性校验（管理员 / 审计读者）' })
  verify() {
    return this.auditEvidence.verifyChain();
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: '全局 AI 用量统计（管理员 / 审计读者）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  getStats(@Query('since') since?: string, @CurrentUser() user?: JwtPayload) {
    const sinceDate = since ? new Date(since) : undefined;
    // AW-2: an audit reader's counts come from their own organisation; admin keeps everything.
    // AW-2：审计读者的计数只来自它自己的组织；管理员仍看全部。
    return this.auditStats.getAllStats(sinceDate, user && { userId: user.sub, role: user.role });
  }

  @Get('cost')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ApiOperation({ summary: 'AI 成本看板：按用户×模型×意图聚合 tokens（管理员 / 审计读者）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  getCost(@Query('since') since?: string, @CurrentUser() user?: JwtPayload) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.auditStats.getCostBreakdown(sinceDate, user && { userId: user.sub, role: user.role });
  }

  @Get('action-report')
  @CheckPolicies((ability) => ability.can('read', 'AuditLog'))
  @ResponseOrdering(REPORT_ROWS_ORDERING)
  @ApiOperation({ summary: 'AI Action Report：合规证据包（执行/批准/拒绝/阻断 + 副作用 + 哈希链，管理员）' })
  @ApiQuery({ name: 'userId', required: false, description: '按用户过滤（数字 id）' })
  @ApiQuery({ name: 'since', required: false, description: '起始时间（ISO 8601）' })
  @ApiQuery({ name: 'limit', required: false, description: '明细样本数（默认 10，最大 50）' })
  getActionReport(
    @Query('userId') userId?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.auditEvidence.getActionReport(
      {
        userId: userId ? String(Number(userId)) : undefined,
        since: since ? new Date(since) : undefined,
        limit: limit ? Number(limit) : 10,
      },
      false,
      user && { userId: user.sub, role: user.role },
    );
  }

  // The export is the one audit surface that cannot be narrowed without becoming a lie: it returns
  // the whole hashed chain together with the per-row payload an offline verifier recomputes from.
  // An audit reader keeps the scoped `action-report` and the operations audit; exporting every
  // organisation's payloads is an administrator action, so this door stays on `manage all`.
  // 导出是唯一一个「收窄后就变成假话」的审计面：它返回整条已入链的记录，以及离线校验器据以重算的
  // 逐行载荷。审计读者保留按范围收窄的 `action-report` 与操作审计；导出每个组织的载荷是管理员的
  // 动作，故这扇门保持 `manage all`。
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
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.auditEvidence.getActionReportExport(
      {
        userId: userId ? String(Number(userId)) : undefined,
        since: since ? new Date(since) : undefined,
        limit: limit ? Number(limit) : 10,
      },
      user && { userId: user.sub, role: user.role },
    );
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
