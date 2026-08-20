import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository, LessThanOrEqual } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { LlmProviderFactory } from '../ai/providers/provider-factory';

/**
 * AI-15 定时主动任务：从「被动回答」变「主动服务」。
 * 每日 8 点对有过数据的活跃用户生成「今日日程/待办」总结，经通知中心触达。
 *
 * - 无 LLM key 时降级为规则式总结（不依赖 LLM，仍可用）
 * - 无数据的用户跳过
 */
@Injectable()
export class ProactiveAiService {
  private readonly logger = new Logger(ProactiveAiService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(Todo) private readonly todosRepo: Repository<Todo>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    @Optional() private readonly providerFactory?: LlmProviderFactory,
  ) {}

  @Cron('0 8 * * *')
  async sendDailyDigest() {
    this.logger.log('[ProactiveAi] 每日主动摘要开始');
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // 只挑今天有日程/待办的用户，避免打扰无数据用户
    const [events, todos] = await Promise.all([
      // 查今天及以前开始的事件（含跨天），今日重叠由下方 JS 区间过滤；原精确等 dayStart 会漏掉几乎所有今日事件
      this.eventsRepo.find({ where: { startTime: LessThanOrEqual(dayEnd) } as any }),
      this.todosRepo.find({ where: { completed: false } }),
    ]);
    if (events.length === 0 && todos.length === 0) {
      this.logger.log('[ProactiveAi] 无今日数据，跳过');
      return;
    }

    // 聚合同一个用户今日事件（跨天事件今日也算）
    const eventUsers = new Map<number, Event[]>();
    for (const e of events) {
      if (e.userId == null) continue;
      if (e.startTime < dayEnd && (e.endTime ?? e.startTime) >= dayStart) {
        eventUsers.set(e.userId, [...(eventUsers.get(e.userId) ?? []), e]);
      }
    }
    const todoUsers = new Map<number, Todo[]>();
    for (const t of todos) {
      if (t.userId == null) continue;
      todoUsers.set(t.userId, [...(todoUsers.get(t.userId) ?? []), t]);
    }
    const userIds = new Set([...eventUsers.keys(), ...todoUsers.keys()]);
    if (userIds.size === 0) return;

    const users = await this.usersRepo.find({ where: { id: [...userIds] as any } });
    for (const user of users) {
      try {
        const userEvents = eventUsers.get(user.id) ?? [];
        const userTodos = todoUsers.get(user.id) ?? [];
        const body = await this.buildDigestBody(user, userEvents, userTodos);
        await this.notificationsService.create({
          userId: user.id,
          title: '今日日程速览',
          body,
          type: 'daily_digest',
        });
      } catch (err) {
        this.logger.warn(`[ProactiveAi] user ${user.id} digest failed: ${(err as Error).message}`);
      }
    }
    this.logger.log(`[ProactiveAi] 完成，推送 ${users.length} 人`);
  }

  private async buildDigestBody(user: User, events: Event[], todos: Todo[]): Promise<string> {
    const fmtTime = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    const eventLines = events
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .slice(0, 8)
      .map((e) => `${fmtTime(e.startTime)} ${e.title}`)
      .join('\n');
    const todoLines = todos.slice(0, 8).map((t) => `- ${t.title}`).join('\n');

    const ruleSummary =
      `今日 ${events.length} 个事件${todos.length ? `、${todos.length} 个待办` : ''}。` +
      (eventLines ? `\n${eventLines}` : '') +
      (todoLines ? `\n待办：\n${todoLines}` : '');

    // 尝试 LLM 润色；无 key 或失败时用规则式
    if (this.providerFactory) {
      try {
        const provider = this.providerFactory.getProvider(
          this.configService.get<string>('AI_PROVIDER', 'deepseek'),
        );
        const result = await provider.generate({
          messages: [
            {
              role: 'user',
              content:
                `请用友好简短的中文总结今天的日程（不超过 80 字）：\n${ruleSummary}`,
            },
          ],
          model: this.configService.get<string>('AI_CHAT_MODEL', 'deepseek-v4-flash'),
        });
        if (result.content?.trim()) return result.content.trim();
      } catch (err) {
        this.logger.warn(`[ProactiveAi] LLM 润色失败，用规则式：${(err as Error).message}`);
      }
    }
    return ruleSummary;
  }
}
