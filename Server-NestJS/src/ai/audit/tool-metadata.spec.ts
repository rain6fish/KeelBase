// SPDX-License-Identifier: Apache-2.0

import { TOOL_METADATA, toolLabelKey } from './tool-metadata';
import { aiActionLabel } from './ai-feature-map';
import { deriveAiBusinessEvent } from './ai-business-event';

/**
 * The two views now come from one table, so what these cases pin is the table's reach: the labels
 * that used to sit under names no tool has are reachable through the real names, and the i18n key is
 * derived rather than written down (a hand-written key is one more thing that can drift from the
 * name beside it).
 *
 * 两个视图现在同出一表，所以这些用例钉的是表的**覆盖面**：原先挂在「不存在的名字」下的标签，
 * 经真名可达；而 i18n key 是**派生**的，不是写下来的（手写的 key 只是又一个会跟旁边的名字漂开的东西）。
 */
describe('tool-metadata（工具业务语义单一真源）', () => {
  it('i18n key 机械派生：snake_case → ai.tool.<camelCase>（与前端 toolKey 同一约定）', () => {
    expect(toolLabelKey('create_followup_task')).toBe('ai.tool.createFollowupTask');
    expect(toolLabelKey('query_events_by_keyword')).toBe('ai.tool.queryEventsByKeyword');
    // 下划线后是**数字**时不大写 —— 这正是 Vue `toolKey` 的行为，两边必须逐字一致：
    // 派生得「更好看」但与前端的 key 对不上，标签就落回英文兜底（等于白做）。
    expect(toolLabelKey('summarize_customer_360')).toBe('ai.tool.summarizeCustomer_360');
  });

  it('标签：原先挂在死名下的四条标签，现在经真名可达', () => {
    expect(aiActionLabel('tool_call', 'query_customer_contacts({})')).toEqual({
      key: 'ai.tool.queryCustomerContacts',
      fallback: 'Query contacts',
    });
    expect(aiActionLabel('tool_call', 'query_customer_opportunities({})')).toEqual({
      key: 'ai.tool.queryCustomerOpportunities',
      fallback: 'Query opportunities',
    });
    expect(aiActionLabel('tool_call', 'get_user_stats({})')).toEqual({
      key: 'ai.tool.getUserStats',
      fallback: 'Query user stats',
    });
    expect(aiActionLabel('tool_call', 'summarize_customer_360({})')).toEqual({
      key: 'ai.tool.summarizeCustomer_360',
      fallback: 'Summarize customer',
    });
  });

  it('标签：新增覆盖的工具也有标签（此前落进「AI · Tool call · <名>」兜底）', () => {
    expect(aiActionLabel('tool_call', 'create_report({})')).toEqual({
      key: 'ai.tool.createReport',
      fallback: 'Create report',
    });
    expect(aiActionLabel('tool_call', 'delete_customer({})')).toEqual({
      key: 'ai.tool.deleteCustomer',
      fallback: 'Delete customer',
    });
  });

  it('业务事件：由同一表派生；含数字工具名也能取到', () => {
    expect(deriveAiBusinessEvent('create_event')).toBe('EventCreated');
    expect(deriveAiBusinessEvent('create_followup_task')).toBe('FollowupTaskCreated');
    // 外部（B 路径代理）工具的事件保留 —— 它不注册在本仓，但事件是真的产出
    expect(deriveAiBusinessEvent('update_customer_status')).toBe('CustomerStatusUpdated');
  });

  it('表内每条都带非空英文标签（空标签 = 前端回退成空串）', () => {
    for (const [name, meta] of Object.entries(TOOL_METADATA)) {
      expect(meta.label?.length).toBeGreaterThan(0);
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
