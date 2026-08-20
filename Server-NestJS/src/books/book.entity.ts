import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('books')
@Index(['userId'])
export class Book {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  title!: string;

  @Column({ length: 200 })
  author!: string;

  @Column({ length: 32, default: 'unread' })
  status!: string;

  @Column({ nullable: true })
  rating?: number;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** RG-3 软删除：删除后仍保留行，管理台回收站可恢复 */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
