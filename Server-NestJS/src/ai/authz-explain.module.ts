// SPDX-License-Identifier: Apache-2.0

/**
 * 授权解释面的共享模块（阶段 4：module forwardRef 环根治 · 第一刀）。
 *
 * **抽它的理由只有一条：打断 `ai ↔ auth` 的直接环。**
 * `AuthController` 暴露四个 explainable-authz 端点（`GET /auth/me/permissions`、
 * `POST /auth/permissions/explain[/target]`、`GET /auth/permissions/chain`），它们解释的正是
 * **AI 工具的授权裁决**，因此注入 ai 侧的 `AuthorizationExplainerService`；反过来 ai 侧又要 auth 的
 * `DelegationTokenService`（B 路径对外委托身份）。两边直接互引，于是双方都得挂 `forwardRef`。
 *
 * 解法不是「把端点搬去 ai 域」（那会改公开 API 路径、牵连管理台与文档），而是**把被共享的 provider 提成叶子**：
 * `ToolRegistry`（零依赖）、`AuthorizationExplainerService`（依赖前者 + CASL 工厂 + 可选治理策略 + 可选用户服务）、
 * `GovernancePolicyService`（仅两个仓库）。本模块**不引 ai、不引 auth**，所以 auth 可以只引它，环即断。
 *
 * **行为不变**：provider 仍是同一批实例（Nest 单例），且 `AiModule` 仍**再导出本模块**——
 * 既有的 `imports: [AiModule]` 消费者（mcp / admin / app-version / readiness…）照常拿到同样的东西。
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { ToolRegistry } from './tools/tool-registry';
import { AuthorizationExplainerService } from './authorization-explainer.service';
import { GovernancePolicyService } from './governance/governance-policy.service';
import { AiGovernancePolicy } from './governance/ai-governance-policy.entity';
import { AiGovernancePolicyHistory } from './governance/ai-governance-policy-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiGovernancePolicy, AiGovernancePolicyHistory]),
    // explainer 的角色依据要读用户（@Optional，但生产路径上必须有）
    UsersModule,
  ],
  providers: [ToolRegistry, GovernancePolicyService, AuthorizationExplainerService],
  exports: [ToolRegistry, GovernancePolicyService, AuthorizationExplainerService],
})
export class AuthzExplainModule {}
