import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * D5 Agent Registry（roadmap §22.10）：已注册 Agent 的正式定义（ID/Name/Owner/Purpose/Capability/Trust Level）。
 * 最小版本：从 headless API Key 自动注册（key 名 = agent 名）；子 agent 名在运行时归责（D4）。
 * 不做复杂 IAM（专家 2026-08-26：先最小 Registry，Delegation 进 Audit）。
 */
@Entity('ai_agents')
export class AiAgent {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Agent 名（= headless key 名 / 子 agent 名），运行时审计 agent_id 归责到此处 */
  @Index({ unique: true, name: 'UQ_ai_agents_name' })
  @Column({ length: 100 })
  name!: string;

  /** 拥有者（headless key 的 ownerUserId） */
  @Column({ name: 'owner_id', nullable: true })
  ownerId?: number;

  /** 用途（人类可读，企业可信展示） */
  @Column({ length: 255, nullable: true })
  purpose?: string;

  /** 能力清单（JSON 数组字符串：["read_customer", "create_followup"]） */
  @Column({ type: 'text', nullable: true })
  capabilities?: string;

  /** 信任级别 R1-R5（R1 读自动 / R3 写需确认 / R4 双人审批 / R5 阻断） */
  @Column({ length: 8, default: 'R1', name: 'trust_level' })
  trustLevel!: string;

  @Column({ length: 255, nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
