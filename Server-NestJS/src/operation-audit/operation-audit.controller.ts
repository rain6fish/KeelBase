// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OperationAuditService } from './operation-audit.service';
import { CheckPolicies } from '../common/casl/check-policies.decorator';

/**
 * Every read here is gated on `can('read', 'OperationAudit')` rather than the blanket
 * `can('manage','all')` the console's operator pages use. This is the TS half of the same alignment
 * the Java runtime made in JV-63: an audit reader must reach the operations audit without being an
 * administrator — handing them admin would also make them the operator they are supposed to review.
 * `manage all` implies `read` on any subject, so admins are unaffected; a plain user still fails.
 *
 * ⚠ Scope: reads only. All three endpoints are reads (the chain verification recomputes hashes, the
 * stats aggregate rows); nothing here writes, approves or exports, and no write action is granted on
 * this subject.
 *
 * 这里每个读端点判的都是 `can('read', 'OperationAudit')`，而不是控制台运营页用的那条
 * `can('manage','all')`。这是 Java 运行时 `JV-63` 所做对齐的 TS 那一半：审计读者必须**不必是管理员**
 * 就能到操作审计 —— 给他 `admin` 就等于让他同时是他本该复核的那个操作者。`manage all` 蕴含任意主体上的
 * `read`，故**管理员不受影响**；普通用户照旧过不去。
 *
 * ⚠ **范围**：**只读**。三个端点都是读（链校验重算哈希、统计做聚合）；这里没有写、没有审批、没有导出，
 * 本 subject 上也不授予任何写动作。
 */
@ApiTags('操作审计')
@ApiBearerAuth()
@Controller({ path: 'audit/operations', version: '1' })
export class OperationAuditController {
  constructor(private readonly auditService: OperationAuditService) {}

  @Get('logs')
  @CheckPolicies((ability) => ability.can('read', 'OperationAudit'))
  @ApiOperation({ summary: '操作审计日志（admin / 审计读者）' })
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
  @CheckPolicies((ability) => ability.can('read', 'OperationAudit'))
  @ApiOperation({ summary: 'HS-11 操作审计哈希链完整性校验（admin / 审计读者）' })
  async verify() {
    return this.auditService.verifyChain();
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('read', 'OperationAudit'))
  @ApiOperation({ summary: '操作审计统计（按 action 分组，admin / 审计读者）' })
  async stats() {
    return this.auditService.getStats();
  }
}
