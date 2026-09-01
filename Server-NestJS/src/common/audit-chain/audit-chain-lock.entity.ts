// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * DB 级串行锁行（审计哈希链，roadmap §22.10 B）：
 * AuditService / OperationAuditService 在 log() 事务内对 id=1 行执行 UPDATE（sqlite 写锁）
 * 或 SELECT FOR UPDATE（postgres 行锁），跨实例串行化「读 lastHash → 计算 hash → 插入」——
 * 替代进程内 `_tail` 串行队列，使多副本不再分叉。
 */
@Entity('audit_chain_lock')
export class AuditChainLock {
  @PrimaryColumn()
  id!: number;

  /** 最近持锁者（诊断用，可空） */
  @Column({ nullable: true, length: 64 })
  holder?: string;

  @UpdateDateColumn({ name: 'touched_at' })
  touchedAt?: Date;
}
