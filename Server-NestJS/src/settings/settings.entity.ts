// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** 动态配置（RG-2）：运营参数实时可改，无需重启。value 统一存字符串，按 type 解析。 */
@Entity('settings')
@Index('IDX_settings_key', ['key'], { unique: true })
export class Setting {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 64 })
  key!: string;

  @Column({ type: 'text' })
  value!: string;

  @Column({ length: 16, default: 'string' })
  type!: 'string' | 'number' | 'boolean';

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
