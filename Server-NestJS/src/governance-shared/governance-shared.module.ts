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
 * 依赖方向（本模块长大时必须成立）：
 *
 *     实体 / 服务 / 控制器  →  governance-core（纯）  →  （不引 ai）
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAgent } from './entities/ai-agent.entity';
import { AiGovernancePolicy } from './entities/ai-governance-policy.entity';
import { AiGovernancePolicyHistory } from './entities/ai-governance-policy-history.entity';
import { AiAgentService } from './services/ai-agent.service';
import { GovernancePolicyService } from './services/governance-policy.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiAgent, AiGovernancePolicy, AiGovernancePolicyHistory])],
  providers: [AiAgentService, GovernancePolicyService],
  exports: [AiAgentService, GovernancePolicyService],
})
export class GovernanceSharedModule {}
