import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../common/entities/user.entity';
import { EventsService } from '../events/events.service';
import { TodosService } from '../todos/todos.service';
import { NotificationsService } from '../notifications/notifications.service';
import { APP_TEMPLATES, AppTemplate } from './templates';

/**
 * PL-9 模板市场：管理台一键导入内置示例模板（事件/待办种子数据）。
 * 导入到指定用户（默认 admin），并通知导入完成。
 */
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly eventsService: EventsService,
    private readonly todosService: TodosService,
    private readonly notificationsService: NotificationsService,
  ) {}

  listTemplates(): AppTemplate[] {
    return APP_TEMPLATES;
  }

  async importTemplate(templateId: string, targetUserId?: number) {
    const template = APP_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      throw new NotFoundException(`模板 ${templateId} 不存在`);
    }

    const targetId = targetUserId ?? (await this.resolveDefaultUser());
    if (!targetId) {
      throw new NotFoundException('无可用用户，无法导入');
    }

    let events = 0;
    let todos = 0;
    for (const e of template.events) {
      await this.eventsService.create(
        {
          title: e.title,
          description: e.description,
          startTime: e.startTime,
          endTime: e.endTime,
          location: e.location,
          isCancelled: e.isCancelled,
          reminderMinutes: e.reminderMinutes,
        } as any,
        targetId,
      );
      events++;
    }
    for (const t of template.todos) {
      await this.todosService.create(
        {
          title: t.title,
          description: t.description,
          completed: t.completed,
          dueDate: t.dueDate,
        } as any,
        targetId,
      );
      todos++;
    }

    await this.notificationsService
      .create({
        userId: targetId,
        title: `模板「${template.name}」已导入`,
        body: `已为你导入 ${events} 个事件、${todos} 个待办，作为示例数据。`,
        type: 'template_import',
      })
      .catch(() => {});

    this.logger.log(`[Templates] imported "${template.id}" → user ${targetId} (${events} events, ${todos} todos)`);
    return { template: template.id, targetUserId: targetId, events, todos };
  }

  private async resolveDefaultUser(): Promise<number | undefined> {
    // 优先 admin 账号，否则任意用户
    const admin = await this.usersRepo.findOne({ where: { username: 'admin' } });
    if (admin) return admin.id;
    const anyUser = await this.usersRepo.findOne({ where: {} });
    return anyUser?.id;
  }
}
