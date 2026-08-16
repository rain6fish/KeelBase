import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** PL-14 Webhook 订阅：用户为平台事件注册回调 URL，投递时 HMAC-SHA256 签名。 */
@Entity('webhook_subscriptions')
@Index(['userId'])
export class WebhookSubscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', name: 'user_id' })
  userId!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 512 })
  url!: string;

  /** 订阅的事件类型白名单，如 ["feedback.created","todo.created"] */
  @Column({ type: 'text', name: 'events' })
  eventsJson!: string;

  /** 用于 HMAC-SHA256 签名的 secret（仅存服务端，投递时签名） */
  @Column({ type: 'varchar', length: 64 })
  secret!: string;

  @Column({ default: true })
  enabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
