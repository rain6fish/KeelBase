import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { subject } from '@casl/ability';
import { CrmCustomer } from './crm-customer.entity';
import { CrmOrder } from './crm-order.entity';
import { CrmActivity } from './crm-activity.entity';
import { CrmTask } from './crm-task.entity';
import { CrmRisk } from './crm-risk.entity';
import { CrmOpportunity, OPPORTUNITY_STAGES } from './crm-opportunity.entity';
import { CrmContact } from './crm-contact.entity';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/create-customer.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateRiskDto } from './dto/create-risk.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

/** 客户列表筛选 */
export interface CustomerFilter {
  page?: number;
  limit?: number;
  status?: string;
  riskLevel?: string;
  keyword?: string;
}

export interface RiskAnalysis {
  level: string;
  score: number;
  reasons: string[];
  dataPoints: {
    orderCount: number;
    overdueOrders: number;
    openRisks: number;
    lateTasks: number;
    totalAmount: number;
  };
}

/**
 * AI CRM：客户 / 订单 / 跟进 / 任务 / 风险 服务。
 * 所有权 = userId（本人 / 管理员经 CASL），AI 工具按同一数据范围运行。
 */
@Injectable()
export class CrmService {
  constructor(
    @InjectRepository(CrmCustomer)
    private readonly customers: Repository<CrmCustomer>,
    @InjectRepository(CrmOrder)
    private readonly orders: Repository<CrmOrder>,
    @InjectRepository(CrmActivity)
    private readonly activities: Repository<CrmActivity>,
    @InjectRepository(CrmTask)
    private readonly tasks: Repository<CrmTask>,
    @InjectRepository(CrmRisk)
    private readonly risks: Repository<CrmRisk>,
    @InjectRepository(CrmOpportunity)
    private readonly opportunities: Repository<CrmOpportunity>,
    @InjectRepository(CrmContact)
    private readonly contacts: Repository<CrmContact>,
  ) {}

  // ── Customer CRUD ─────────────────────────────────────────

  async createCustomer(
    dto: CreateCustomerDto,
    userId: number,
  ): Promise<CrmCustomer> {
    const entity = this.customers.create({ ...dto, userId });
    return this.customers.save(entity);
  }

  async listCustomers(
    userId: number,
    filter: CustomerFilter = {},
  ): Promise<{ items: CrmCustomer[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const qb = this.customers
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filter.status) qb.andWhere('c.status = :status', { status: filter.status });
    if (filter.riskLevel) qb.andWhere('c.riskLevel = :riskLevel', { riskLevel: filter.riskLevel });
    if (filter.keyword) {
      qb.andWhere('(c.name LIKE :kw OR c.company LIKE :kw OR c.email LIKE :kw)', {
        kw: `%${filter.keyword}%`,
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getCustomer(id: number, ability: AppAbility): Promise<CrmCustomer> {
    const entity = await this.customers.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('客户不存在');
    if (ability.cannot('read', subject('CrmCustomer', entity))) {
      throw new ForbiddenException('无权访问此客户');
    }
    return entity;
  }

  async updateCustomer(
    id: number,
    dto: UpdateCustomerDto,
    ability: AppAbility,
  ): Promise<CrmCustomer> {
    const entity = await this.getCustomer(id, ability);
    Object.assign(entity, dto);
    return this.customers.save(entity);
  }

  async removeCustomer(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.getCustomer(id, ability);
    await this.customers.softDelete(entity.id);
  }

  /** 客户详情聚合：客户 + 订单 + 跟进 + 任务 + 风险（Flutter 详情页一次请求） */
  async getCustomerDetail(
    id: number,
    ability: AppAbility,
  ): Promise<{
    customer: CrmCustomer;
    orders: CrmOrder[];
    activities: CrmActivity[];
    tasks: CrmTask[];
    risks: CrmRisk[];
    opportunities: CrmOpportunity[];
    contacts: CrmContact[];
  }> {
    const customer = await this.getCustomer(id, ability);
    const userId = customer.userId!;
    const [orders, activities, tasks, risks, opportunities, contacts] = await Promise.all([
      this.orders.find({ where: { customerId: id, userId }, order: { orderDate: 'DESC' } }),
      this.activities.find({ where: { customerId: id, userId }, order: { happenedAt: 'DESC' } }),
      this.tasks.find({ where: { customerId: id, userId }, order: { createdAt: 'DESC' } }),
      this.risks.find({ where: { customerId: id, userId }, order: { detectedAt: 'DESC' } }),
      this.opportunities.find({ where: { customerId: id, userId }, order: { expectedCloseDate: 'ASC' } }),
      this.contacts.find({ where: { customerId: id, userId }, order: { isPrimary: 'DESC' } }),
    ]);
    return { customer, orders, activities, tasks, risks, opportunities, contacts };
  }

  /**
   * Customer 360 全景数据（AI Summary 工具用）：所有权校验后聚合全部子资源。
   * 与 getCustomerDetail 不同——不依赖 CASL ability，直接以 userId 校验归属（AI 工具无 ability 对象）。
   */
  async getCustomer360Data(
    customerId: number,
    userId: number,
  ): Promise<{
    customer: CrmCustomer | null;
    orders: CrmOrder[];
    activities: CrmActivity[];
    tasks: CrmTask[];
    risks: CrmRisk[];
    opportunities: CrmOpportunity[];
    contacts: CrmContact[];
  }> {
    await this._assertCustomerOwner(customerId, userId);
    const [orders, activities, tasks, risks, opportunities, contacts, customer] = await Promise.all([
      this.orders.find({ where: { customerId, userId }, order: { orderDate: 'DESC' } }),
      this.activities.find({ where: { customerId, userId }, order: { happenedAt: 'DESC' } }),
      this.tasks.find({ where: { customerId, userId }, order: { createdAt: 'DESC' } }),
      this.risks.find({ where: { customerId, userId }, order: { detectedAt: 'DESC' } }),
      this.opportunities.find({ where: { customerId, userId }, order: { expectedCloseDate: 'ASC' } }),
      this.contacts.find({ where: { customerId, userId }, order: { isPrimary: 'DESC' } }),
      this.customers.findOne({ where: { id: customerId, userId } }),
    ]);
    return { customer, orders, activities, tasks, risks, opportunities, contacts };
  }

  // ── Children（订单 / 跟进 / 任务 / 风险）────────────────────

  private async _assertCustomerOwner(
    customerId: number,
    userId: number,
  ): Promise<CrmCustomer> {
    const customer = await this.customers.findOne({ where: { id: customerId, userId } });
    if (!customer) throw new NotFoundException('客户不存在或无权访问');
    return customer;
  }

  async listOrders(customerId: number, userId: number): Promise<CrmOrder[]> {
    await this._assertCustomerOwner(customerId, userId);
    return this.orders.find({ where: { customerId, userId }, order: { orderDate: 'DESC' } });
  }

  async createOrder(
    customerId: number,
    dto: CreateOrderDto,
    userId: number,
  ): Promise<CrmOrder> {
    await this._assertCustomerOwner(customerId, userId);
    return this.orders.save(
      this.orders.create({
        ...dto,
        orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        customerId,
        userId,
      }),
    );
  }

  // ── Customer 360：销售机会（P0 §10，Opportunity）──────────────

  async listOpportunities(customerId: number, userId: number): Promise<CrmOpportunity[]> {
    await this._assertCustomerOwner(customerId, userId);
    return this.opportunities.find({ where: { customerId, userId }, order: { expectedCloseDate: 'ASC' } });
  }

  async createOpportunity(
    customerId: number,
    dto: CreateOpportunityDto,
    userId: number,
  ): Promise<CrmOpportunity> {
    await this._assertCustomerOwner(customerId, userId);
    return this.opportunities.save(
      this.opportunities.create({
        ...dto,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        customerId,
        userId,
      }),
    );
  }

  async updateOpportunity(
    customerId: number,
    opportunityId: number,
    dto: UpdateOpportunityDto,
    userId: number,
  ): Promise<CrmOpportunity> {
    await this._assertCustomerOwner(customerId, userId);
    const opp = await this.opportunities.findOne({ where: { id: opportunityId, customerId, userId } });
    if (!opp) throw new NotFoundException('销售机会不存在或无权访问');
    Object.assign(opp, {
      ...dto,
      expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
    });
    return this.opportunities.save(opp);
  }

  async removeOpportunity(
    customerId: number,
    opportunityId: number,
    userId: number,
  ): Promise<void> {
    await this._assertCustomerOwner(customerId, userId);
    const opp = await this.opportunities.findOne({ where: { id: opportunityId, customerId, userId } });
    if (!opp) throw new NotFoundException('销售机会不存在或无权访问');
    await this.opportunities.remove(opp);
  }

  // ── Customer 360：联系人（P0 §10，Contact）───────────────

  async listContacts(customerId: number, userId: number): Promise<CrmContact[]> {
    await this._assertCustomerOwner(customerId, userId);
    return this.contacts.find({ where: { customerId, userId }, order: { isPrimary: 'DESC' } });
  }

  async createContact(
    customerId: number,
    dto: CreateContactDto,
    userId: number,
  ): Promise<CrmContact> {
    await this._assertCustomerOwner(customerId, userId);
    return this.contacts.save(this.contacts.create({ ...dto, customerId, userId }));
  }

  async updateContact(
    customerId: number,
    contactId: number,
    dto: UpdateContactDto,
    userId: number,
  ): Promise<CrmContact> {
    await this._assertCustomerOwner(customerId, userId);
    const contact = await this.contacts.findOne({ where: { id: contactId, customerId, userId } });
    if (!contact) throw new NotFoundException('联系人不存在或无权访问');
    Object.assign(contact, dto);
    return this.contacts.save(contact);
  }

  async removeContact(customerId: number, contactId: number, userId: number): Promise<void> {
    await this._assertCustomerOwner(customerId, userId);
    const contact = await this.contacts.findOne({ where: { id: contactId, customerId, userId } });
    if (!contact) throw new NotFoundException('联系人不存在或无权访问');
    await this.contacts.remove(contact);
  }

  async listActivities(customerId: number, userId: number): Promise<CrmActivity[]> {
    await this._assertCustomerOwner(customerId, userId);
    return this.activities.find({ where: { customerId, userId }, order: { happenedAt: 'DESC' } });
  }

  async createActivity(
    customerId: number,
    dto: CreateActivityDto,
    userId: number,
  ): Promise<CrmActivity> {
    await this._assertCustomerOwner(customerId, userId);
    return this.activities.save(
      this.activities.create({
        ...dto,
        customerId,
        userId,
        happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : new Date(),
      }),
    );
  }

  /** 任务列表（可按客户过滤；AI 写工具 create_followup_task 复用） */
  async listTasks(
    userId: number,
    customerId?: number,
  ): Promise<{ items: CrmTask[]; total: number }> {
    const where: Record<string, unknown> = { userId };
    if (customerId) where.customerId = customerId;
    const [items, total] = await this.tasks.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return { items, total };
  }

  /** 创建跟进任务（AI 写工具 create_followup_task 的目标；customerId 可选） */
  async createTask(
    dto: CreateTaskDto,
    userId: number,
  ): Promise<CrmTask> {
    if (dto.customerId != null) {
      await this._assertCustomerOwner(Number(dto.customerId), userId);
    }
    return this.tasks.save(
      this.tasks.create({
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        userId,
      }),
    );
  }

  async completeTask(id: number, userId: number): Promise<CrmTask> {
    const task = await this.tasks.findOne({ where: { id, userId } });
    if (!task) throw new NotFoundException('任务不存在');
    task.status = 'completed';
    return this.tasks.save(task);
  }

  async listRisks(customerId: number, userId: number): Promise<CrmRisk[]> {
    await this._assertCustomerOwner(customerId, userId);
    return this.risks.find({ where: { customerId, userId }, order: { detectedAt: 'DESC' } });
  }

  async createRisk(
    customerId: number,
    dto: CreateRiskDto,
    userId: number,
  ): Promise<CrmRisk> {
    await this._assertCustomerOwner(customerId, userId);
    return this.risks.save(
      this.risks.create({
        ...dto,
        customerId,
        userId,
        detectedAt: dto.detectedAt ? new Date(dto.detectedAt) : new Date(),
        resolvedAt: dto.resolvedAt ? new Date(dto.resolvedAt) : undefined,
      }),
    );
  }

  // ── 风险分析（analyze_customer_risk 工具核心逻辑）───────────

  /** 计算客户风险：逾期订单 + 高价值订单 + 逾期任务 + 未解决风险 + 客户状态 */
  async analyzeRisk(customerId: number, userId: number): Promise<RiskAnalysis> {
    const customer = await this._assertCustomerOwner(customerId, userId);
    const today = new Date();
    const [orders, tasks, risks] = await Promise.all([
      this.orders.find({ where: { customerId, userId } }),
      this.tasks.find({ where: { customerId, userId } }),
      this.risks.find({ where: { customerId, userId, resolvedAt: IsNull() } }),
    ]);

    const overdueOrders = orders.filter(
      (o) =>
        o.status === 'overdue' ||
        (o.status === 'pending' &&
          o.dueDate != null &&
          new Date(o.dueDate) < today),
    );
    const lateTasks = tasks.filter(
      (t) => t.status === 'pending' && t.dueDate != null && new Date(t.dueDate) < today,
    );
    const totalAmount = orders.reduce((s, o) => s + (o.amount || 0), 0);

    const reasons: string[] = [];
    let score = 0;

    if (overdueOrders.length > 0) {
      const overdueAmount = overdueOrders.reduce((s, o) => s + (o.amount || 0), 0);
      for (const o of overdueOrders) {
        // 大额逾期（>100 万）权重更高，命中旗舰演示「极危客户」
        score += (o.amount || 0) > 1_000_000 ? 5 : 3;
      }
      if (overdueAmount > 500_000) {
        score += 2;
        reasons.push(`逾期金额较大（¥${overdueAmount.toFixed(2)}）`);
      }
      reasons.push(`${overdueOrders.length} 笔订单逾期（合计 ¥${overdueAmount.toFixed(2)}）`);
    }
    if (totalAmount > 500_000) {
      score += 2;
      reasons.push(`累计订单金额高（¥${totalAmount.toFixed(2)}）`);
    } else if (totalAmount > 100_000) {
      score += 1;
      reasons.push(`累计订单金额较高（¥${totalAmount.toFixed(2)}）`);
    }
    if (lateTasks.length > 0) {
      score += 2;
      reasons.push(`${lateTasks.length} 个跟进任务逾期未完成`);
    }
    if (risks.length > 0) {
      score += 2;
      reasons.push(`${risks.length} 条未解决的风险记录`);
    }
    if (customer.status === 'churn_risk') {
      score += 2;
      reasons.push('客户已被标记为流失风险');
    } else if (customer.status === 'inactive') {
      score += 1;
      reasons.push('客户已停止合作（inactive）');
    } else if (customer.status === 'lead') {
      score += 1;
      reasons.push('仍处于初步接触阶段（lead）');
    }

    const level = score >= 10 ? 'critical' : score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';
    return {
      level,
      score,
      reasons,
      dataPoints: {
        orderCount: orders.length,
        overdueOrders: overdueOrders.length,
        openRisks: risks.length,
        lateTasks: lateTasks.length,
        totalAmount: Number(totalAmount.toFixed(2)),
      },
    };
  }
}
