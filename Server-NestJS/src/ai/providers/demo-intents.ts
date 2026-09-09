// SPDX-License-Identifier: Apache-2.0

/**
 * Demo Provider 用户首轮意图表（CE-1 B4-demo 单源 declare）。
 *
 * 运行时行为源 = 本表（demo-provider.decideFromUser 表驱动遍历，保序 = 原 if 链顺序）；
 * 机器语料副本 = `Server-NestJS/specs/protocol/demo-intent-v1.json`（跨语言可消费、可 diff）。
 * 双向漂移门禁 = `demo-intents.spec.ts`（断言 declare 序列化 == 语料 cases）——任一侧变更
 * 都必须先同步另一侧（CE-1 L3 单源规则）。语义源 = Protocol-freeze 前 Node 实现。
 */
export type DemoIntentArgsKind = 'none' | 'keyword' | 'customer' | 'followup' | 'delete';

export interface DemoIntentPattern {
  /** 稳定标识（语料/场景包引用锚） */
  key: string;
  /** 人类可读意图名 */
  name: string;
  /** 触发正则（无 /…/i 包裹，运行时以 i 构造） */
  pattern: string;
  /** 首轮路由的工具名 */
  tool: string;
  /** 固定前置文案（toolCall content；写/删演示内容与确认无关，保持原样） */
  content: string;
  /** 参数构造类别（见 demo-provider.buildUserIntentArgs） */
  argsKind: DemoIntentArgsKind;
  /** 是否写意图（需确认门控/演示阻断，供语料标注） */
  write: boolean;
}

export const DEMO_USER_INTENTS: DemoIntentPattern[] = [
  {
    key: 'delete_customer',
    name: '删除客户（R5 阻断演示）',
    pattern: '删除|delete',
    tool: 'delete_customer',
    content: '删除客户是不可逆的高风险操作（风险级 R5），将被系统策略阻断，不会执行…',
    argsKind: 'delete',
    write: false,
  },
  {
    key: 'query_customers',
    name: '分析客户风险 / 哪些客户值得关注',
    pattern: '风险|分析|客户|customer|值得跟进|重点关注|risk|analyze',
    tool: 'query_customers',
    content: '好的，我先查询客户列表…',
    argsKind: 'keyword',
    write: false,
  },
  {
    key: 'create_followup_task',
    name: '创建跟进任务',
    pattern: '跟进|任务|follow.?up|create.*task',
    tool: 'create_followup_task',
    content: '好的，我来为这位客户创建跟进任务（写操作需要你确认）…',
    argsKind: 'followup',
    write: true,
  },
  {
    key: 'query_customer_orders',
    name: '查询客户订单',
    pattern: '订单|order',
    tool: 'query_customer_orders',
    content: '好的，查询该客户的订单…',
    argsKind: 'customer',
    write: false,
  },
  {
    key: 'query_customer_activities',
    name: '查询客户跟进记录',
    pattern: '活动|跟进记录|activity',
    tool: 'query_customer_activities',
    content: '好的，查询该客户的跟进记录…',
    argsKind: 'customer',
    write: false,
  },
  {
    key: 'query_projects',
    name: '查询项目',
    pattern: '项目|project',
    tool: 'query_projects',
    content: '好的，查询项目列表…',
    argsKind: 'none',
    write: false,
  },
  {
    key: 'query_approval_requests',
    name: '查询审批请求',
    pattern: '审批|approval',
    tool: 'query_approval_requests',
    content: '好的，查询审批请求…',
    argsKind: 'none',
    write: false,
  },
  {
    key: 'query_events',
    name: '查询待办 / 事件',
    pattern: '待办|事件|event|todo',
    tool: 'query_events',
    content: '好的，查询你的待办…',
    argsKind: 'none',
    write: false,
  },
];
