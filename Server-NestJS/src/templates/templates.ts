/**
 * PL-9 模板与示例应用：内置垂直 demo 种子数据，供管理台「一键导入」演示。
 * 每个模板含事件/待办种子，导入到指定用户（默认 admin）。
 */

export interface TemplateEventSeed {
  title: string;
  description?: string;
  startTime: string; // ISO
  endTime: string;
  location?: string;
  isCancelled?: boolean;
  reminderMinutes?: number;
}

export interface TemplateTodoSeed {
  title: string;
  description?: string;
  completed?: boolean;
  dueDate?: string;
}

export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  events: TemplateEventSeed[];
  todos: TemplateTodoSeed[];
  /** P1-9 旗舰模板：AI CRM 种子（客户 + 订单/任务/风险） */
  crm?: TemplateCrmSeed;
  /** P1-9 旗舰模板：AI Project 种子（项目 + 任务/风险） */
  pm?: TemplatePmSeed;
  /** P1-9 旗舰模板：AI Approval 种子（政策 + 请求） */
  approval?: TemplateApprovalSeed;
  /** 来源身份（§13.1 ④ 铺路）：官方模板来源声明，listTemplates 统一附上——「模板也带来源身份」示范 */
  provenance?: { source: 'keelbase'; templateId: string; keelbaseVersion: string };
}

/** AI CRM 模板种子 */
export interface TemplateCrmSeed {
  customers: Array<{
    name: string;
    company?: string;
    status?: string;
    riskLevel?: string;
    annualValue?: number;
    orders?: Array<{ amount: number; status?: string }>;
    tasks?: Array<{ title: string; dueDate?: string; status?: string }>;
    risks?: Array<{ level: string; reason: string }>;
  }>;
}

/** AI Project 模板种子 */
export interface TemplatePmSeed {
  projects: Array<{
    name: string;
    description?: string;
    status?: string;
    riskLevel?: string;
    endDate?: string;
    tasks?: Array<{ title: string; status?: string }>;
    risks?: Array<{ level: string; reason: string }>;
  }>;
}

/** AI Approval 模板种子 */
export interface TemplateApprovalSeed {
  policies?: Array<{ title: string; type?: string; maxAmount: number }>;
  requests?: Array<{ title: string; type?: string; amount: number; reason: string; status?: string }>;
}

/** 个人助理模板：围绕个人日程/待办/提醒的 demo */
export const PERSONAL_ASSISTANT_TEMPLATE: AppTemplate = {
  id: 'personal-assistant',
  name: '个人助理',
  description: '个人日程、待办与提醒的示例数据，演示基座日常使用场景',
  events: [
    {
      title: '周例会',
      description: '每周团队同步',
      startTime: '2026-08-17T09:00:00Z',
      endTime: '2026-08-17T09:30:00Z',
      location: '会议室 A',
      reminderMinutes: 5,
    },
    {
      title: '产品评审',
      description: '评审新版本功能',
      startTime: '2026-08-18T14:00:00Z',
      endTime: '2026-08-18T15:00:00Z',
    },
    {
      title: '健身房',
      startTime: '2026-08-19T19:00:00Z',
      endTime: '2026-08-19T20:00:00Z',
    },
  ],
  todos: [
    { title: '提交周报', dueDate: '2026-08-14' },
    { title: '预约体检', completed: true },
    { title: '读完《设计模式》第 3 章' },
  ],
};

/** 团队日程模板：演示多成员协作 + 事件提醒 */
export const TEAM_SCHEDULE_TEMPLATE: AppTemplate = {
  id: 'team-schedule',
  name: '团队日程',
  description: '团队协作场景的日程与任务示例，演示事件提醒与待办闭环',
  events: [
    {
      title: '每日站会',
      description: '15 分钟同步进度',
      startTime: '2026-08-17T10:00:00Z',
      endTime: '2026-08-17T10:15:00Z',
      reminderMinutes: 10,
    },
    {
      title: '迭代规划',
      startTime: '2026-08-20T13:30:00Z',
      endTime: '2026-08-20T16:00:00Z',
      location: '线上',
    },
  ],
  todos: [
    { title: '评审设计文档', dueDate: '2026-08-15' },
    { title: '修复线上告警' },
    { title: '发布 v1.2 版本' },
  ],
};

/** AI CRM 旗舰模板：客户/订单/任务/风险种子（含 AI 可分析的流失风险客户） */
export const CRM_TEMPLATE: AppTemplate = {
  id: 'crm-demo',
  name: 'AI CRM',
  description: '客户/订单/跟进/风险示例，演示「哪些客户本周最值得跟进」AI 分析闭环',
  events: [],
  todos: [],
  crm: {
    customers: [
      {
        name: '星辰科技',
        company: '星辰科技有限公司',
        status: 'active',
        riskLevel: 'low',
        annualValue: 1200000,
        orders: [{ amount: 450000, status: 'paid' }],
        tasks: [{ title: 'Q3 续约跟进', dueDate: '2026-09-15', status: 'pending' }],
        risks: [{ level: 'low', reason: '长期合作稳定，回款及时' }],
      },
      {
        name: '云帆商贸',
        company: '云帆商贸有限公司',
        status: 'churn_risk',
        riskLevel: 'high',
        annualValue: 300000,
        orders: [{ amount: 120000, status: 'overdue' }],
        tasks: [{ title: '流失客户挽回', status: 'pending' }],
        risks: [{ level: 'high', reason: '大额订单逾期 + 连续两月未续约' }],
      },
      {
        name: '凌云教育',
        company: '凌云教育科技',
        status: 'lead',
        riskLevel: 'medium',
        annualValue: 200000,
        tasks: [{ title: 'POC 演示预约', dueDate: '2026-08-22', status: 'pending' }],
        risks: [{ level: 'medium', reason: '竞争激烈，转化周期长' }],
      },
    ],
  },
};

/** AI Project Management 旗舰模板：项目/任务/风险种子 */
export const PM_TEMPLATE: AppTemplate = {
  id: 'pm-demo',
  name: 'AI Project',
  description: '项目/任务/风险示例，演示「判断项目延期风险」AI 分析闭环',
  events: [],
  todos: [],
  pm: {
    projects: [
      {
        name: '官网改版',
        description: '品牌升级 + 多端体验优化',
        status: 'active',
        riskLevel: 'medium',
        endDate: '2026-10-31',
        tasks: [{ title: '首页设计评审', status: 'pending' }, { title: '移动端适配', status: 'pending' }],
        risks: [{ level: 'medium', reason: '设计资源紧张，可能延期' }],
      },
      {
        name: '数据平台 v2',
        description: '实时指标 + 报表重构',
        status: 'planning',
        riskLevel: 'low',
        endDate: '2026-12-31',
      },
    ],
  },
};

/** AI Approval 旗舰模板：审批政策 + 请求种子（AI 预审分级演示） */
export const APPROVAL_TEMPLATE: AppTemplate = {
  id: 'approval-demo',
  name: 'AI Approval',
  description: '审批政策/请求示例，演示「AI 预审按政策分级：低风险自动通过 / 高风险人工复核」闭环',
  events: [],
  todos: [],
  approval: {
    policies: [
      { title: '差旅报销自动通过政策', type: 'reimbursement', maxAmount: 1000 },
      { title: '办公采购自动通过政策', type: 'purchase', maxAmount: 5000 },
    ],
    requests: [
      { title: '8 月差旅报销', type: 'reimbursement', amount: 800, reason: '客户拜访交通与住宿费', status: 'pending' },
      { title: '研发服务器采购', type: 'purchase', amount: 12000, reason: 'Q3 上线扩容', status: 'pending' },
    ],
  },
};

export const APP_TEMPLATES: AppTemplate[] = [
  PERSONAL_ASSISTANT_TEMPLATE,
  TEAM_SCHEDULE_TEMPLATE,
  CRM_TEMPLATE,
  PM_TEMPLATE,
  APPROVAL_TEMPLATE,
];
