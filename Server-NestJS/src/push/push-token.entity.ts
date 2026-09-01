// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * 推送设备 token 注册表（用户 → 厂商 registration_id）。
 */
@Entity('push_tokens')
@Index(['userId', 'platform'])
export class PushToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'int', name: 'user_id' })
  userId!: number;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'device_id' })
  deviceId?: string | null;

  @Column({ type: 'varchar', length: 16 })
  platform!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  token!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
