// SPDX-License-Identifier: Apache-2.0

import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { resolve } from 'path';
import { AiAuditLog } from '../ai/audit/ai-audit-log.entity';
import { AiDailyUsage } from '../ai/audit/ai-daily-usage.entity';
import { AiToolSideEffect } from '../ai/tool-effects/ai-tool-side-effect.entity';
import { AiAgent } from '../ai/agents/ai-agent.entity';
import { AiConfirmationRequest } from '../ai/approvals/ai-confirmation-request.entity';
import { AiGovernancePolicy } from '../ai/governance/ai-governance-policy.entity';
import { AuditChainLock } from '../common/audit-chain/audit-chain-lock.entity';

// 加载 .env 文件（根据 NODE_ENV 选择环境文件）
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'production' ? '.env.production'
  : nodeEnv === 'staging' ? '.env.staging'
  : '.env';
config({ path: resolve(__dirname, `../../${envFile}`) });

const dbType = process.env.DB_TYPE || 'sqlite';

/**
 * D2-2 独立治理控制平面：治理台服务独立库连接（schema 从治理实体生成）。
 * 配置 GOVERNANCE_DB_*（sqlite 用 GOVERNANCE_DB_PATH；postgres 用 HOST/PORT/USER/PASSWORD/NAME），
 * 未配置时回落主库 DB_*（但库名独立：sqlite ./data/governance.sqlite / postgres 'governance'）。
 * 供独立治理台服务使用；业务系统仍用主 AppDataSource（上报接入见 D2-3）。
 * 独立文件：TypeORM CLI 要求数据源文件只导出一个 DataSource（migration:generate 等主库迁移不受影响）。
 */
export const GovernanceDataSource = new DataSource({
  type: dbType === 'postgres' ? 'postgres' : 'better-sqlite3',
  ...(dbType === 'postgres'
    ? {
        host: process.env.GOVERNANCE_DB_HOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.GOVERNANCE_DB_PORT || process.env.DB_PORT || '5432', 10),
        username: process.env.GOVERNANCE_DB_USER || process.env.DB_USER || 'postgres',
        password: process.env.GOVERNANCE_DB_PASSWORD || process.env.DB_PASSWORD || 'postgres',
        // 治理库名必须独立（不回落到主库 DB_NAME，避免治理台连业务库）
        database: process.env.GOVERNANCE_DB_NAME || 'governance',
      }
    : {
        // 独立路径（不回落到主库 DB_PATH）
        database: process.env.GOVERNANCE_DB_PATH || './data/governance.sqlite',
      }),
  entities: [
    AiAuditLog,
    AiDailyUsage,
    AiToolSideEffect,
    AiAgent,
    AiConfirmationRequest,
    AiGovernancePolicy,
    AuditChainLock,
  ],
  // §5.4 部署安全：仅开发/暂存同步建表；生产关闭（fail fast，避免治理库运行时 schema 漂移）。
  // 治理台生产迁移策略（AddGovernance*）待补——当前生产部署会因缺表显式失败而非静默漂移。
  synchronize: nodeEnv !== 'production',
} as DataSourceOptions);
