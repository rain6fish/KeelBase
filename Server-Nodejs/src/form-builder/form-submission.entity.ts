import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** PL-10 表单提交数据：一次表单提交的 JSON 数据。 */
@Entity('form_submissions')
export class FormSubmission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'schema_id' })
  schemaId!: number;

  @Index()
  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ type: 'text' })
  data!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
