// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException, Inject, Optional, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import { PUSH_SERVICE, PushPayload } from '../push/push.service';
import type { PushService } from '../push/push.service';
import { PushTokenService } from '../push/push-token.service';
import { RealtimeService } from '../realtime/realtime.service';
import { withSpan } from '../common/tracing/tracer';

export interface PaginatedNotifications {
  items: Notification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateNotificationData {
  userId: number;
  title: string;
  body?: string;
  type?: string;
  targetType?: string;
  targetId?: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
    private notificationsGateway: NotificationsGateway,
    @Inject(PUSH_SERVICE) private pushService: PushService,
    private pushTokenService: PushTokenService,
    @Optional() @InjectQueue('push') private readonly pushQueue: Queue | null,
    private readonly configService: ConfigService,
    private readonly realtime: RealtimeService,
  ) {}

  /** 供其他模块调用：创建一条通知，并实时推送（SSE + 设备推送） */
  async create(data: CreateNotificationData): Promise<Notification> {
    return withSpan('notification.create', async () => {
      return this.createImpl(data);
    }, {
      'notification.user_id': data.userId,
      'notification.type': data.type,
      'notification.target_type': data.targetType,
    });
  }

  private async createImpl(data: CreateNotificationData): Promise<Notification> {
    const notification = this.notificationsRepository.create({
      userId: data.userId,
      title: data.title,
      body: data.body,
      type: data.type ?? 'system',
      targetType: data.targetType,
      targetId: data.targetId,
      link: data.link,
      isRead: false,
    });
    const saved = await this.notificationsRepository.save(notification);
    this.notificationsGateway.emitToUser(data.userId, {
      id: saved.id,
      title: saved.title,
      body: saved.body,
      type: saved.type,
      targetType: saved.targetType,
      targetId: saved.targetId,
      createdAt: saved.createdAt,
    });
    // RG-6：WS 通道同样实时推送（SSE 并存）
    this.realtime.emitToUser(data.userId, 'notification', {
      id: saved.id,
      title: saved.title,
      body: saved.body,
      type: saved.type,
      targetType: saved.targetType,
      targetId: saved.targetId,
      createdAt: saved.createdAt,
    });
    // 设备推送（入队异步；QUEUE_ENABLED=false 降级同步）
    await this._pushToDevices(data.userId, saved.title, saved.body, saved.type, saved.link, saved.targetType, saved.targetId);
    return saved;
  }

  private async _pushToDevices(
    userId: number,
    title: string,
    body?: string | null,
    type?: string | null,
    link?: string | null,
    targetType?: string | null,
    targetId?: string | null,
  ): Promise<void> {
    try {
      const queued = this.configService.get<boolean>('QUEUE_ENABLED', true);
      if (queued && this.pushQueue) {
        await this.pushQueue.add('send', { userId, title, body, type, link, targetType, targetId }, { removeOnComplete: true });
        return;
      }
      // 降级：同步执行（同 PushProcessor 逻辑）
      await this._doPush(userId, title, body, type, link, targetType, targetId);
    } catch (err) {
      this.logger.warn(`[Push] enqueue failed: ${(err as Error).message}`);
    }
  }

  private async _doPush(
    userId: number,
    title: string,
    body?: string | null,
    type?: string | null,
    link?: string | null,
    targetType?: string | null,
    targetId?: string | null,
  ): Promise<void> {
    const tokens = await this.pushTokenService.getTokensForUser(userId);
    if (tokens.length === 0) return;
    const payload: PushPayload = {
      title,
      body: body ?? '',
      data: {
        ...(type ? { type } : {}),
        ...(link ? { link } : {}),
        ...(targetType ? { targetType } : {}),
        ...(targetId ? { targetId } : {}),
      },
    };
    await Promise.all(
      tokens.map((t) =>
        this.pushService.sendToDevice(t.token, payload).catch((err) => {
          this.logger.warn(`[Push] send failed to ${t.token?.slice(0, 8)}...: ${(err as Error).message}`);
        }),
      ),
    );
  }

  async findAll(
    userId: number,
    page = 1,
    limit = 20,
  ): Promise<PaginatedNotifications> {
    // CR-19：limit 钳制 1-100，防超大值全表拉取
    page = Math.max(1, page);
    limit = Math.min(Math.max(limit, 1), 100);
    const [items, total] = await this.notificationsRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async unreadCount(userId: number): Promise<number> {
    return this.notificationsRepository.count({
      where: { userId, isRead: false },
    });
  }

  async markRead(id: number, userId: number): Promise<void> {
    const notification = await this.findOwned(id, userId);
    if (notification.isRead) return;
    await this.notificationsRepository.update(id, { isRead: true });
  }

  async markAllRead(userId: number): Promise<void> {
    await this.notificationsRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  async remove(id: number, userId: number): Promise<void> {
    const notification = await this.findOwned(id, userId);
    await this.notificationsRepository.delete(notification.id);
  }

  private async findOwned(id: number, userId: number): Promise<Notification> {
    const notification = await this.notificationsRepository.findOne({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('无权访问此通知');
    }
    return notification;
  }
}
