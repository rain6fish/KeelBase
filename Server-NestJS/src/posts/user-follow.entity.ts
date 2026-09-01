// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/** GROWTH-2 用户关注：followerId 关注 followeeId，唯一 */
@Entity('user_follows')
@Index(['followerId', 'followeeId'], { unique: true })
export class UserFollow {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'follower_id' })
  followerId!: number;

  @Column({ name: 'followee_id' })
  followeeId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
