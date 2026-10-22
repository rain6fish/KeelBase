// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { DataSourceOptions } from 'typeorm';

// 治理库连接（独立 DataSource，schema 从治理实体生成）
import { GovernanceDataSource } from '../config/governance-data-source';
// 哈希链服务由模块提供（不再是模块里的一行 provider）：治理侧的审计读侧服务都注入它。
// The hash-chain service comes from its module (no longer a bare provider line): the governance-side
// audit read services all inject it.
import { AuditChainModule } from '../common/audit-chain/audit-chain.module';

// 治理实体
import { AiAuditLog } from '../governance-shared/entities/ai-audit-log.entity';
import { AiToolSideEffect } from '../governance-shared/entities/ai-tool-side-effect.entity';
import { AiAgent } from '../governance-shared/entities/ai-agent.entity';
import { AiConfirmationRequest } from '../governance-shared/entities/ai-confirmation-request.entity';
import { AiGovernancePolicy } from '../governance-shared/entities/ai-governance-policy.entity';
import { AiGovernancePolicyHistory } from '../governance-shared/entities/ai-governance-policy-history.entity';

// 治理服务
// AuditService 的唯一提供者已是 GovernanceSharedModule（S4-H4 C 第四步）；治理台 import 它即可。
// The single provider of AuditService is now GovernanceSharedModule (S4-H4 C Step 4); the governance
// console only has to import it.
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
// Leaf services now have a single provider: the shared module (S4-H4 C Step 3).
// 叶子服务现在只有一个提供者：共享模块（S4-H4 C 第三步）。
import { GovernanceSharedModule } from '../governance-shared/governance-shared.module';
import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';
import { LocalEntityRevoker, SIDE_EFFECT_REVOKER } from '../governance-shared/services/side-effect-revoker';
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
      AiToolSideEffect,
      AiAgent,
      AiConfirmationRequest,
      AiGovernancePolicy,
      AiGovernancePolicyHistory,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuditChainModule,
    GovernanceSharedModule,
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
    AuditStatsService,
    AuditQueryService,
    AuditEvidenceService,
    CoverageService,
    GovernanceApprovalService,
    AiToolEffectsService,
    // The revoker comes from GovernanceSharedModule (S4-H4 C Step 5); the console only binds its token
    // to that one instance.
    // 撤销执行器由 GovernanceSharedModule 提供（S4-H4 C 第五步）；治理台只把 token 指向那个实例。
    { provide: SIDE_EFFECT_REVOKER, useExisting: LocalEntityRevoker },
    // AuditChainService 不再在此重复提供：AuditService 随 GovernanceSharedModule 而来，链服务由该模块
    // import 的 AuditChainModule 提供 —— 重复列一行只会多出一个实例。
    // AuditChainService is no longer listed here: AuditService comes with GovernanceSharedModule and the
    // chain service is provided by the AuditChainModule it imports; a second line would only add a
    // second instance.
    SidecarRegistryService,
  ],
})
export class GovernanceModule {}
