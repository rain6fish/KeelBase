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
  providers: [AiAgentService, GovernancePolicyService, AuditService, LocalEntityRevoker],
  exports: [AiAgentService, GovernancePolicyService, AuditService, LocalEntityRevoker],
})
export class GovernanceSharedModule {}
