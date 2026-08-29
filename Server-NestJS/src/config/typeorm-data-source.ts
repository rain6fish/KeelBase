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
 
 let dataSourceOptions: DataSourceOptions;
 
 if (dbType === 'postgres') {
   // postgres 用独立基线 + 向量迁移（sqlite 方言迁移不加载）
   dataSourceOptions = {
     type: 'postgres',
     host: process.env.DB_HOST || 'localhost',
     port: parseInt(process.env.DB_PORT || '5432', 10),
     username: process.env.DB_USER || 'postgres',
     password: process.env.DB_PASSWORD || 'postgres',
     database: process.env.DB_NAME || 'front',
     entities: [resolve(__dirname, '../**/*.entity{.ts,.js}')],
     migrations: [
       resolve(__dirname, '../migrations/*PostgresInitialSchema*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddKnowledgeEmbeddings*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddOperationAuditFeatureColumns*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAccountCompliance*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddUserMemory*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddConversationSummary*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddKnowledgeDocumentColumns*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddKnowledgeChunks*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddSettings*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddSoftDelete*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiFeedback*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddInvite*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiEvalCases*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddFormBuilder*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiToolSideEffects*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddHeadlessApiKeys*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddGeneratedModuleSchemas*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddOrgStructures*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddGrowthCommunity*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddEventOrgId*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddTodoOrgId*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddPoints*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddCheckinDateToPointsEntries*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiDailyUsage*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAuditHashChain*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiAuditIdentity*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiAuditAuthorization*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiAuditDelegation*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiConfirmationRequests*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*PostgresIncrementalSchema*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddCrm*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddWebhookSubscriptions*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*FixWebhookIndex*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddPm*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddApproval*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddSuppliers*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddContracts*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddBooksNotesProtocolFields*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiAgents*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*FixAiAgentsNameUniqueIndex*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAuditChainLock*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiAuditUsername*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddAiGovernancePolicy*').replace(/\\/g, '/'),
     ],
   };
 } else {
   dataSourceOptions = {
     type: 'better-sqlite3',
     database: process.env.DB_PATH || './data/front.sqlite',
     entities: [resolve(__dirname, '../**/*.entity{.ts,.js}')],
     migrations: [resolve(__dirname, '../migrations/*{.ts,.js}')],
   };
 }
 
 export const AppDataSource = new DataSource(dataSourceOptions);

/**
 * D2-2 独立治理控制平面：治理台服务独立库连接（schema 从治理实体生成）。
 * 配置 GOVERNANCE_DB_*（sqlite 用 GOVERNANCE_DB_PATH；postgres 用 HOST/PORT/USER/PASSWORD/NAME），
 * 未配置时回落主库 DB_*（但库名独立：sqlite ./data/governance.sqlite / postgres 'governance'）。
 * 供独立治理台服务使用；业务系统仍用主 AppDataSource（上报接入见 D2-3）。
 */
export const GovernanceDataSource = new DataSource({
  type: dbType,
  ...(dbType === 'postgres'
    ? {
        host: process.env.GOVERNANCE_DB_HOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.GOVERNANCE_DB_PORT || process.env.DB_PORT || '5432', 10),
        username: process.env.GOVERNANCE_DB_USER || process.env.DB_USER || 'postgres',
        password: process.env.GOVERNANCE_DB_PASSWORD || process.env.DB_PASSWORD || 'postgres',
        database: process.env.GOVERNANCE_DB_NAME || process.env.DB_NAME || 'governance',
      }
    : {
        database: process.env.GOVERNANCE_DB_PATH || process.env.DB_PATH || './data/governance.sqlite',
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
  synchronize: true,
} as DataSourceOptions);
