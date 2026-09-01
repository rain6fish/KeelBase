// SPDX-License-Identifier: Apache-2.0

/**
 * 子代理定义 — 每个子代理有独立的 system prompt + 受限工具子集。
 * 子代理只读（不包含写工具），写操作由主线程走流式确认。
 */

export interface SubAgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  /** 只读工具名（ToolRegistry 注册名子集） */
  tools: string[];
}

export const SUB_AGENTS: Record<string, SubAgentDefinition> = {
  calendar: {
    name: 'calendar',
    description: '日程/事件助手：查询事件列表、按状态统计、关键词搜索事件',
    systemPrompt:
      '你是日程助手。负责查询和整理用户的事件/日程数据。' +
      '只使用提供的查询工具获取真实数据，不要编造。返回结构化的日程摘要。',
    tools: ['query_events', 'count_events_by_status', 'query_events_by_keyword'],
  },
  stats: {
    name: 'stats',
    description: '统计/洞察助手：统计事件状态分布、获取用户整体数据',
    systemPrompt:
      '你是数据分析助手。负责统计用户的事件状态分布和整体数据概况。' +
      '只使用提供的统计工具，基于真实数据给出结论。',
    tools: ['count_events_by_status', 'get_user_stats'],
  },
  organizer: {
    name: 'organizer',
    description: '安排/规划助手：综合日程与统计，识别冲突，给出优先级与时间分配建议',
    systemPrompt:
      '你是规划助手。综合之前获取的日程和统计数据，识别时间冲突，' +
      '输出优先级排序与每天的时间分配建议。若需要补充查询可使用提供的工具。',
    tools: ['query_events', 'count_events_by_status', 'query_events_by_keyword'],
  },
};

export const SUB_AGENT_NAMES: string[] = Object.keys(SUB_AGENTS);
