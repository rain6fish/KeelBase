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

@Entity('tags')
@Index(['userId'])

export class Tag {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  name!: string;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

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
   *
   * 「default: 1」不是装饰：没有它，这一列就是「NOT NULL 且无默认」，而**往已有数据的表上加这样一列
   * 会失败**（sqlite 因 NOT NULL 约束拒绝回填，Postgres 同样）。加了它，既有库才升得上来——且 1 正是
   * TypeORM 为版本列取的起始值，语义不变。
   *
   * The default of 1 is load-bearing, not decoration: without it this column is NOT NULL with no default,
   * and **adding such a column to a table that already has rows fails** — sqlite refuses the backfill on
   * the NOT NULL constraint, and Postgres does too. With it, existing databases can be upgraded; and 1 is
   * the value TypeORM already starts a version column at, so the semantics are unchanged.
   */
  @VersionColumn({ default: 1 })
  version!: number;


  /**
   * Trust-ready（生成模块默认可撤销）：RG-3 软删除——删除仅置 deleted_at 保留行，管理台回收站可恢复；
   * AI 写工具 create_tag 副作用 resultType=tag 可按本实体元数据软删撤销
   * （SideEffectRevoker.resolveLocalEntity 匹配本实体 + DeleteDateColumn → revokeClass=local_compensate）。
   */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
