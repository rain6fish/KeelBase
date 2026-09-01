// SPDX-License-Identifier: Apache-2.0

/**
 * 用户长期记忆实体 — user_memory
 *
 * 跨会话保存用户事实/偏好/身份信息，注入 AI 系统提示词。
 * userId 用 string（与 AiConversation.userId 一致）。
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_memory')
@Index('IDX_user_memory_user_id', ['userId'])
export class UserMemory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id', length: 36 })
  userId!: string;

  /** fact（事实）| preference（偏好）| identity（身份/称呼） */
  @Column({ length: 32, default: 'fact' })
  type!: string;

  @Column({ type: 'text' })
  content!: string;

  /** 来源：conversationId 或 'rule' */
  @Column({ length: 64, nullable: true })
  source?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ name: 'last_used_at', type: Date, nullable: true })
  lastUsedAt?: Date;

  @Column({ name: 'expires_at', type: Date, nullable: true })
  expiresAt?: Date;
}
