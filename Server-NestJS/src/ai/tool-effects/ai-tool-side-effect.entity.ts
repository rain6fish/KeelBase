// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * HS-3 AI 写操作副作用记录：每次 AI 写工具（create_event/create_todo）成功执行后落一条。
 * - idempotencyKey 唯一 → 同会话同参数重复调用返回已有结果（幂等），防 LLM 重试/并发重复创建
 * - resultType + resultId → 管理台可定位并软删对应记录（AI 副作用可撤销，衔接 RG-3 回收站）
 * - conversationId 索引：会话级批量撤销（revokeConversation）/轨迹查询按会话过滤，表随每次 AI 写单调增长
 */
@Index(['conversationId'])
@Entity('ai_tool_side_effects')
export class AiToolSideEffect {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 幂等键：sha256(userId:conversationId:toolName:argsHash)，唯一 */
  @Column({ length: 64, unique: true, name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'conversation_id', nullable: true })
  conversationId?: string;

  @Column({ length: 64, name: 'tool_name' })
  toolName!: string;

  /** 参数 hash（用于展示与追溯） */
  @Column({ length: 64, name: 'args_hash' })
  argsHash!: string;

  /** 副作用类型（旗舰别名 event/todo/crm_task/pm_task/app_request/contract/proxy_call；生成模块为其模块名，如 invoice） */
  @Column({ length: 64, name: 'result_type' })
  resultType!: string;

  /** 副作用目标记录 id（events/todos 主键） */
  @Column({ name: 'result_id' })
  resultId!: number;

  /** E-1 字段级变更审计：写操作目标记录变更前快照（JSON 字符串；create 类为 null，B 路径外部写无本地快照） */
  @Column({ type: 'text', nullable: true, name: 'before_snapshot' })
  beforeSnapshot?: string | null;

  /** E-1 字段级变更审计：写操作目标记录变更后快照（JSON 字符串，目标实体全量字段） */
  @Column({ type: 'text', nullable: true, name: 'after_snapshot' })
  afterSnapshot?: string | null;

  /** G-3（§internal.17 ① G-3）：副作用行哈希链——前一条已哈希行 hash（历史行 null → 不参与链；首个哈希行 genesis） */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'prev_hash' })
  prevHash?: string | null;

  /** G-3（§internal.17 ① G-3）：本条副作用内容 HMAC（防篡改/防插入；仅新行有值） */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'hash' })
  hash?: string | null;

  /**
   * KB-6：副作用发生时刻的撤销能力分档快照（none / local_compensate / governed_external / transactional）。
   * 工具/ProxyTool 配置可随 ai_proxy_tools 变更，副作用是历史事实须固化当时档位（语义源 protocol-trust-proof-card R9）。
   * 不入副作用哈希链 payload（防旧链化行验链失败）。
   */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'revoke_class' })
  revokeClass?: string | null;

  /**
   * KB-6：撤销结果运维态（null=未撤 / revoked=本地软删 / compensating=已请求外部补偿·结果未知 / revoke_failed=补偿失败）。
   * 不入哈希链 payload（可变运维态）。
   */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'revoke_status' })
  revokeStatus?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
