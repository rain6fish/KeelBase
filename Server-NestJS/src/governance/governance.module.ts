import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { DataSourceOptions } from 'typeorm';

// 治理库连接（独立 DataSource，schema 从治理实体生成）
import { GovernanceDataSource } from '../config/typeorm-data-source';

// 治理实体
import { AiAuditLog } from '../ai/audit/ai-audit-log.entity';
import { AiDailyUsage } from '../ai/audit/ai-daily-usage.entity';
import { AiToolSideEffect } from '../ai/tool-effects/ai-tool-side-effect.entity';
import { AiAgent } from '../ai/agents/ai-agent.entity';
import { AiConfirmationRequest } from '../ai/approvals/ai-confirmation-request.entity';
import { AiGovernancePolicy } from '../ai/governance/ai-governance-policy.entity';

// 治理服务
import { AuditService } from '../ai/audit/audit.service';
import { AiAgentService } from '../ai/agents/ai-agent.service';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';
import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';
import { LocalEntityRevoker, SIDE_EFFECT_REVOKER } from '../ai/tool-effects/side-effect-revoker';
import { AuditChainService } from '../common/audit-chain/audit-chain.service';
import { GovernanceApprovalService } from './governance-approval.service';

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
    AiAgentService,
    GovernancePolicyService,
    GovernanceApprovalService,
    AiToolEffectsService,
    LocalEntityRevoker,
    { provide: SIDE_EFFECT_REVOKER, useClass: LocalEntityRevoker },
    AuditChainService,
  ],
})
export class GovernanceModule {}
