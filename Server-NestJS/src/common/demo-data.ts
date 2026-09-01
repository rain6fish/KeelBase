// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { Event } from '../events/event.entity';
import { EventColorRole } from '../events/event-color-role.enum';
import { Todo } from '../todos/todo.entity';
import { KnowledgeArticle } from '../ai/rag/knowledge-article.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { AiMessage } from '../ai/conversation/ai-message.entity';
import { Notification } from '../notifications/notification.entity';
import { CrmCustomer } from '../crm/crm-customer.entity';
import { CrmOrder } from '../crm/crm-order.entity';
import { CrmActivity } from '../crm/crm-activity.entity';
import { CrmTask } from '../crm/crm-task.entity';
import { CrmRisk } from '../crm/crm-risk.entity';
import { PmProject } from '../pm/pm-project.entity';
import { PmMilestone } from '../pm/pm-milestone.entity';
import { PmTask } from '../pm/pm-task.entity';
import { PmRisk } from '../pm/pm-risk.entity';
import { ApprovalRequest } from '../approval/approval-request.entity';
import { ApprovalPolicy } from '../approval/approval-policy.entity';
import { Contract } from '../contracts/contract.entity';
import { Supplier } from '../suppliers/supplier.entity';
import { Tag } from '../tags/tag.entity';
import { Note } from '../notes/note.entity';
import { Book } from '../books/book.entity';
import { Post } from '../posts/post.entity';
import { PostComment } from '../posts/post-comment.entity';
import { PostLike } from '../posts/post-like.entity';
import { UserFollow } from '../posts/user-follow.entity';
import { AiAgent } from '../ai/agents/ai-agent.entity';
import { FlowDefinition } from '../flows/entities/flow-definition.entity';
import { FlowInstance } from '../flows/entities/flow-instance.entity';
import { FlowTask } from '../flows/entities/flow-task.entity';
import { FormSchema } from '../form-builder/form-schema.entity';
import { FormSubmission } from '../form-builder/form-submission.entity';
import { PointsEntry } from '../points/points-entry.entity';
import { CrmContact } from '../crm/crm-contact.entity';
import { CrmOpportunity } from '../crm/crm-opportunity.entity';
import { User } from './entities/user.entity';

/**
 * 演示数据（PM-2 / DX-1）：为指定用户生成丰富的样例数据，
 * 让登录后界面有内容、直观展示全栈基座能力。
 *
 * 幂等：目标用户已有事件/待办/对话/通知时跳过（可安全重复执行）。
 * 供两处复用：SeedService 空库首启自动种入；`npm run seed:demo` 手动补种。
 */

export interface DemoUser {
  id: number;
  username: string;
}

export async function seedDemoData(
  dataSource: DataSource,
  user: DemoUser,
): Promise<boolean> {
  const eventRepo = dataSource.getRepository(Event);
  const todoRepo = dataSource.getRepository(Todo);
  const knowledgeRepo = dataSource.getRepository(KnowledgeArticle);
  const convRepo = dataSource.getRepository(AiConversation);
  const msgRepo = dataSource.getRepository(AiMessage);
  const notifRepo = dataSource.getRepository(Notification);
  const crmCustomerRepo = dataSource.getRepository(CrmCustomer);
  const crmOrderRepo = dataSource.getRepository(CrmOrder);
  const crmActivityRepo = dataSource.getRepository(CrmActivity);
  const crmTaskRepo = dataSource.getRepository(CrmTask);
  const crmRiskRepo = dataSource.getRepository(CrmRisk);
  const pmProjectRepo = dataSource.getRepository(PmProject);
  const pmMilestoneRepo = dataSource.getRepository(PmMilestone);
  const pmTaskRepo = dataSource.getRepository(PmTask);
  const pmRiskRepo = dataSource.getRepository(PmRisk);
  const approvalRequestRepo = dataSource.getRepository(ApprovalRequest);
  const approvalPolicyRepo = dataSource.getRepository(ApprovalPolicy);
  const contractRepo = dataSource.getRepository(Contract);
  const supplierRepo = dataSource.getRepository(Supplier);
  const tagRepo = dataSource.getRepository(Tag);
  const noteRepo = dataSource.getRepository(Note);
  const bookRepo = dataSource.getRepository(Book);
  const postRepo = dataSource.getRepository(Post);
  const commentRepo = dataSource.getRepository(PostComment);
  const likeRepo = dataSource.getRepository(PostLike);
  const followRepo = dataSource.getRepository(UserFollow);
  const agentRepo = dataSource.getRepository(AiAgent);
  const flowDefRepo = dataSource.getRepository(FlowDefinition);
  const flowInstRepo = dataSource.getRepository(FlowInstance);
  const flowTaskRepo = dataSource.getRepository(FlowTask);
  const formSchemaRepo = dataSource.getRepository(FormSchema);
  const formSubRepo = dataSource.getRepository(FormSubmission);
  const pointsRepo = dataSource.getRepository(PointsEntry);
  const contactRepo = dataSource.getRepository(CrmContact);
  const opportunityRepo = dataSource.getRepository(CrmOpportunity);

  const day = 24 * 60 * 60 * 1000;
  const today = new Date();
  const at = (offsetDays: number, hour: number, minute = 0) => {
    const d = new Date(today.getTime() + offsetDays * day);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const dateOnly = (offsetDays: number) => {
    const d = new Date(today.getTime() + offsetDays * day);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // ── AI CRM 旗舰应用演示数据（独立守卫：已有客户则跳过，不影响既有演示账号）──
  const existingCrm = await crmCustomerRepo.count({ where: { userId: user.id } });
  if (existingCrm === 0) {
    const customers = await crmCustomerRepo.save([
      {
        userId: user.id, name: '辰光建材', company: '辰光建材集团', email: 'crm@chenguang.example',
        phone: '138-0000-1001', status: 'active', riskLevel: 'high',
        notes: '华东区核心客户，Q3 两笔大单。历史付款周期偏长，近期有逾期迹象。',
      },
      {
        userId: user.id, name: '澄海地产', company: '澄海置业', email: 'buyer@chenghai.example',
        phone: '138-0000-1002', status: 'churn_risk', riskLevel: 'high',
        notes: '项目回款承压，两笔订单逾期超 30 天，需重点跟进催款。',
      },
      {
        userId: user.id, name: '曜石科技', company: '曜石信息技术', email: 'procure@yaoshi.example',
        phone: '138-0000-1003', status: 'active', riskLevel: 'medium',
        notes: '年度框架客户，续约谈判中，订单接近到期需提前确认。',
      },
      {
        userId: user.id, name: '瀚宇制造', company: '瀚宇智能制造', email: 'po@hanyu.example',
        phone: '138-0000-1004', status: 'active', riskLevel: 'critical',
        notes: '单笔大额订单 280 万已逾期，资金链紧张，最高优先级催收。',
      },
      {
        userId: user.id, name: '联盛物流', company: '联盛供应链', email: 'ops@liansheng.example',
        phone: '138-0000-1005', status: 'active', riskLevel: 'medium',
        notes: '合作平稳，近期新增一笔 60 万订单，留意回款节奏。',
      },
      {
        userId: user.id, name: '岚岳贸易', company: '岚岳国际贸易', email: 'contact@lanyue.example',
        phone: '138-0000-1006', status: 'active', riskLevel: 'low',
        notes: '老客户，历史回款及时，无风险。',
      },
      {
        userId: user.id, name: '慧芽教育', company: '慧芽在线教育', email: 'bd@huiya.example',
        phone: '138-0000-1007', status: 'lead', riskLevel: 'low',
        notes: '潜客，本周有产品演示安排，争取转正。',
      },
      {
        userId: user.id, name: '叠屿软件', company: '叠屿科技', email: 'it@dieyu.example',
        phone: '138-0000-1008', status: 'inactive', riskLevel: 'low',
        notes: '去年订单已结清，今年无新需求，保持低强度触达。',
      },
    ]);

    const cid = (name: string) => customers.find((c) => c.name === name)!.id;
    const uid = user.id;

    await crmOrderRepo.save([
      { userId: uid, customerId: cid('辰光建材'), amount: 450000, status: 'overdue', orderDate: dateOnly(-60), dueDate: dateOnly(-10) },
      { userId: uid, customerId: cid('辰光建材'), amount: 120000, status: 'paid', orderDate: dateOnly(-90), dueDate: dateOnly(-30) },
      { userId: uid, customerId: cid('辰光建材'), amount: 80000, status: 'pending', orderDate: dateOnly(-5), dueDate: dateOnly(25) },
      { userId: uid, customerId: cid('澄海地产'), amount: 210000, status: 'overdue', orderDate: dateOnly(-45), dueDate: dateOnly(-15) },
      { userId: uid, customerId: cid('澄海地产'), amount: 95000, status: 'overdue', orderDate: dateOnly(-30), dueDate: dateOnly(-5) },
      { userId: uid, customerId: cid('曜石科技'), amount: 150000, status: 'pending', orderDate: dateOnly(-20), dueDate: dateOnly(10) },
      { userId: uid, customerId: cid('曜石科技'), amount: 90000, status: 'paid', orderDate: dateOnly(-70), dueDate: dateOnly(-40) },
      { userId: uid, customerId: cid('瀚宇制造'), amount: 2800000, status: 'overdue', orderDate: dateOnly(-120), dueDate: dateOnly(-40) },
      { userId: uid, customerId: cid('联盛物流'), amount: 600000, status: 'pending', orderDate: dateOnly(-8), dueDate: dateOnly(22) },
      { userId: uid, customerId: cid('岚岳贸易'), amount: 88000, status: 'paid', orderDate: dateOnly(-100), dueDate: dateOnly(-70) },
      { userId: uid, customerId: cid('岚岳贸易'), amount: 45000, status: 'paid', orderDate: dateOnly(-40), dueDate: dateOnly(-10) },
      { userId: uid, customerId: cid('叠屿软件'), amount: 66000, status: 'paid', orderDate: dateOnly(-200), dueDate: dateOnly(-170) },
    ]);

    await crmActivityRepo.save([
      { userId: uid, customerId: cid('辰光建材'), type: 'call', summary: '电话沟通：采购总监反馈总部回款流程调整，预计下周付款。', happenedAt: at(-3, 14) },
      { userId: uid, customerId: cid('辰光建材'), type: 'email', summary: '发送催款函 + 逾期订单明细清单。', happenedAt: at(-8, 10) },
      { userId: uid, customerId: cid('澄海地产'), type: 'call', summary: '项目负责人电话未接，留言催收。', happenedAt: at(-2, 15) },
      { userId: uid, customerId: cid('澄海地产'), type: 'meeting', summary: '面谈：财务表示资金优先偿还银行贷款，本月无回款。', happenedAt: at(-12, 9) },
      { userId: uid, customerId: cid('瀚宇制造'), type: 'call', summary: '与 CFO 通话：确认 280 万订单分期支付方案，第一批下月初。', happenedAt: at(-1, 16) },
      { userId: uid, customerId: cid('曜石科技'), type: 'meeting', summary: '续约谈判：对方要求折扣 8%，待内部审批。', happenedAt: at(-4, 11) },
      { userId: uid, customerId: cid('慧芽教育'), type: 'email', summary: '发送产品演示资料与报价单。', happenedAt: at(-2, 9) },
      { userId: uid, customerId: cid('联盛物流'), type: 'call', summary: '确认新订单交付细节。', happenedAt: at(-1, 13) },
      { userId: uid, customerId: cid('岚岳贸易'), type: 'email', summary: '季度回访，客户反馈服务满意。', happenedAt: at(-20, 10) },
    ]);

    await crmTaskRepo.save([
      { userId: uid, customerId: cid('辰光建材'), title: '跟进辰光 45 万逾期订单回款', description: '确认下周付款计划，必要时升级商务。', dueDate: at(1, 17), status: 'pending' },
      { userId: uid, customerId: cid('辰光建材'), title: '与辰光确认新订单交付排期', dueDate: at(3, 11), status: 'pending' },
      { userId: uid, customerId: cid('澄海地产'), title: '催收澄海两笔逾期订单（30.5 万）', description: '电话 + 上门双线推进。', dueDate: at(2, 15), status: 'pending' },
      { userId: uid, customerId: cid('澄海地产'), title: '整理澄海回款风险报告', dueDate: at(-1, 18), status: 'pending' },
      { userId: uid, customerId: cid('瀚宇制造'), title: '推进瀚宇 280 万分期方案签约', description: '第一批付款协议初稿。', dueDate: at(5, 10), status: 'pending' },
      { userId: uid, customerId: cid('曜石科技'), title: '内部确认曜石续约折扣', dueDate: at(2, 16), status: 'in_progress' },
      { userId: uid, customerId: cid('慧芽教育'), title: '准备慧芽教育产品演示', dueDate: at(3, 14), status: 'pending' },
      { userId: uid, customerId: cid('联盛物流'), title: '确认联盛新订单交付细节', dueDate: at(-2, 17), status: 'completed' },
      { userId: uid, customerId: cid('叠屿软件'), title: '叠屿年度回访（低强度）', dueDate: at(10, 10), status: 'pending' },
    ]);

    await crmRiskRepo.save([
      { userId: uid, customerId: cid('辰光建材'), level: 'high', reason: '45 万订单逾期 10 天，历史回款周期变长。', detectedAt: at(-7, 9) },
      { userId: uid, customerId: cid('澄海地产'), level: 'high', reason: '两笔订单逾期合计 30.5 万，项目资金承压。', detectedAt: at(-10, 9) },
      { userId: uid, customerId: cid('瀚宇制造'), level: 'critical', reason: '单笔 280 万订单逾期 40 天，客户资金链紧张。', detectedAt: at(-15, 9) },
      { userId: uid, customerId: cid('曜石科技'), level: 'medium', reason: '续约谈判未定，订单临近到期。', detectedAt: at(-5, 9) },
    ]);

    // CRM 360：联系人 + 商机（中英双语）
    await contactRepo.save([
      { userId: uid, customerId: cid('辰光建材'), name: '陈晓峰', email: 'chen@chenguang.example', phone: '138-0000-1101', role: '采购总监', department: '采购部', isPrimary: true },
      { userId: uid, customerId: cid('辰光建材'), name: 'Grace Liu', email: 'grace@chenguang.example', role: 'Finance Manager', isPrimary: false },
      { userId: uid, customerId: cid('澄海地产'), name: '周明', email: 'zhou@chenghai.example', phone: '138-0000-1102', role: '项目负责人', department: '工程部', isPrimary: true },
      { userId: uid, customerId: cid('曜石科技'), name: 'Sarah Chen', email: 'sarah@yaoshi.example', role: 'Procurement Lead', isPrimary: true },
      { userId: uid, customerId: cid('瀚宇制造'), name: '李总', email: 'li@hanyu.example', role: 'CFO', department: '财务部', isPrimary: true },
    ]);

    await opportunityRepo.save([
      { userId: uid, customerId: cid('辰光建材'), name: 'Q4 续约订单', amount: 450000, stage: 'proposal', probability: 60, expectedCloseDate: at(30, 0) },
      { userId: uid, customerId: cid('澄海地产'), name: '新项目合作协议', amount: 280000, stage: 'negotiation', probability: 40, expectedCloseDate: at(45, 0) },
      { userId: uid, customerId: cid('曜石科技'), name: 'Annual Renewal', amount: 150000, stage: 'proposal', probability: 70, expectedCloseDate: at(20, 0) },
      { userId: uid, customerId: cid('瀚宇制造'), name: '分阶段付款方案', amount: 2800000, stage: 'negotiation', probability: 35, expectedCloseDate: at(60, 0) },
    ]);
  }

  // ── AI Project Management 旗舰应用演示数据（独立守卫）──
  const existingPm = await pmProjectRepo.count({ where: { userId: user.id } });
  if (existingPm === 0) {
    const projects = await pmProjectRepo.save([
      {
        userId: user.id, name: '电商平台重构', status: 'active', riskLevel: 'high',
        description: 'Q3 核心项目：订单与库存模块重构，涉及 6 个服务。', startDate: dateOnly(-60), endDate: dateOnly(40),
      },
      {
        userId: user.id, name: '移动端 App 发布', status: 'active', riskLevel: 'medium',
        description: '新版 App 上线，含登录链路与推送升级。', startDate: dateOnly(-30), endDate: dateOnly(20),
      },
      {
        userId: user.id, name: '内部 BI 看板', status: 'completed', riskLevel: 'low',
        description: '运营看板一期已上线，二期规划中。', startDate: dateOnly(-120), endDate: dateOnly(-10),
      },
      {
        userId: user.id, name: '数据仓库迁移', status: 'on_hold', riskLevel: 'medium',
        description: '从自建 Hive 迁移至云数仓，等待资源审批。', startDate: dateOnly(-45),
      },
    ]);

    const pid = (name: string) => projects.find((p) => p.name === name)!.id;

    await pmMilestoneRepo.save([
      { projectId: pid('电商平台重构'), title: '需求冻结', dueDate: dateOnly(-20), status: 'completed' },
      { projectId: pid('电商平台重构'), title: '订单模块上线', dueDate: dateOnly(-5), status: 'pending' },
      { projectId: pid('电商平台重构'), title: '库存模块上线', dueDate: dateOnly(15), status: 'pending' },
      { projectId: pid('移动端 App 发布'), title: '提审包', dueDate: dateOnly(5), status: 'in_progress' },
      { projectId: pid('移动端 App 发布'), title: '应用商店上架', dueDate: dateOnly(15), status: 'pending' },
      { projectId: pid('内部 BI 看板'), title: '看板一期交付', dueDate: dateOnly(-15), status: 'completed' },
      { projectId: pid('数据仓库迁移'), title: '资源申请批复', dueDate: dateOnly(-3), status: 'pending' },
    ]);

    await pmTaskRepo.save([
      { userId: user.id, projectId: pid('电商平台重构'), title: '订单模块联调遗留缺陷修复', dueDate: at(-2, 18), status: 'pending' },
      { userId: user.id, projectId: pid('电商平台重构'), title: '库存模块性能压测', dueDate: at(3, 17), status: 'pending' },
      { userId: user.id, projectId: pid('电商平台重构'), title: '上线回滚预案评审', dueDate: at(2, 15), status: 'pending' },
      { userId: user.id, projectId: pid('移动端 App 发布'), title: 'App 提审材料准备', dueDate: at(1, 12), status: 'pending' },
      { userId: user.id, projectId: pid('移动端 App 发布'), title: '推送证书替换', dueDate: at(-1, 16), status: 'completed' },
      { userId: user.id, projectId: pid('内部 BI 看板'), title: '看板一期验收', dueDate: at(-16, 10), status: 'completed' },
      { userId: user.id, projectId: pid('数据仓库迁移'), title: '云数仓资源申请跟进', dueDate: at(-4, 15), status: 'pending' },
    ]);

    await pmRiskRepo.save([
      { projectId: pid('电商平台重构'), level: 'high', reason: '订单模块上线里程碑已延期 5 天，3 个任务逾期。', detectedAt: at(-5, 9) },
      { projectId: pid('移动端 App 发布'), level: 'medium', reason: '提审包排期临近，商店审核周期不确定。', detectedAt: at(-3, 9) },
      { projectId: pid('数据仓库迁移'), level: 'medium', reason: '云资源申请长期未批复，项目暂停。', detectedAt: at(-8, 9) },
    ]);
  }

  // ── AI Approval 旗舰应用演示数据（独立守卫）──
  const existingApproval = await approvalRequestRepo.count({ where: { requesterId: user.id } });
  if (existingApproval === 0) {
    await approvalPolicyRepo.save([
      { userId: user.id, title: '差旅报销自动通过政策', type: 'reimbursement', maxAmount: 1000, description: '单笔差旅报销 ≤ 1000 元自动通过，超出转人工复核。' },
      { userId: user.id, title: '办公采购自动通过政策', type: 'purchase', maxAmount: 5000, description: '办公采购 ≤ 5000 元自动通过，超出转人工复核。' },
      { userId: user.id, title: '请假审批政策', type: 'leave', maxAmount: 0, description: '请假一律转人工复核。' },
    ]);

    await approvalRequestRepo.save([
      { requesterId: user.id, title: '8 月差旅报销', type: 'reimbursement', amount: 800, reason: '客户拜访交通与住宿费', status: 'pending', riskLevel: 'low' },
      { requesterId: user.id, title: '研发服务器采购', type: 'purchase', amount: 12000, reason: 'Q3 上线扩容，采购 2 台高配服务器', status: 'pending', riskLevel: 'low' },
      { requesterId: user.id, title: '本周五事假半天', type: 'leave', amount: 0, reason: '家中有事，请假半天', status: 'needs_review', riskLevel: 'medium', aiRecommendation: '请假类型无自动通过政策，转人工复核。' },
    ]);
  }

  // 幂等：已种过演示事件则跳过
  const existing = await eventRepo.count({ where: { userId: user.id } });
  if (existing > 0) return false;

  // ── 事件：含今天/未来/已取消，展示 reminder 与颜色 ──────────
  await eventRepo.save([
    {
      userId: user.id,
      title: '项目评审会',
      description: '与团队评审 Q3 进度，重点对齐 AI 助手模块的交付计划。',
      startTime: at(0, 10, 0),
      endTime: at(0, 11, 30),
      location: '3F 会议室 A',
      colorRole: EventColorRole.blue,
      reminderMinutes: 30,
    },
    {
      userId: user.id,
      title: '午餐与客户会面',
      description: '与潜在客户沟通私有化部署需求，准备演示环境。',
      startTime: at(0, 12, 30),
      endTime: at(0, 14, 0),
      location: '公司旁餐厅',
      colorRole: EventColorRole.green,
      reminderMinutes: 15,
    },
    {
      userId: user.id,
      title: '产品周会',
      description: '同步本周进展与下周计划。',
      startTime: at(1, 9, 30),
      endTime: at(1, 10, 0),
      colorRole: EventColorRole.purple,
      isRecurring: true,
    },
    {
      userId: user.id,
      title: '健身房',
      description: '每周两次，保持状态。',
      startTime: at(1, 19, 0),
      endTime: at(1, 20, 0),
      location: '附近健身中心',
      colorRole: EventColorRole.orange,
      reminderMinutes: 60,
      isRecurring: true,
    },
    {
      userId: user.id,
      title: '技术分享：RAG 实践',
      description: '内部技术分享，介绍知识库向量检索的落地经验。',
      startTime: at(2, 15, 0),
      endTime: at(2, 16, 30),
      location: '线上会议',
      colorRole: EventColorRole.cyan,
      reminderMinutes: 10,
    },
    {
      userId: user.id,
      title: '拜访客户 A',
      description: '演示 AI 助手与数据主权方案。',
      startTime: at(3, 14, 0),
      endTime: at(3, 17, 0),
      location: '客户公司',
      colorRole: EventColorRole.blue,
      reminderMinutes: 60,
    },
    {
      userId: user.id,
      title: '已取消的会议',
      description: '本周例会已取消。',
      startTime: at(-1, 11, 0),
      endTime: at(-1, 12, 0),
      isCancelled: true,
      colorRole: EventColorRole.red,
    },
  ]);

  // ── 待办：部分完成，带截止日期 ────────────────────────────
  await todoRepo.save([
    {
      userId: user.id,
      title: '准备私有化部署演示环境',
      description: 'Docker + 演示数据 + 一键脚本走通。',
      completed: false,
      dueDate: at(0, 18, 0),
    },
    {
      userId: user.id,
      title: '整理 RAG 分享材料',
      description: '本周五技术分享用。',
      completed: false,
      dueDate: at(1, 18, 0),
    },
    {
      userId: user.id,
      title: '回复客户邮件',
      completed: false,
      dueDate: at(0, 15, 0),
    },
    {
      userId: user.id,
      title: '更新周报',
      completed: true,
    },
    {
      userId: user.id,
      title: '完成测试用例补充',
      description: '覆盖率提升到门槛以上。',
      completed: true,
    },
    {
      userId: user.id,
      title: '预约体检',
      completed: true,
    },
  ]);

  // ── 知识库：全局可见，供 RAG 问答（AI-3/AI-5）─────────────
  const kc = await knowledgeRepo.count();
  if (kc === 0) {
    await knowledgeRepo.save([
      {
        title: 'KeelBase 是什么',
        category: '产品介绍',
        content:
          'KeelBase 是一个生产级、AI 原生的全栈应用基座，覆盖 Flutter/Taro 三端 + NestJS 后端 + AI 编排，支持私有化部署，强调数据主权与企业级安全。',
      },
      {
        title: '如何启动后端',
        category: '开发指南',
        content:
          '进入 Server-NestJS 目录，cp .env.example .env，npm install，npm run start:dev 即可启动开发后端，默认 SQLite 零配置，首次启动自动创建演示账号 alex / Alex@2026$Demo。',
      },
      {
        title: 'AI 助手支持哪些能力',
        category: '使用说明',
        content:
          'AI 助手支持事件查询与统计、日程创建（人工确认）、待办管理、知识库问答（RAG）、数据洞察、页面导航，并支持 DeepSeek/Qwen/OpenAI/本地 Ollama 多模型切换与联网搜索。',
      },
      {
        title: '数据主权说明',
        category: '安全合规',
        content:
          '基座支持私有化部署，AI 可对接本地 Ollama 使数据不出域；敏感字段（手机号等）静态加密存储，管理端访问脱敏，满足企业数据安全要求。',
      },
      // P0-2 真实 Seed：与三旗舰业务呼应的知识文档（登录即可问「哪些客户值得跟进」等）
      {
        title: '大客户风险管理流程',
        category: 'CRM 业务',
        content:
          '识别高风险客户的关键信号：订单逾期（尤其单笔超 100 万）、付款周期拉长、连续两月未续约。按风险等级分级：critical（≥10 分）立即人工跟进、high（≥6 分）建议创建跟进任务、medium（≥3 分）观察、low 常规维护。逾期订单优先催款，未解决风险记录需持续跟踪。',
      },
      {
        title: '项目延期风险识别指南',
        category: '项目管理',
        content:
          '判断项目延期风险的三类信号：逾期未完成任务（+2 分）、延期里程碑（+3 分，权重最高）、未解决风险记录（+2 分）。总分 ≥6 为高风险、≥3 为中风险。发现中高风险时应建议创建补救任务并通知项目负责人。',
      },
      {
        title: '差旅报销审批政策',
        category: '审批政策',
        content:
          '差旅报销审批规则：单笔金额 ≤ 2000 元且符合差旅标准 → AI 自动通过；超过 2000 元 → 转人工复核；金额 ≥ 10000 元需部门负责人审批。报销需附发票与事由说明。',
      },
    ]);
  }

  // ── AI 对话历史：两个会话，展示工具调用场景 ───────────────
  const convCount = await convRepo.count({
    where: { userId: String(user.id) },
  });
  if (convCount === 0) {
    const c1 = await convRepo.save(
      convRepo.create({
        userId: String(user.id),
        provider: 'deepseek',
        model: 'deepseek-chat',
        lastActivityAt: new Date(Date.now() - 2 * day),
      }),
    );
    await msgRepo.save([
      {
        conversationId: c1.id,
        role: 'user',
        content: '我这个月有哪些事件安排？',
      },
      {
        conversationId: c1.id,
        role: 'assistant',
        content:
          '你本月有 7 个事件安排，包括今天的项目评审会、明天的产品周会等。需要我帮你查看某个具体事件的详情吗？',
      },
    ]);

    const c2 = await convRepo.save(
      convRepo.create({
        userId: String(user.id),
        provider: 'deepseek',
        model: 'deepseek-chat',
        lastActivityAt: new Date(Date.now() - 1 * day),
      }),
    );
    await msgRepo.save([
      {
        conversationId: c2.id,
        role: 'user',
        content: '帮我创建一条明天的待办：提交季度总结',
      },
      {
        conversationId: c2.id,
        role: 'assistant',
        content:
          '好的，我已经为你创建了待办「提交季度总结」，截止时间为明天。你也可以让我创建日程事件或查询知识库内容。',
      },
    ]);

    await convRepo.update(
      { id: c1.id },
      { messageCount: 2, summary: '用户询问本月事件安排，助手返回了事件汇总。' },
    );
    await convRepo.update(
      { id: c2.id },
      { messageCount: 2, summary: '用户要求创建待办，助手成功创建。' },
    );

    // P0-2 真实 Seed：旗舰场景对话——AI 读数据 → 分析风险 → 建议动作
    const c3 = await convRepo.save(
      convRepo.create({
        userId: String(user.id),
        provider: 'deepseek',
        model: 'deepseek-chat',
        lastActivityAt: new Date(Date.now() - 3 * 3600 * 1000),
      }),
    );
    await msgRepo.save([
      {
        conversationId: c3.id,
        role: 'user',
        content: '哪些客户本周最值得跟进？',
      },
      {
        conversationId: c3.id,
        role: 'assistant',
        content:
          '我帮你查了客户与订单数据：澄海地产有 2 笔订单逾期超 30 天（风险 high），瀚宇制造单笔 280 万订单逾期（风险 critical），叠屿软件逾期且连续未续约。建议优先跟进瀚宇制造与澄海地产催款——需要我为你创建跟进任务吗（需你确认）？',
      },
    ]);
    await convRepo.update(
      { id: c3.id },
      { messageCount: 2, summary: '用户询问本周值得跟进的客户，助手基于订单逾期与风险分级给出建议并提议创建跟进任务。' },
    );
  }

  // ── 通知：欢迎 + 提醒 + 公告（含已读/未读）───────────────
  const notifCount = await notifRepo.count({ where: { userId: user.id } });
  if (notifCount === 0) {
    await notifRepo.save([
      {
        userId: user.id,
        title: '欢迎使用 KeelBase',
        body: '这是一条演示通知。你可以在消息中心查看、标记已读或删除通知。',
        type: 'system',
        isRead: true,
        createdAt: new Date(Date.now() - 3 * day),
      },
      {
        userId: user.id,
        title: '事件提醒：项目评审会 30 分钟后开始',
        body: '「项目评审会」将在今天 10:00 开始（地点：3F 会议室 A）。',
        type: 'reminder',
        targetType: 'event',
        targetId: '',
        isRead: false,
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
      {
        userId: user.id,
        title: '公告：新增本地 AI（Ollama）支持',
        body: '现在可以对接本地 Ollama 模型，实现数据不出域的 AI 体验。详见文档。',
        type: 'broadcast',
        isRead: false,
        createdAt: new Date(Date.now() - 1 * day),
      },
    ]);
  }

  // ── 生成模块演示数据：合同 / 供应商 / 标签 / 笔记（中英双语；幂等守卫）──
  const existingContracts = await contractRepo.count({ where: { userId: user.id } as any });
  if (existingContracts === 0) {
    await contractRepo.save([
      { userId: user.id, name: '云服务采购合同', counterparty: '辰光建材集团', status: 'active', amount: 120000 },
      { userId: user.id, name: '年度框架协议', counterparty: '澄海置业', status: 'active', amount: 450000 },
      { userId: user.id, name: '设备租赁合同', counterparty: '曜石科技', status: 'draft', amount: 68000 },
      { userId: user.id, name: 'Cloud Service Agreement', counterparty: 'Aurora Tech Inc.', status: 'active', amount: 88000 },
      { userId: user.id, name: 'Master Supply Agreement', counterparty: 'Northwind Trading', status: 'signed', amount: 260000 },
      { userId: user.id, name: 'Equipment Lease Contract', counterparty: 'Blue Ocean Logistics', status: 'draft', amount: 95000 },
    ]);
  }

  const existingSuppliers = await supplierRepo.count({ where: { userId: user.id } as any });
  if (existingSuppliers === 0) {
    await supplierRepo.save([
      { userId: user.id, name: '华东电子元器件', contact: '张经理 138-0000-2001', status: 'active', riskLevel: 'low', annualSpend: 86000 },
      { userId: user.id, name: '南方精密制造', contact: '李工 138-0000-2002', status: 'active', riskLevel: 'medium', annualSpend: 156000 },
      { userId: user.id, name: '西部原材料供应', contact: '王总 138-0000-2003', status: 'inactive', riskLevel: 'high', annualSpend: 42000 },
      { userId: user.id, name: 'Pacific Components', contact: 'Sarah Chen', status: 'active', riskLevel: 'low', annualSpend: 73000 },
      { userId: user.id, name: 'Meridian Chemicals', contact: 'Tom Baker', status: 'active', riskLevel: 'medium', annualSpend: 134000 },
      { userId: user.id, name: 'Global Textiles', contact: 'Lisa Wang', status: 'inactive', riskLevel: 'low', annualSpend: 38000 },
    ]);
  }

  const existingTags = await tagRepo.count({ where: { userId: user.id } as any });
  if (existingTags === 0) {
    await tagRepo.save([
      { userId: user.id, name: '重要客户' },
      { userId: user.id, name: '待跟进' },
      { userId: user.id, name: 'VIP' },
      { userId: user.id, name: 'Strategic' },
      { userId: user.id, name: 'Follow-up' },
    ]);
  }

  const existingNotes = await noteRepo.count({ where: { userId: user.id } as any });
  if (existingNotes === 0) {
    await noteRepo.save([
      { userId: user.id, title: 'Q3 销售目标复盘', content: '核心客户推进顺利，重点关注辰光建材的逾期回款与澄海置业的续约。', type: 'work' },
      { userId: user.id, title: '客户拜访要点', content: '澄海置业新项目预算已批，下周约见采购总监确认交付排期。', type: 'work' },
      { userId: user.id, title: 'Project Kickoff Notes', content: 'Define milestones, assign owners, set a weekly sync cadence.', type: 'work' },
      { userId: user.id, title: 'Q3 Review Summary', content: 'Revenue up 12% QoQ; focus on churn-risk accounts and overdue collections.', type: 'work' },
    ]);
  }

  // ── 其余业务模块演示数据：书籍 / 帖子 / 关注 / Agent / 流程 / 表单 / 积分（中英双语；幂等）──
  const userRepo = dataSource.getRepository(User);
  const admin = await userRepo.findOne({ where: { role: 'admin' } } as any);
  const otherId = admin?.id ?? user.id;

  const existingBooks = await bookRepo.count({ where: { userId: user.id } as any });
  if (existingBooks === 0) {
    await bookRepo.save([
      { userId: user.id, title: '深入理解软件架构', author: '张三', status: 'read', rating: 5 },
      { userId: user.id, title: 'AI 应用安全实践', author: '李四', status: 'reading' },
      { userId: user.id, title: '分布式系统设计', author: '王五', status: 'unread' },
      { userId: user.id, title: 'Clean Code', author: 'Robert C. Martin', status: 'read', rating: 5 },
      { userId: user.id, title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', status: 'reading' },
      { userId: user.id, title: 'The Pragmatic Programmer', author: 'Hunt & Thomas', status: 'unread' },
    ]);
  }

  const existingPosts = await postRepo.count({ where: { userId: user.id } as any });
  if (existingPosts === 0) {
    const posts = await postRepo.save([
      { userId: user.id, title: '用 AI 生成带权限与审计的业务模块', content: '记录 AI 全链路生成：协议 → 代码 → 迁移 → 权限 → 审计。' },
      { userId: user.id, title: 'Getting Started with KeelBase', content: 'Step-by-step guide to build your first business-safe AI application in 30 minutes.' },
      { userId: user.id, title: 'AI 治理实践：确认、审计、撤销闭环', content: '业务安全 AI 的关键能力：写操作确认、全链路审计、副作用撤销。' },
    ]);
    await commentRepo.save([
      { postId: posts[0].id, userId: user.id, content: '很实用，正好在学习！' },
      { postId: posts[0].id, userId: otherId, content: 'Great write-up!' },
      { postId: posts[1].id, userId: user.id, content: 'Very helpful for onboarding.' },
    ]);
    await likeRepo.save(posts.map((p) => ({ postId: p.id, userId: user.id })));
  }

  const existingFollows = await followRepo.count({ where: { followerId: user.id } as any });
  if (existingFollows === 0) {
    await followRepo.save([{ followerId: user.id, followeeId: otherId }]);
  }

  const existingAgents = await agentRepo.count({ where: { ownerId: user.id } as any });
  if (existingAgents === 0) {
    await agentRepo.save([
      { name: 'sales-agent', ownerId: user.id, purpose: 'CRM 销售分析与跟进建议', trustLevel: 'R2', description: '客户 360 分析助手', capabilities: '["query_customers","create_followup_task"]' },
      { name: 'project-agent', ownerId: user.id, purpose: '项目延期风险分析', trustLevel: 'R2', description: 'PM 风险助手', capabilities: '["query_projects","analyze_project_risk"]' },
      { name: 'approval-agent', ownerId: user.id, purpose: '审批请求预审', trustLevel: 'R3', description: '审批预审助手', capabilities: '["review_approval_request"]' },
      { name: 'research-agent', ownerId: user.id, purpose: '通用数据检索', trustLevel: 'R1', description: 'Research assistant', capabilities: '["query_events","query_todos"]' },
    ]);
  }

  const existingFlowDefs = await flowDefRepo.count();
  if (existingFlowDefs === 0) {
    const defs = await flowDefRepo.save([
      {
        id: 'leave-approval', name: '请假审批流程', version: '1.0',
        nodesJson: JSON.stringify({ nodes: [{ id: 'start', type: 'start' }, { id: 'approve', type: 'human_task' }, { id: 'end', type: 'end' }] }),
        audit: true, confirmationRequired: true,
      },
      {
        id: 'crm-followup', name: 'CRM 跟进流程', version: '1.0',
        nodesJson: JSON.stringify({ nodes: [{ id: 'start', type: 'start' }, { id: 'task', type: 'ai_task' }, { id: 'end', type: 'end' }] }),
        audit: true, confirmationRequired: false,
      },
    ]);
    const insts = await flowInstRepo.save([
      { definitionId: defs[0].id, state: 'running', initiatorId: user.id },
      { definitionId: defs[0].id, state: 'completed', initiatorId: user.id },
    ]);
    await flowTaskRepo.save([{ instanceId: insts[0].id, nodeId: 'approve', assigneeId: otherId, status: 'pending' }]);
  }

  const existingForms = await formSchemaRepo.count();
  if (existingForms === 0) {
    const schemas = await formSchemaRepo.save([
      { title: '活动报名表', slug: 'event-register', schemaJson: JSON.stringify({ fields: [{ name: 'name', label: '姓名', type: 'text', required: true }, { name: 'phone', label: '手机号', type: 'text', required: false }] }), enabled: true },
      { title: 'Customer Feedback', slug: 'customer-feedback', schemaJson: JSON.stringify({ fields: [{ name: 'email', label: 'Email', type: 'text', required: true }, { name: 'rating', label: 'Rating', type: 'number', required: false }] }), enabled: true },
    ]);
    await formSubRepo.save([
      { schemaId: schemas[0].id, userId: user.id, data: JSON.stringify({ name: 'Alex', phone: '138-0000-0000' }) },
      { schemaId: schemas[1].id, userId: user.id, data: JSON.stringify({ email: 'alex@example.com', rating: 5 }) },
    ]);
  }

  const existingPoints = await pointsRepo.count({ where: { userId: user.id } as any });
  if (existingPoints === 0) {
    await pointsRepo.save([
      { userId: user.id, points: 10, reason: 'checkin', description: '每日签到', checkinDate: dateOnly(-2).toISOString().slice(0, 10) },
      { userId: user.id, points: 10, reason: 'checkin', description: '每日签到', checkinDate: dateOnly(-1).toISOString().slice(0, 10) },
      { userId: user.id, points: 5, reason: 'achievement', description: '完成首个 AI 对话' },
      { userId: user.id, points: 20, reason: 'reward', description: 'Monthly activity reward' },
    ]);
  }

  return true;
}
