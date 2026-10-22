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
// In Stage 3 AuditService was split into three (stats / query / evidence); since Step 6 they are
// provided by GovernanceSharedModule just like AuditService, and the console only imports that module.
// 阶段 3 把 AuditService 拆成三块（聚合统计 / 查询域 / 证据域）；自第六步起它们与 AuditService 一样
// 由 GovernanceSharedModule 提供，治理台只 import 该模块。
// The constructor-dependency list that used to live here now lives in GovernanceSharedModule; a
// missing provider still fails `app-wiring.spec.ts` and nothing in `check:all` catches it.
// 过去维护在这里的构造器依赖清单现在由 GovernanceSharedModule 负责；缺 provider 仍会让
// `app-wiring.spec.ts` 变红，而 `check:all` 里没有任何一道会逮到。
// Leaf services now have a single provider: the shared module (S4-H4 C Step 3).
// 叶子服务现在只有一个提供者：共享模块（S4-H4 C 第三步）。
import { GovernanceSharedModule } from '../governance-shared/governance-shared.module';
import { AuditStatsService } from '../governance-shared/services/audit-stats.service';
import { AuditQueryService } from '../governance-shared/services/audit-query.service';
import { AuditEvidenceService } from '../governance-shared/services/audit-evidence.service';
import { CoverageService } from '../governance-shared/services/coverage.service';
import { AiToolEffectsService } from '../governance-shared/services/ai-tool-effects.service';
import { LocalEntityRevoker, SIDE_EFFECT_REVOKER } from '../governance-shared/services/side-effect-revoker';
import { GovernanceApprovalService } from './governance-approval.service';
import { SidecarRegistryService } from './sidecar-registry.service';

// 治理 controller
import { AuditController } from '../governance-shared/controllers/audit.controller';
import { AgentsController } from '../governance-shared/controllers/agents.controller';
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
    // 审计读侧代码在 governance-shared（S4-H4 C 第六步），但 provider 留在治理台自己的模块里 ——
    // 它们的可见依赖（本进程的 DataSource / @Optional 服务）只在此上下文成立。
    // The read-side code lives in governance-shared (S4-H4 C Step 6); the providers stay in this
    // module because their visible dependencies only exist in this process's context.
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
