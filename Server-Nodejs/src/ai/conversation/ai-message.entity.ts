import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('ai_messages')
export class AiMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'conversation_id' })
  conversationId!: string;

  @Column({ length: 32 })
  role!: string; // system | user | assistant | tool

  @Column({ type: 'text' })
  content!: string;

  @Column({ length: 64, nullable: true, name: 'tool_call_id' })
  toolCallId?: string;

  @Column({ length: 64, nullable: true, name: 'tool_name' })
  toolName?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
