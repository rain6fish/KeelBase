// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { DataSourceOptions } from 'typeorm';

// 治理库连接（独立 DataSource，schema 从治理实体生成）
import { GovernanceDataSource } from '../config/governance-data-source';

// 治理实体
import { AiAuditLog } from '../ai/audit/ai-audit-log.entity';
import { AiDailyUsage } from '../ai/audit/ai-daily-usage.entity';
import { AiToolSideEffect } from '../ai/tool-effects/ai-tool-side-effect.entity';
import { AiAgent } from '../ai/agents/ai-agent.entity';
import { AiConfirmationRequest } from '../ai/approvals/ai-confirmation-request.entity';
import { AiGovernancePolicy } from '../ai/governance-bridge/ai-governance-policy.entity';
import { AiGovernancePolicyHistory } from '../ai/governance-bridge/ai-governance-policy-history.entity';

// 治理服务
import { AuditService } from '../ai/audit/audit.service';
// 阶段 3 把 AuditService 拆成三块（聚合统计 / 查询域 / 证据域），AuditController 一并接收——
// 治理台自己实例化 AuditController，所以它也必须自己提供这三个，与 AuditService 同理。
import { AuditStatsService } from '../ai/audit/audit-stats.service';
import { AuditQueryService } from '../ai/audit/audit-query.service';
import { AuditEvidenceService } from '../ai/audit/audit-evidence.service';
// AW-3 gave `AuditEvidenceService` a fourth constructor dependency (`CoverageService`), and the
// governance plane instantiates these services itself — so it has to provide that one too. This list
// must follow that constructor, not lag behind it: when it lags, the governance module fails to
// instantiate, which `app-wiring.spec.ts` catches and nothing in `check:all` does.
// AW-3 给 `AuditEvidenceService` 加了**第四个**构造器依赖（`CoverageService`），而治理台**自己实例化**
// 这些服务 —— 故它也必须自己提供这一个。这份清单要跟着那个构造器走、而不是落在它后面：一落后，
// 治理模块就装配不起来，`app-wiring.spec.ts` 会逮到，而 `check:all` 里没有任何一道会。
import { CoverageService } from '../ai/audit/coverage.service';
import { AiAgentService } from '../ai/agents/ai-agent.service';
import { GovernancePolicyService } from '../ai/governance-bridge/governance-policy.service';
import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';
import { LocalEntityRevoker, SIDE_EFFECT_REVOKER } from '../ai/tool-effects/side-effect-revoker';
import { AuditChainService } from '../common/audit-chain/audit-chain.service';
import { GovernanceApprovalService } from './governance-approval.service';
import { SidecarRegistryService } from './sidecar-registry.service';

// 治理 controller
import { AuditController } from '../ai/audit/audit.controller';
import { AgentsController } from '../ai/agents/agents.controller';
import { GovernanceController } from './governance.controller';
import { ExternalGovernanceController } from './external-governance.controller';
import { GovernanceApiGuard } from './governance-api.guard';

// 治理台认证：复用 JWT 策略（共享 JWT_SECRET）+ 简化 CASL admin 判定
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/casl/policies.guard';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { GovernanceCaslAbilityFactory } from './governance-casl.factory';

/**
 * D2-2 独立治理控制平面（读侧优先）：
 * - 独立 GovernanceDataSource（治理自有表），审计/Agent/策略/审批列表/副作用查询可独立读
 * - 认证复用 JWT（共享 JWT_SECRET）+ 简化 CASL（只 admin）
 * - 写侧（approve 后执行、撤销软删、决策轨迹）D2-4 跨服务化，治理台不含
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: (): DataSourceOptions => GovernanceDataSource.options as DataSourceOptions,
    }),
    TypeOrmModule.forFeature([
      AiAuditLog,
      AiDailyUsage,
      AiToolSideEffect,
      AiAgent,
      AiConfirmationRequest,
      AiGovernancePolicy,
      AiGovernancePolicyHistory,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AuditController, AgentsController, GovernanceController, ExternalGovernanceController],
  providers: [
    // 认证：JWT 策略 + 守卫（复用主应用，共享 JWT_SECRET）+ 简化 CASL（只 admin）
    JwtStrategy,
    GovernanceCaslAbilityFactory,
    { provide: CaslAbilityFactory, useClass: GovernanceCaslAbilityFactory },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PoliciesGuard },
    // 治理服务（注入治理库默认 DataSource）
    AuditService,
    AuditStatsService,
    AuditQueryService,
    AuditEvidenceService,
    CoverageService,
    AiAgentService,
    GovernancePolicyService,
    GovernanceApprovalService,
    AiToolEffectsService,
    LocalEntityRevoker,
    { provide: SIDE_EFFECT_REVOKER, useClass: LocalEntityRevoker },
    AuditChainService,
    SidecarRegistryService,
  ],
})
export class GovernanceModule {}
