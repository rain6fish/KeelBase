// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('reports')
@Index(['userId'])
@Index(['orgId'])

export class Report {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  summary?: string | null;

  @Column({ length: 32, default: 'draft' })
  status!: string;

  @Column({ nullable: true })
  amount?: number;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  /**
   * The organisation this row belongs to, stamped from the creator's membership at creation time.
   * `null` means the creator belonged to none — the row stays owner-only rather than becoming
   * visible to everyone.
   *
   * 本行所属组织，创建时按创建者的组织归属盖章。`null` = 创建者不属于任何组织 ⇒ 该行保持仅本人可见，
   * 而不是变成所有人可见。
   */
  @Column({ nullable: true, name: 'org_id' })
  orgId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /**
   * Bumped on every write. An update that carries a stale value is refused instead of silently
   * overwriting whoever wrote in between — the API answers that with 409. The optimistic lock is
   * the default here, not an opt-in: a generated module should not lose writes without saying so.
   *
   * 每次写入自增。携带陈旧值的更新会被拒绝，而不是**无声覆盖**中间写过的人 —— 接口以 409 作答。
   * 乐观锁在这里是**缺省**而非可选：生成的模块不该在丢写入时一声不吭。
   */
  @VersionColumn()
  version!: number;


  /**
   * Trust-ready（生成模块默认可撤销）：RG-3 软删除——删除仅置 deleted_at 保留行，管理台回收站可恢复；
   * AI 写工具 create_report 副作用 resultType=report 可按本实体元数据软删撤销
   * （SideEffectRevoker.resolveLocalEntity 匹配本实体 + DeleteDateColumn → revokeClass=local_compensate）。
   */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
