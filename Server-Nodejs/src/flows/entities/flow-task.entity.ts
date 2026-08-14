import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 人工审批任务（HumanTask 节点产生的待办）。 */
@Entity('flow_tasks')
export class FlowTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'instance_id' })
  instanceId!: number;

  @Column({ name: 'node_id' })
  nodeId!: string;

  @Column({ name: 'assignee_id' })
  assigneeId!: number;

  /** pending | approved | rejected */
  @Column({ default: 'pending', length: 20 })
  status!: string;

  @Column({ type: 'text', nullable: true, name: 'decision_note' })
  decisionNote?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
