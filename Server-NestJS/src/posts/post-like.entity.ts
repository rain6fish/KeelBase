// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/** GROWTH-2 帖子点赞：postId+userId 唯一，幂等（重复点赞不重复计数） */
@Entity('post_likes')
@Index(['postId', 'userId'], { unique: true })
export class PostLike {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'post_id' })
  postId!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
