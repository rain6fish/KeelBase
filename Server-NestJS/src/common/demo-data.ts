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
        userId: user.id, name: '华润建材', company: '华润建材集团', email: 'crm@huarun.example',
        phone: '138-0000-1001', status: 'active', riskLevel: 'high',
        notes: '华东区核心客户，Q3 两笔大单。历史付款周期偏长，近期有逾期迹象。',
      },
      {
        userId: user.id, name: '蓝湾地产', company: '蓝湾置业', email: 'buyer@lanwan.example',
        phone: '138-0000-1002', status: 'churn_risk', riskLevel: 'high',
        notes: '项目回款承压，两笔订单逾期超 30 天，需重点跟进催款。',
      },
      {
        userId: user.id, name: '星河科技', company: '星河信息技术', email: 'procure@xinghe.example',
        phone: '138-0000-1003', status: 'active', riskLevel: 'medium',
        notes: '年度框架客户，续约谈判中，订单接近到期需提前确认。',
      },
      {
        userId: user.id, name: '临海制造', company: '临海智能制造', email: 'po@linhai.example',
        phone: '138-0000-1004', status: 'active', riskLevel: 'critical',
        notes: '单笔大额订单 280 万已逾期，资金链紧张，最高优先级催收。',
      },
      {
        userId: user.id, name: '恒达物流', company: '恒达供应链', email: 'ops@hengda.example',
        phone: '138-0000-1005', status: 'active', riskLevel: 'medium',
        notes: '合作平稳，近期新增一笔 60 万订单，留意回款节奏。',
      },
      {
        userId: user.id, name: '远山贸易', company: '远山国际贸易', email: 'contact@yuanshan.example',
        phone: '138-0000-1006', status: 'active', riskLevel: 'low',
        notes: '老客户，历史回款及时，无风险。',
      },
      {
        userId: user.id, name: '新芽教育', company: '新芽在线教育', email: 'bd@xinya.example',
        phone: '138-0000-1007', status: 'lead', riskLevel: 'low',
        notes: '潜客，本周有产品演示安排，争取转正。',
      },
      {
        userId: user.id, name: '云帆软件', company: '云帆科技', email: 'it@yunfan.example',
        phone: '138-0000-1008', status: 'inactive', riskLevel: 'low',
        notes: '去年订单已结清，今年无新需求，保持低强度触达。',
      },
    ]);

    const cid = (name: string) => customers.find((c) => c.name === name)!.id;
    const uid = user.id;

    await crmOrderRepo.save([
      { userId: uid, customerId: cid('华润建材'), amount: 450000, status: 'overdue', orderDate: dateOnly(-60), dueDate: dateOnly(-10) },
      { userId: uid, customerId: cid('华润建材'), amount: 120000, status: 'paid', orderDate: dateOnly(-90), dueDate: dateOnly(-30) },
      { userId: uid, customerId: cid('华润建材'), amount: 80000, status: 'pending', orderDate: dateOnly(-5), dueDate: dateOnly(25) },
      { userId: uid, customerId: cid('蓝湾地产'), amount: 210000, status: 'overdue', orderDate: dateOnly(-45), dueDate: dateOnly(-15) },
      { userId: uid, customerId: cid('蓝湾地产'), amount: 95000, status: 'overdue', orderDate: dateOnly(-30), dueDate: dateOnly(-5) },
      { userId: uid, customerId: cid('星河科技'), amount: 150000, status: 'pending', orderDate: dateOnly(-20), dueDate: dateOnly(10) },
      { userId: uid, customerId: cid('星河科技'), amount: 90000, status: 'paid', orderDate: dateOnly(-70), dueDate: dateOnly(-40) },
      { userId: uid, customerId: cid('临海制造'), amount: 2800000, status: 'overdue', orderDate: dateOnly(-120), dueDate: dateOnly(-40) },
      { userId: uid, customerId: cid('恒达物流'), amount: 600000, status: 'pending', orderDate: dateOnly(-8), dueDate: dateOnly(22) },
      { userId: uid, customerId: cid('远山贸易'), amount: 88000, status: 'paid', orderDate: dateOnly(-100), dueDate: dateOnly(-70) },
      { userId: uid, customerId: cid('远山贸易'), amount: 45000, status: 'paid', orderDate: dateOnly(-40), dueDate: dateOnly(-10) },
      { userId: uid, customerId: cid('云帆软件'), amount: 66000, status: 'paid', orderDate: dateOnly(-200), dueDate: dateOnly(-170) },
    ]);

    await crmActivityRepo.save([
      { userId: uid, customerId: cid('华润建材'), type: 'call', summary: '电话沟通：采购总监反馈总部回款流程调整，预计下周付款。', happenedAt: at(-3, 14) },
      { userId: uid, customerId: cid('华润建材'), type: 'email', summary: '发送催款函 + 逾期订单明细清单。', happenedAt: at(-8, 10) },
      { userId: uid, customerId: cid('蓝湾地产'), type: 'call', summary: '项目负责人电话未接，留言催收。', happenedAt: at(-2, 15) },
      { userId: uid, customerId: cid('蓝湾地产'), type: 'meeting', summary: '面谈：财务表示资金优先偿还银行贷款，本月无回款。', happenedAt: at(-12, 9) },
      { userId: uid, customerId: cid('临海制造'), type: 'call', summary: '与 CFO 通话：确认 280 万订单分期支付方案，第一批下月初。', happenedAt: at(-1, 16) },
      { userId: uid, customerId: cid('星河科技'), type: 'meeting', summary: '续约谈判：对方要求折扣 8%，待内部审批。', happenedAt: at(-4, 11) },
      { userId: uid, customerId: cid('新芽教育'), type: 'email', summary: '发送产品演示资料与报价单。', happenedAt: at(-2, 9) },
      { userId: uid, customerId: cid('恒达物流'), type: 'call', summary: '确认新订单交付细节。', happenedAt: at(-1, 13) },
      { userId: uid, customerId: cid('远山贸易'), type: 'email', summary: '季度回访，客户反馈服务满意。', happenedAt: at(-20, 10) },
    ]);

    await crmTaskRepo.save([
      { userId: uid, customerId: cid('华润建材'), title: '跟进华润 45 万逾期订单回款', description: '确认下周付款计划，必要时升级商务。', dueDate: at(1, 17), status: 'pending' },
      { userId: uid, customerId: cid('华润建材'), title: '与华润确认新订单交付排期', dueDate: at(3, 11), status: 'pending' },
      { userId: uid, customerId: cid('蓝湾地产'), title: '催收蓝湾两笔逾期订单（30.5 万）', description: '电话 + 上门双线推进。', dueDate: at(2, 15), status: 'pending' },
      { userId: uid, customerId: cid('蓝湾地产'), title: '整理蓝湾回款风险报告', dueDate: at(-1, 18), status: 'pending' },
      { userId: uid, customerId: cid('临海制造'), title: '推进临海 280 万分期方案签约', description: '第一批付款协议初稿。', dueDate: at(5, 10), status: 'pending' },
      { userId: uid, customerId: cid('星河科技'), title: '内部确认星河续约折扣', dueDate: at(2, 16), status: 'in_progress' },
      { userId: uid, customerId: cid('新芽教育'), title: '准备新芽教育产品演示', dueDate: at(3, 14), status: 'pending' },
      { userId: uid, customerId: cid('恒达物流'), title: '确认恒达新订单交付细节', dueDate: at(-2, 17), status: 'completed' },
      { userId: uid, customerId: cid('云帆软件'), title: '云帆年度回访（低强度）', dueDate: at(10, 10), status: 'pending' },
    ]);

    await crmRiskRepo.save([
      { userId: uid, customerId: cid('华润建材'), level: 'high', reason: '45 万订单逾期 10 天，历史回款周期变长。', detectedAt: at(-7, 9) },
      { userId: uid, customerId: cid('蓝湾地产'), level: 'high', reason: '两笔订单逾期合计 30.5 万，项目资金承压。', detectedAt: at(-10, 9) },
      { userId: uid, customerId: cid('临海制造'), level: 'critical', reason: '单笔 280 万订单逾期 40 天，客户资金链紧张。', detectedAt: at(-15, 9) },
      { userId: uid, customerId: cid('星河科技'), level: 'medium', reason: '续约谈判未定，订单临近到期。', detectedAt: at(-5, 9) },
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
          '进入 Server-NestJS 目录，cp .env.example .env，npm install，npm run start:dev 即可启动开发后端，默认 SQLite 零配置，首次启动自动创建演示账号 alex / 123456。',
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

  return true;
}
