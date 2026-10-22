// SPDX-License-Identifier: Apache-2.0

/**
 * Shared governance module — S4-H4 C, shape B.
 *
 * `governance-core/` stays pure (helpers only); this directory holds what the AI path and the
 * standalone governance runtime genuinely share: the seven entities plus, from Step 3 on, the two
 * leaf services that depend only on their own repositories (`AiAgentService` and
 * `GovernancePolicyService`, with the policy presets). This module is the single place that
 * provides them: `AiModule`, `AuthzExplainModule` and `GovernanceModule` import and re-export it
 * instead of listing the providers themselves, so every consumer in a process gets the same
 * instance.
 *
 * From Step 4 on it also provides `AuditService` (the audit write plane plus its hash chain). The
 * `GOVERNANCE_REPORTER` **binding** deliberately stays in the business-side `AiAuditModule`: this
 * module must never provide it, because the governance process also imports this module and must
 * not report to itself. `AiAuditModule` attaches the reporter to this very instance at init.
 *
 * From Step 5 on it provides `LocalEntityRevoker` — the local soft-delete executor — as well, again
 * as the only instance. `SIDE_EFFECT_REVOKER` is **not** provided here: it is a token each process
 * module binds to this class, so the business side and the governance console both resolve the same
 * revoker while a process that must not revoke can leave the token unbound.
 *
 * From Step 6 on it also hosts the audit read side: `AuditStatsService`, `AuditQueryService`,
 * `CoverageService` and `AuditEvidenceService`, together with the helper cluster they share
 * (`by-day`, `audit-reader-scope`, `audit-explanation-state`, `audit-interpreter.service`,
 * `confirmation-detail`, and the tool-label trio `ai-feature-map` / `tool-name` / `tool-metadata`).
 * Only the code lives here: each process module keeps providing these four, because their
 * `@Optional` dependencies (`OrgService`, `OperationAuditService`) are only visible inside that
 * process's own module context — a module's providers cannot see what its importers import.
 * The tool-label trio moved with them (S4-H4 C decision D4) so no pure helper forces a runtime
 * import of `src/ai/**`.
 *
 * From Step 7 on it also hosts the side-effect read/revoke cluster — `AiToolEffectsService`, its
 * `effect-*` helpers, the write-claim store and the snapshot captor — plus the `EffectComparability`
 * and `AiWriteClaim` entities. As in Step 6 only the code lives here: the service stays a provider
 * of `AiModule` / `GovernanceModule`, because its optional `ToolRegistry`, `EXTERNAL_REVOKER`,
 * `SIDE_EFFECT_REVOKER` and reporter lookups are only visible inside those module contexts.
 *
 * Dependency direction (must hold as this module grows):
 *
 *     entities / services / controllers  →  governance-core (pure)  →  (no ai)
 *
 * 共享治理模块 —— S4-H4 C，形状 B。
 *
 * `governance-core/` 保持纯目录（只放助手）；本目录承载 AI 路径与独立治理运行时真正共用的东西：
 * 七个实体，以及自第三步起只依赖各自仓库的两个叶子服务（`AiAgentService` 与
 * `GovernancePolicyService`，连同策略预设）。**本模块是它们唯一的提供者**：`AiModule`、
 * `AuthzExplainModule` 与 `GovernanceModule` 改为 import 并再导出它，而不是各自列 provider，
 * 因此同一进程里的消费者拿到的是同一个实例。
 *
 * 自第四步起它同时提供 `AuditService`（审计写入面与哈希链）。`GOVERNANCE_REPORTER` 的**绑定**刻意
 * 留在业务侧的 `AiAuditModule`：本模块**绝不能**提供它，因为治理进程也 import 本模块、且不得给自己
 * 上报。`AiAuditModule` 在初始化时把 reporter 挂到**这个**实例上。
 *
 * 自第五步起它同时提供 `LocalEntityRevoker`（本地软删执行器），同样只此一个实例。`SIDE_EFFECT_REVOKER`
 * **不在此提供**：它是各进程模块自行绑到这个类上的 token —— 业务侧与治理台因此拿到同一个撤销器，
 * 而某个不该做本地撤销的进程只要不绑即可。
 *
 * 自第六步起它同时容纳审计读侧：`AuditStatsService`、`AuditQueryService`、`CoverageService` 与
 * `AuditEvidenceService`，连同它们共用的助手簇（`by-day`、`audit-reader-scope`、
 * `audit-explanation-state`、`audit-interpreter.service`、`confirmation-detail`，以及工具标签三件
 * `ai-feature-map` / `tool-name` / `tool-metadata`）。**只放代码**：这四个服务仍由各进程模块自己提供 ——
 * 它们的 `@Optional` 依赖（`OrgService`、`OperationAuditService`）只在该进程自己的模块上下文里可见，
 * 一个模块的 provider 看不到它的 importer 引进了什么。工具标签三件随读侧一并搬入（S4-H4 C 决策 D4），
 * 于是不再有纯助手逼迫运行时 import `src/ai/**`。
 *
 * 自第七步起它同时容纳副作用读/撤销簇 —— `AiToolEffectsService`、它的 `effect-*` 助手、写占位仓储与
 * 快照捕获器 —— 以及 `EffectComparability`、`AiWriteClaim` 两个实体。与第六步相同，**只放代码**：服务仍由
 * `AiModule` / `GovernanceModule` 提供，因为它的 `@Optional` 依赖（`ToolRegistry`、`EXTERNAL_REVOKER`、
 * `SIDE_EFFECT_REVOKER` 与 reporter）只在那些模块上下文里可见。
 *
 * From Step 8 on it also hosts the two read-side controllers (`AuditController`, `AgentsController`),
 * the audit-reader projection they share and their DTOs, which closes the file move: `src/governance/`
 * imports nothing from `src/ai/**` any more and the ratchet baseline is zero. This module still
 * registers no controllers and provides no read-side service itself — each process module registers
 * the controllers it serves.
 *
 * 自第八步起它同时容纳两个读侧控制器（`AuditController`、`AgentsController`）、它们共用的审计读投影与
 * DTO，文件搬迁到此收口：`src/governance/` 不再 import `src/ai/**` 任何东西，棘轮基线归零。本模块仍
 * **不**注册控制器、也不提供读侧服务 —— 各进程模块注册自己对外服务的控制器。
 *
 * 依赖方向（本模块长大时必须成立）：
 *
 *     实体 / 服务 / 控制器  →  governance-core（纯）  →  （不引 ai）
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditChainModule } from '../common/audit-chain/audit-chain.module';
import { CacheModule } from '../common/cache/cache.module';
import { AiAgent } from './entities/ai-agent.entity';
import { AiAuditLog } from './entities/ai-audit-log.entity';
import { AiGovernancePolicy } from './entities/ai-governance-policy.entity';
import { AiGovernancePolicyHistory } from './entities/ai-governance-policy-history.entity';
import { AiAgentService } from './services/ai-agent.service';
import { AuditService } from './services/audit.service';
import { GovernancePolicyService } from './services/governance-policy.service';
import { LocalEntityRevoker } from './services/side-effect-revoker';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiAgent, AiAuditLog, AiGovernancePolicy, AiGovernancePolicyHistory]),
    AuditChainModule,
    CacheModule,
  ],
  // GOVERNANCE_REPORTER is deliberately absent: its binding belongs to the business side.
  // SIDE_EFFECT_REVOKER is absent for the same reason: each process module binds its own token to
  // this one instance, so a process that must not revoke locally can simply decline to bind it.
  // GOVERNANCE_REPORTER 刻意不在此处提供：它的绑定归业务侧。
  // SIDE_EFFECT_REVOKER 同理刻意不提供：各进程模块把自己的 token 绑到**这一个**实例上，于是某个进程
  // 若不该做本地撤销，只要不绑即可。
  providers: [
    AiAgentService,
    GovernancePolicyService,
    AuditService,
    LocalEntityRevoker,
  ],
  exports: [
    AiAgentService,
    GovernancePolicyService,
    AuditService,
    LocalEntityRevoker,
  ],
})
export class GovernanceSharedModule {}
