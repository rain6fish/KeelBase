// SPDX-License-Identifier: Apache-2.0

/**
 * postgres 迁移清单（单一权威源）
 *
 * 背景：postgres 迁移清单曾有两份手工平行列表——运行时（app.module.ts）与 CLI（typeorm-data-source.ts）。
 * 2026-09-10 二者漂移，6 个迁移漏进运行时清单 → 生产 migrationsRun 永不执行（ECS /ai/conversations/:id/trace 500）。
 * 现统一为本文件导出的单一清单，两处消费方均由此派生，杜绝漂移。
 *
 * 新增迁移时（二选一，守卫测试 postgres-migrations.spec.ts 会强制）：
 * - postgres 需要执行 → 在 POSTGRES_MIGRATION_GLOBS 加 glob（文件名子串，形如 *AddXxx*）
 * - 仅 sqlite 需要（postgres 由基线/合并迁移覆盖）→ 在 POSTGRES_EXCLUDED_MIGRATIONS 显式登记文件名
 */

/** postgres 运行时与 CLI 均加载的迁移 glob（文件名子串） */
export const POSTGRES_MIGRATION_GLOBS: string[] = [
  '*PostgresInitialSchema*',
  '*AddKnowledgeEmbeddings*',
  '*AddOperationAuditFeatureColumns*',
  '*AddAccountCompliance*',
  '*AddUserMemory*',
  '*AddConversationSummary*',
  '*AddKnowledgeDocumentColumns*',
  '*AddKnowledgeChunks*',
  '*AddSettings*',
  '*AddSoftDelete*',
  '*AddAiFeedback*',
  '*AddInvite*',
  '*AddAiEvalCases*',
  '*AddFormBuilder*',
  '*AddAiToolSideEffects*',
  '*AddAiToolSideEffectSnapshots*',
  '*AddToolEffectConversationIndex*',
  '*AddHeadlessApiKeys*',
  '*AddGeneratedModuleSchemas*',
  '*AddOrgStructures*',
  '*AddGrowthCommunity*',
  '*AddEventOrgId*',
  '*AddTodoOrgId*',
  '*AddPoints*',
  '*AddCheckinDateToPointsEntries*',
  '*AddAiDailyUsage*',
  '*AddAuditHashChain*',
  '*AddAiAuditIdentity*',
  '*AddAiAuditAuthorization*',
  '*AddAiAuditDelegation*',
  '*AddAiConfirmationRequests*',
  '*PostgresIncrementalSchema*',
  '*AddCrm*',
  '*AddWebhookSubscriptions*',
  '*FixWebhookIndex*',
  '*AddPm*',
  '*AddApproval*',
  '*AddSuppliers*',
  '*AddContracts*',
  '*AddBooksNotesProtocolFields*',
  '*AddAiAgents*',
  '*FixAiAgentsNameUniqueIndex*',
  '*AddUsersCreatedAtIndex*',
  '*AddOperationAuditChanges*',
  '*AddAiAuditBusinessEventEvidence*',
  '*AddAuditChainLock*',
  '*AddAiAuditUsername*',
  '*AddAiGovernancePolicy*',
  '*AddOperationAuditAuthorization*',
  '*AddAiAuditPayloadVersion*',
  '*AddAiToolSideEffectChain*',
  '*AddAiToolSideEffectResultTypeLength*',
  '*AddAiToolSideEffectRevokeColumns*',
  '*AddAiConfirmationRunColumns*',
  '*AddSideEffectRunId*',
];

/** 有意排除于 postgres 的迁移（仅 sqlite；postgres 由 PostgresInitialSchema / PostgresIncrementalSchema 基线覆盖） */
export const POSTGRES_EXCLUDED_MIGRATIONS: string[] = [
  '1785822337546-InitialSchema',
  '1785833316992-AddNotifications',
  '1785893450719-AddKnowledgeArticles',
  '1785895751325-AddResetToken',
  '1785896628455-AddUserSessions',
  '1785898133089-AddEmailVerification',
  '1785906973286-AddOperationAuditLog',
  '1785911692442-AddPushTokens',
  '1785978305379-AddEventReminder',
  '1785984806873-AddTodos',
  '1785986020373-AddNotificationTargets',
  '1786842976966-AddSchemaConsistencyConstraints',
  '1788300000000-AddUserMfa',
  '1788400000000-AddMustChangePassword',
  '1797000000000-ExtendToolEffectResultTypeLen',
];
