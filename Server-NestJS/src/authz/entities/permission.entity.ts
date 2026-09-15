// SPDX-License-Identifier: Apache-2.0

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * 能力点目录（权限-2 Step 2）：一个 (subject × action) 的可授予单元。
 *
 * 今天全部是 `manage`（复刻改造前的硬编码规则）；粒度细化（read/update/delete 分授）留给后续。
 */
@Entity('permissions')
@Index(['subject', 'action'], { unique: true })
export class Permission {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 人类可读标识，如 `crm_customer.manage` / `all.manage` */
  @Column({ length: 96, unique: true })
  code!: string;

  /** CASL subject（实体名；`'all'` = 全量） */
  @Column({ length: 64 })
  subject!: string;

  /** CASL action（今天恒为 `manage`） */
  @Column({ length: 24, default: 'manage' })
  action!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  description?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
