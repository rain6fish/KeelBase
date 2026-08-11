import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** AI-20 评测集用例：场景化 prompt + 期望行为描述。 */
@Entity('ai_eval_cases')
export class EvalCase {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 64 })
  category!: string; // tool-hit | no-tool | security-reject | pii | injection | timeout | ...

  @Column({ type: 'text' })
  prompt!: string;

  /**
   * 期望行为断言（HS-1 判定闭环）。纯文本 → contains 包含匹配；
   * JSON → {"assert": "contains|regex|tool-hit|tool-miss|no-tool|reject", "value": "..."}
   */
  @Column({ type: 'text', nullable: true })
  expected!: string;

  @Column({ default: true })
  enabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
