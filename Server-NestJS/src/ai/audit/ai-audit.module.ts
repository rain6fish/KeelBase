// SPDX-License-Identifier: Apache-2.0

/**
 * AI 审计写入面的共享模块（阶段 4：module forwardRef 环根治 · 第二刀）。
 *
 * **抽它的理由只有一条：打断 `ai → events → org → flows → ai` 这条间接环。**
 * `FlowRuntimeService` 用 `AuditService` 写 `action: 'flow_node'` 的审计行（工作流节点留痕）——
 * 这是真实用途，不是误引；但为了拿一个「审计写入器」，flows 必须 `forwardRef(() => AiModule)`，
 * 而 ai 又经 events / org 回到 flows，环就此闭合。
 *
 * 把写入面提成叶子：`AuditService`（写链 + 哈希链 + 治理上报）与它需要的 `GovernanceReporter`
 * （**只依赖 ConfigService**）——本模块不引 ai 的任何业务服务、也不引 flows，于是 flows 只引它即可。
 * 各领域的统计 / 查询 / 证据域（`AuditStatsService` / `AuditQueryService` / `AuditEvidenceService`）
 * 与 `AuditController` 仍留在 `AiModule`（它们要读 ai 域的库与策略，不是叶子）。
 *
 * **行为不变**：provider 仍是同一批实例，且 `AiModule` **再导出本模块**——
 * 既有的 `imports: [AiModule]` 消费者（admin / governance / mcp…）照常拿到同一个 `AuditService`；
 * `GOVERNANCE_REPORTER` 也一并导出，`AiToolEffectsService`（留在 ai）照常注入。
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditChainModule } from '../../common/audit-chain/audit-chain.module';
import { CacheModule } from '../../common/cache/cache.module';
import { AiAuditLog } from './ai-audit-log.entity';
import { AuditService } from './audit.service';
import { GovernanceReporter, GOVERNANCE_REPORTER } from '../governance/governance-reporter.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiAuditLog]), AuditChainModule, CacheModule],
  providers: [
    AuditService,
    GovernanceReporter,
    { provide: GOVERNANCE_REPORTER, useClass: GovernanceReporter },
  ],
  // GOVERNANCE_REPORTER 一并导出：留在 ai 的 AiToolEffectsService 也注入它
  exports: [AuditService, GOVERNANCE_REPORTER],
})
export class AiAuditModule {}
