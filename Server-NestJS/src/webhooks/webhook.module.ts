import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookSubscription } from './webhook-subscription.entity';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';

/**
 * PL-14 开放平台 Webhook 订阅投递：
 * - 用户为平台事件注册回调 URL，投递时 HMAC-SHA256 签名（X-Webhook-Signature）
 * - 触发方经 WebhookPublisher 接口（业务 service 用 @Optional 注入 WebhookService）
 */
@Module({
  imports: [TypeOrmModule.forFeature([WebhookSubscription])],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
