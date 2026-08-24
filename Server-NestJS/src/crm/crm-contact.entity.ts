import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CrmCustomer } from './crm-customer.entity';

/** AI CRM Customer 360：客户联系人（决策人/经办人，销售触达） */
@Entity('crm_contacts')
@Index(['customerId'])
@Index(['userId'])
export class CrmContact {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'customer_id' })
  customerId!: number;

  @ManyToOne(() => CrmCustomer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: CrmCustomer;

  @Column({ length: 64 })
  name!: string;

  @Column({ length: 120, nullable: true })
  email?: string;

  @Column({ length: 32, nullable: true })
  phone?: string;

  /** 角色（决策人 / 采购 / 财务 / 技术等） */
  @Column({ length: 32, nullable: true })
  role?: string;

  @Column({ length: 64, nullable: true })
  department?: string;

  @Column({ name: 'is_primary', default: false })
  isPrimary!: boolean;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
