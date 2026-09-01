// SPDX-License-Identifier: Apache-2.0

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Event } from '../events/event.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { WxSubscribeService } from '../push/wx-subscribe.service';

export interface ReminderJobData {
  eventId: number;
  userId: number;
}

/**
 * reminder 队列消费端：事件提醒到点 → 创建站内通知（自动触发 SSE + 设备推送）。
 */
@Processor('reminder')
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    @InjectRepository(Event) private readonly eventRepo: Repository<Event>,
    private readonly notificationsService: NotificationsService,
    private readonly wxSubscribeService: WxSubscribeService,
  ) {
    super();
  }

  async process(job: Job<ReminderJobData>): Promise<void> {
    const { eventId, userId } = job.data;
    try {
      const event = await this.eventRepo.findOne({ where: { id: eventId } });
      // 事件不存在 / 已取消 / 不属于该用户 → 跳过
      if (!event || event.isCancelled || event.userId !== userId) {
        this.logger.log(`[Reminder] skip event=${eventId} (not found/cancelled/owner)`);
        return;
      }
      // 提醒时间已过（延迟 job 早触发）→ 仍补发
      await this.notificationsService.create({
        userId,
        title: '事件提醒',
        body: event.title,
        type: 'reminder',
        targetType: 'event',
        targetId: String(eventId),
        link: `/events/${eventId}`,
      });
      // MINI-2：微信登录的小程序用户额外收订阅消息（未配置凭据/非微信用户自动降级）
      await this.wxSubscribeService.sendReminder(userId, event.title);
      this.logger.log(`[Reminder] notified user=${userId} about event=${eventId}`);
    } catch (err) {
      this.logger.warn(`[Reminder] job failed event=${eventId}: ${(err as Error).message}`);
    }
  }
}
