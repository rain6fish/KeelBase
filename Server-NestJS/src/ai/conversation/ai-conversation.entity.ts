// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ai_conversations')
export class AiConversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ length: 64 })
  provider!: string;

  @Column({ length: 64, name: 'model' })
  model!: string;

  @Column({ default: 0, name: 'message_count' })
  messageCount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ nullable: true, name: 'last_activity_at' })
  lastActivityAt?: Date;

  @Column({ type: 'text', nullable: true, name: 'summary' })
  summary?: string;

  @Column({ default: false, name: 'is_deleted' })
  isDeleted!: boolean;
}
