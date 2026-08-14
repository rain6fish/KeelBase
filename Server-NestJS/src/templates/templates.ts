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

export const APP_TEMPLATES: AppTemplate[] = [
  PERSONAL_ASSISTANT_TEMPLATE,
  TEAM_SCHEDULE_TEMPLATE,
];
