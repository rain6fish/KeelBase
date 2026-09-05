// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * P-③（§22.17 ① P-③，docs/policy-history-reproducible.spec.md）：治理策略历史快照。
 * 每次 setPolicy 落一行（revision 内容指纹 + 规范化 value + appliedAt）；replayDecision 按 revision 查历史
 * 「拿当时策略对象真重演」。同内容重复写 → 同 revision（语义幂等，查找取最新；保留「何时改过」痕迹）。
 */
@Entity('ai_governance_policy_history')
// revision 精确回放 / applied_at 历史列表查询索引（与迁移 1812000000000 显式 IDX_gph_* 对齐，防 TypeORM 判漂移）
@Index('IDX_gph_revision', ['revision'])
@Index('IDX_gph_applied_at', ['appliedAt'])
export class AiGovernancePolicyHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  /** §22.17③ 策略内容指纹（与 setPolicy 返回 revision 一致；同内容恒同号） */
  @Column({ type: 'varchar', length: 16 })
  revision!: string;

  /** 规范化策略 JSON（normalizePolicy 输出，含 mode） */
  @Column({ type: 'text' })
  value!: string;

  /** 写入时间（= setPolicy 时点）。不写死方言类型：sqlite→datetime / postgres→timestamp，避免 pg 启动 metadata 校验报 DataTypeNotSupported */
  @Column({ name: 'applied_at' })
  appliedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
