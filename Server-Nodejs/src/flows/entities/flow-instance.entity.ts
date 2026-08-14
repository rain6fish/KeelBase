import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

/** 流程实例：运行时状态机。 */
@Entity('flow_instances')
export class FlowInstance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'definition_id' })
  definitionId!: string;

  /** pending | running | completed | failed | rolled_back */
  @Column({ default: 'pending', length: 20 })
  state!: string;

  @Column({ nullable: true, name: 'current_node_id' })
  currentNodeId?: string;

  /** 流程上下文数据 JSON */
  @Column({ type: 'text', nullable: true, name: 'data_json' })
  dataJson?: string;

  @Column({ name: 'initiator_id' })
  initiatorId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
