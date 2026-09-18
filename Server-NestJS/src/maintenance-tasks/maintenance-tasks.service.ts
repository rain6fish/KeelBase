// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserSession } from '../auth/user-session.entity';
import { PhoneVerificationCode } from '../auth/phone-verification-code.entity';
import { User, UserRole } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfirmationStore } from '../ai/confirmation/confirmation.store';
import { BehaviorBaselineService } from '../ai/behavior-baseline/behavior-baseline.service';
import { AlertWebhookService } from '../alert-webhook/alert-webhook.service';

/**
 * 定时任务（PL-7，@nestjs/schedule cron）。
 * 区别于 3.2 BullMQ 延迟任务：这里是周期清理/快照等后台维护任务。
 */
@Injectable()
export class MaintenanceTasksService {
  private readonly logger = new Logger(MaintenanceTasksService.name);

  constructor(
    @InjectRepository(UserSession) private readonly sessionsRepo: Repository<UserSession>,
    @InjectRepository(PhoneVerificationCode) private readonly phoneCodesRepo: Repository<PhoneVerificationCode>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(Todo) private readonly todosRepo: Repository<Todo>,
    @InjectRepository(Notification) private readonly notificationsRepo: Repository<Notification>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    // GA 待我确认中心：离线窗口到期的确认转 timeout（与对话内等待共用同一个 store 实例）
    private readonly confirmationStore: ConfirmationStore,
    // BA 异常行为基线：定时扫描（只读审计与副作用表；不阻断任何动作）
    private readonly behaviorBaseline: BehaviorBaselineService,
    private readonly alertWebhook: AlertWebhookService,
  ) {}

  /**
   * GA：把超过**离线待办窗口**仍 `pending` 的确认转 `timeout`（confirmation-lifecycle v2）。
   * 对话内等待（60s）结束时**不再**改 DB——行的生死由这条清理决定；窗口值取自 store（单源）。
   * 每小时一次：窗口是小时级（默认 24h），无需更密。
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleConfirmations() {
    const ttlMs = await this.confirmationStore.offlineTtlMs();
    const expired = await this.confirmationStore.expireStale(ttlMs);
    if (expired > 0) {
      this.logger.log(`确认离线窗口到期：${expired} 条 pending → timeout`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredData() {
    const now = new Date();

    const sessions = await this.sessionsRepo.delete({ expiresAt: LessThan(now) });
    const phoneCodes = await this.phoneCodesRepo.delete({ expiresAt: LessThan(now) });

    await this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ emailVerificationCode: null, emailVerificationExpiresAt: null })
      .where('email_verification_expires_at IS NOT NULL AND email_verification_expires_at < :now', { now })
      .execute();

    await this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ resetTokenHash: null, resetTokenExpiresAt: null })
      .where('reset_token_expires_at IS NOT NULL AND reset_token_expires_at < :now', { now })
      .execute();

    // 过期登录锁定 → 重置失败计数
    await this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ loginAttempts: 0, lockedUntil: null })
      .where('locked_until IS NOT NULL AND locked_until < :now', { now })
      .execute();

    // 已读通知保留期清理
    const retentionDays = this.configService.get<number>('NOTIFICATION_RETENTION_DAYS', 30);
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 3600 * 1000);
    const notifications = await this.notificationsRepo.delete({
      isRead: true,
      createdAt: LessThan(cutoff),
    });

    this.logger.log(
      `清理过期数据完成: sessions=${sessions.affected ?? 0} phoneCodes=${phoneCodes.affected ?? 0} readNotifications=${notifications.affected ?? 0}`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyStatsSnapshot() {
    const [users, events, todos, notifications] = await Promise.all([
      this.usersRepo.count(),
      this.eventsRepo.count(),
      this.todosRepo.count(),
      this.notificationsRepo.count(),
    ]);

    const body = `用户 ${users} · 事件 ${events} · 待办 ${todos} · 通知 ${notifications}`;
    this.logger.log(`每日统计快照: ${body}`);

    const admins = await this.usersRepo.find({ where: { role: UserRole.ADMIN } });
    for (const admin of admins) {
      await this.notificationsService.create({
        userId: admin.id,
        title: '每日平台快照',
        body,
        type: 'daily_snapshot',
      });
    }
  }

  /**
   * BA 异常行为基线：定时扫出异常 AI 行为并告警（docs/ai-behavior-baseline.spec.md）。
   *
   * 只**读**审计与副作用表；命中则落库（scan 内部）+ 通知管理员 + webhook。**不阻断任何动作**——
   * 本任务与门控完全分离，跑挂了也不影响 AI 能不能做事。
   * 10 分钟一轮，与扫描窗口（默认 10 分钟）同量级，相邻窗口之间不留大段空白。
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async scanAiBehaviorBaseline() {
    const alerts = await this.behaviorBaseline.scan();
    if (alerts.length === 0) return;

    const admins = await this.usersRepo.find({ where: { role: UserRole.ADMIN } });
    for (const alert of alerts) {
      const title = `AI 行为异常（${alert.rule}）`;
      for (const admin of admins) {
        await this.notificationsService.create({
          userId: admin.id,
          title,
          body: alert.detail,
          type: 'ai_anomaly_alert',
        });
      }
      // 对外通道：未配 ALERT_WEBHOOK_URL 时 sendAlert 自带静默跳过
      await this.alertWebhook.sendAlert(title, alert.detail, {
        rule: alert.rule,
        level: alert.level,
        subjectKind: alert.subjectKind,
        subjectId: alert.subjectId,
        conversationId: alert.conversationId ?? null,
      });
    }
  }
}
