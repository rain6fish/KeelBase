// SPDX-License-Identifier: Apache-2.0

/**
 * AI CRM 分析域（阶段 3 第十三刀：从 `CrmService` 拆出的派生读）。
 *
 * 回答的是「从已有 CRM 数据里能算出什么」——**风险打分**（analyze_customer_risk 工具核心）、
 * **长期未跟进检测**（AI Follow-up Agent）、**业务全景看板**（AI Intelligence Dashboard）、
 * **跨客户管道读取**（AI Sales Agent）。它们**只读不写**：不算 CRUD，不做所有权以外的策略判断。
 *
 * 与 `CrmService` 的分工：那个管「客户与子资源的增删改查」，本域管「算」。两者共用同一条
 * **归属校验**（{@link assertCustomerOwner}）——安全谓词只有一处实现，复制会让两条路径的判据分叉。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { CrmCustomer, RiskLevel } from './crm-customer.entity';
import { CrmOrder } from './crm-order.entity';
import { CrmActivity } from './crm-activity.entity';
import { CrmTask } from './crm-task.entity';
import { CrmRisk } from './crm-risk.entity';
import { CrmOpportunity } from './crm-opportunity.entity';
import { assertCustomerOwner } from './customer-ownership';
import { formatMoney } from '../common/utils/money';

export interface RiskAnalysis {
  /** 风险等级：与客户 riskLevel 同一词汇（`crm-customer.entity` 的 RISK_LEVELS 单一来源） */
  level: RiskLevel;
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

@Injectable()
export class CrmAnalyticsService {
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
  ) {}

  /** 用户全部销售机会（AI Sales Agent 管道分析用，跨客户聚合） */
  async listAllOpportunities(userId: number): Promise<CrmOpportunity[]> {
    return this.opportunities.find({ where: { userId }, order: { expectedCloseDate: 'ASC' } });
  }

  /**
   * AI Intelligence Dashboard（§10 P0）：聚合用户 CRM 业务全景——客户/风险/管道/逾期/跟进/风险。
   * 供 Dashboard 卡片呈现（纯后端统计，无 LLM）。
   */
  async getDashboard(userId: number) {
    const [customers, opportunities, orders, tasks, risks] = await Promise.all([
      this.customers.find({ where: { userId } }),
      this.listAllOpportunities(userId),
      this.orders.find({ where: { userId } }),
      this.tasks.find({ where: { userId } }),
      this.risks.find({ where: { userId } }),
    ]);

    const openStages = new Set(['qualification', 'proposal', 'negotiation']);
    const open = opportunities.filter((o) => openStages.has(o.stage));
    const pipelineAmount = open.reduce((s, o) => s + o.amount, 0);
    const weightedAmount = open.reduce((s, o) => s + o.amount * (o.probability / 100), 0);

    const now = Date.now();
    const soonClosing = open
      .filter((o) => o.expectedCloseDate && o.expectedCloseDate.getTime() - now <= 30 * 86400000 && o.expectedCloseDate.getTime() >= now)
      .length;

    return {
      customers: customers.length,
      highRiskCustomers: customers.filter((c) => c.riskLevel === 'high' || c.riskLevel === 'critical').length,
      opportunities: opportunities.length,
      pipelineAmount: Math.round(pipelineAmount),
      weightedAmount: Math.round(weightedAmount),
      soonClosing,
      overdueOrders: orders.filter((o) => o.status === 'overdue').length,
      openTasks: tasks.filter((t) => t.status !== 'completed').length,
      openRisks: risks.filter((r) => !r.resolvedAt).length,
    };
  }

  // ── 风险分析（analyze_customer_risk 工具核心逻辑）───────────

  /** 计算客户风险：逾期订单 + 高价值订单 + 逾期任务 + 未解决风险 + 客户状态 */
  async analyzeRisk(customerId: number, userId: number): Promise<RiskAnalysis> {
    const customer = await assertCustomerOwner(this.customers, customerId, userId);
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
        reasons.push(`逾期金额较大（${formatMoney(overdueAmount)}）`);
      }
      reasons.push(`${overdueOrders.length} 笔订单逾期（合计 ${formatMoney(overdueAmount)}）`);
    }
    if (totalAmount > 500_000) {
      score += 2;
      reasons.push(`累计订单金额高（${formatMoney(totalAmount)}）`);
    } else if (totalAmount > 100_000) {
      score += 1;
      reasons.push(`累计订单金额较高（${formatMoney(totalAmount)}）`);
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
  // ── AI Follow-up Agent：长期未跟进客户检测（activity 派生最近联系时间，无迁移）──

  /**
   * 检测长期未跟进客户（AI Follow-up Agent，A1）：
   * 最近联系时间 = 该客户 crm_activities.happenedAt 的最大值（call/meeting/email/note 全部类型）。
   * 从未联系（无任何 activity）同样命中「需跟进」。仅请求用户本人数据范围，无迁移。
   */
  async detectIdleCustomers(
    userId: number,
    minIdleDays = 30,
    limit = 20,
  ): Promise<{
    thresholdDays: number;
    count: number;
    items: Array<{
      customerId: number;
      customerName: string;
      company: string | null;
      status: string;
      riskLevel: string;
      lastContactAt: string | null;
      idleDays: number | null;
      neverContacted: boolean;
    }>;
  }> {
    const cap = Math.min(Math.max(limit, 1), 50);
    const [customers, activities] = await Promise.all([
      this.customers.find({ where: { userId }, order: { createdAt: 'ASC' } }),
      this.activities.find({ where: { userId } }),
    ]);
    const lastContactByCustomer = new Map<number, Date>();
    for (const a of activities) {
      const prev = lastContactByCustomer.get(a.customerId);
      if (!prev || a.happenedAt.getTime() > prev.getTime()) {
        lastContactByCustomer.set(a.customerId, a.happenedAt);
      }
    }
    const now = Date.now();
    const scored = customers.map((c) => {
      const lastContactAt = lastContactByCustomer.get(c.id) ?? null;
      const idleDays = lastContactAt
        ? Math.floor((now - lastContactAt.getTime()) / 86400000)
        : null;
      return {
        createdAtMs: c.createdAt ? c.createdAt.getTime() : 0,
        item: {
          customerId: c.id,
          customerName: c.name,
          company: c.company ?? null,
          status: c.status,
          riskLevel: c.riskLevel,
          lastContactAt: lastContactAt ? lastContactAt.toISOString() : null,
          idleDays,
          neverContacted: lastContactAt == null,
        },
      };
    });
    const matched = scored.filter(
      (s) => s.item.neverContacted || (s.item.idleDays != null && s.item.idleDays >= minIdleDays),
    );
    // count = 真实命中待跟进数（截断前）——若在 slice 之后算 items.length，命中超 limit 时会低估存量、误导 LLM 汇总
    const count = matched.length;
    const items = matched
      .sort((a, b) => {
        // 从未联系最优先 → idleDays 降序；从未联系内部按 createdAt 升序（越早建立越该优先，spec §2.1）
        if (a.item.neverContacted !== b.item.neverContacted) return a.item.neverContacted ? -1 : 1;
        if (a.item.idleDays == null || b.item.idleDays == null) {
          if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
          return 0;
        }
        return (b.item.idleDays as number) - (a.item.idleDays as number);
      })
      .slice(0, cap)
      .map((s) => s.item);
    return { thresholdDays: minIdleDays, count, items };
  }
}
