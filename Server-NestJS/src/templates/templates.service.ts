import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { User } from '../common/entities/user.entity';
import { EventsService } from '../events/events.service';
import { TodosService } from '../todos/todos.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CrmCustomer } from '../crm/crm-customer.entity';
import { CrmOrder } from '../crm/crm-order.entity';
import { CrmTask } from '../crm/crm-task.entity';
import { CrmRisk } from '../crm/crm-risk.entity';
import { PmProject } from '../pm/pm-project.entity';
import { PmTask } from '../pm/pm-task.entity';
import { PmRisk } from '../pm/pm-risk.entity';
import { ApprovalRequest } from '../approval/approval-request.entity';
import { ApprovalPolicy } from '../approval/approval-policy.entity';
import { APP_TEMPLATES, AppTemplate } from './templates';

/**
 * PL-9 模板市场：管理台一键导入内置示例模板。
 * 通用模板种事件/待办；P1-9 旗舰模板种 CRM/PM/Approval 实体（客户/订单/任务/风险、项目/任务/风险、政策/请求）。
 * 导入到指定用户（默认 admin），并通知导入完成。
 */
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(CrmCustomer) private readonly crmCustomers: Repository<CrmCustomer>,
    @InjectRepository(CrmOrder) private readonly crmOrders: Repository<CrmOrder>,
    @InjectRepository(CrmTask) private readonly crmTasks: Repository<CrmTask>,
    @InjectRepository(CrmRisk) private readonly crmRisks: Repository<CrmRisk>,
    @InjectRepository(PmProject) private readonly pmProjects: Repository<PmProject>,
    @InjectRepository(PmTask) private readonly pmTasks: Repository<PmTask>,
    @InjectRepository(PmRisk) private readonly pmRisks: Repository<PmRisk>,
    @InjectRepository(ApprovalRequest) private readonly appRequests: Repository<ApprovalRequest>,
    @InjectRepository(ApprovalPolicy) private readonly appPolicies: Repository<ApprovalPolicy>,
    private readonly eventsService: EventsService,
    private readonly todosService: TodosService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** 官方模板来源声明：基座版本（随发布更新） */
  private readonly keelbaseVersion = '1.0.0';

  listTemplates(): AppTemplate[] {
    // 来源身份（§13.1 ④ 铺路）：官方模板统一附 provenance——「官方模板都携带来源身份」示范，
    // 供 System AI Assistant（③）读模板时回答「这个模板基于什么」。
    return APP_TEMPLATES.map((t) => ({
      ...t,
      provenance: { source: 'keelbase', templateId: t.id, keelbaseVersion: this.keelbaseVersion },
    }));
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
    let customers = 0;
    let projects = 0;
    let requests = 0;
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

    // P1-9 旗舰模板：AI CRM（客户 + 订单/任务/风险）
    if (template.crm) {
      for (const c of template.crm.customers) {
        const customer = await this.crmCustomers.save({
          name: c.name,
          company: c.company,
          status: c.status ?? 'lead',
          riskLevel: c.riskLevel ?? 'low',
          annualValue: c.annualValue,
          userId: targetId,
        } as DeepPartial<CrmCustomer>);
        for (const o of c.orders ?? []) {
          await this.crmOrders.save(this.crmOrders.create({ customerId: customer.id, amount: o.amount, status: o.status, userId: targetId } as any));
        }
        for (const t of c.tasks ?? []) {
          await this.crmTasks.save(this.crmTasks.create({ customerId: customer.id, title: t.title, dueDate: t.dueDate, status: t.status, userId: targetId } as any));
        }
        for (const r of c.risks ?? []) {
          await this.crmRisks.save(this.crmRisks.create({ customerId: customer.id, level: r.level, reason: r.reason, userId: targetId } as any));
        }
        customers++;
      }
    }

    // P1-9 旗舰模板：AI Project（项目 + 任务/风险）
    if (template.pm) {
      for (const p of template.pm.projects) {
        const project = await this.pmProjects.save({
          name: p.name,
          description: p.description,
          status: p.status ?? 'planning',
          riskLevel: p.riskLevel ?? 'low',
          endDate: p.endDate,
          userId: targetId,
        } as DeepPartial<PmProject>);
        for (const t of p.tasks ?? []) {
          await this.pmTasks.save(this.pmTasks.create({ projectId: project.id, title: t.title, status: t.status, userId: targetId } as any));
        }
        for (const r of p.risks ?? []) {
          await this.pmRisks.save(this.pmRisks.create({ projectId: project.id, level: r.level, reason: r.reason, userId: targetId } as any));
        }
        projects++;
      }
    }

    // P1-9 旗舰模板：AI Approval（政策 + 请求）
    if (template.approval) {
      for (const p of template.approval.policies ?? []) {
        await this.appPolicies.save(this.appPolicies.create({ title: p.title, type: p.type, maxAmount: p.maxAmount, userId: targetId } as any));
      }
      for (const r of template.approval.requests ?? []) {
        await this.appRequests.save(
          this.appRequests.create({ title: r.title, type: r.type, amount: r.amount, reason: r.reason, status: r.status ?? 'pending', requesterId: targetId } as any),
        );
        requests++;
      }
    }

    const counts = [`${events} 事件`, `${todos} 待办`, ...(customers ? [`${customers} 客户`] : []), ...(projects ? [`${projects} 项目`] : []), ...(requests ? [`${requests} 审批`] : [])].join('、');
    await this.notificationsService
      .create({
        userId: targetId,
        title: `模板「${template.name}」已导入`,
        body: `已为你导入 ${counts}，作为示例数据。`,
        type: 'template_import',
      })
      .catch(() => {});

    this.logger.log(`[Templates] imported "${template.id}" → user ${targetId} (${counts})`);
    return { template: template.id, targetUserId: targetId, events, todos, customers, projects, requests };
  }

  private async resolveDefaultUser(): Promise<number | undefined> {
    // 优先 admin 账号，否则任意用户
    const admin = await this.usersRepo.findOne({ where: { username: 'admin' } });
    if (admin) return admin.id;
    const anyUser = await this.usersRepo.findOne({ where: {} });
    return anyUser?.id;
  }
}
