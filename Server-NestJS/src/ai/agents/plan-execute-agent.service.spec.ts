// SPDX-License-Identifier: Apache-2.0

import { PlanExecuteAgent } from './plan-execute-agent.service';

const mockProvider = {
  availableModels: ['deepseek-v4-flash'],
  generate: jest.fn(),
};

describe('PlanExecuteAgent', () => {
  const agent = new PlanExecuteAgent();
  const userId = '42';

  const toolRegistry = {
    execute: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider.generate.mockResolvedValue({ content: '' });
    toolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });
  });

  const messages = [{ role: 'user' as const, content: '分析本周安排' }];

  it('生成计划并按序执行工具、汇总结果', async () => {
    mockProvider.generate.mockResolvedValue({
      content: JSON.stringify([
        { description: '查事件', tool: 'query_events', args: { startDate: '2026-08-01' }, dependsOn: [] },
        { description: '统计', tool: 'count_events_by_status', args: {}, dependsOn: [0] },
      ]),
    });
    const result = await agent.planAndExecute(messages, mockProvider as any, toolRegistry as any, userId);
    expect(result.stepResults).toHaveLength(2);
    expect(result.content).toContain('步骤 1: 查事件');
    expect(result.content).toContain('步骤 2: 统计');
    expect(toolRegistry.execute).toHaveBeenNthCalledWith(1, 'query_events', { startDate: '2026-08-01' }, userId);
    expect(toolRegistry.execute).toHaveBeenNthCalledWith(2, 'count_events_by_status', {}, userId);
  });

  it('工具失败时步骤记为 ERROR，依赖该步骤的后续步骤跳过', async () => {
    mockProvider.generate.mockResolvedValue({
      content: JSON.stringify([
        { description: 'a', tool: 'query_events', args: {} },
        { description: 'b', tool: 'count_events_by_status', args: {}, dependsOn: [0] },
        { description: 'c', tool: 'get_user_stats', args: {} },
      ]),
    });
    toolRegistry.execute
      .mockResolvedValueOnce({ success: false, error: '权限不足' })
      .mockResolvedValueOnce({ success: true, data: {} });
    const result = await agent.planAndExecute(messages, mockProvider as any, toolRegistry as any, userId);
    expect(result.stepResults[0]).toBe('ERROR: 权限不足');
    expect(result.stepResults[1]).toBe('ERROR'); // 依赖失败跳过
    expect(result.stepResults[2]).not.toBe('ERROR');
  });

  it('工具抛异常时步骤记为 ERROR 信息', async () => {
    mockProvider.generate.mockResolvedValue({
      content: JSON.stringify([{ description: 'a', tool: 'query_events', args: {} }]),
    });
    toolRegistry.execute.mockRejectedValue(new Error('tool crash'));
    const result = await agent.planAndExecute(messages, mockProvider as any, toolRegistry as any, userId);
    expect(result.stepResults[0]).toBe('ERROR: tool crash');
  });

  it('JSON 解析失败回退为空结果', async () => {
    mockProvider.generate.mockResolvedValue({ content: '抱歉，无法规划' });
    const result = await agent.planAndExecute(messages, mockProvider as any, toolRegistry as any, userId);
    expect(result).toEqual({ content: '', stepResults: [] });
    expect(toolRegistry.execute).not.toHaveBeenCalled();
  });

  it('非数组 JSON 回退为空结果', async () => {
    mockProvider.generate.mockResolvedValue({ content: '{"not":"array"}' });
    const result = await agent.planAndExecute(messages, mockProvider as any, toolRegistry as any, userId);
    expect(result.stepResults).toEqual([]);
  });

  it('剥除代码块标记后解析 JSON', async () => {
    mockProvider.generate.mockResolvedValue({
      content: '```json\n[{"description":"a","tool":"get_user_stats","args":{}}]\n```',
    });
    const result = await agent.planAndExecute(messages, mockProvider as any, toolRegistry as any, userId);
    expect(result.stepResults).toHaveLength(1);
    expect(toolRegistry.execute).toHaveBeenCalledWith('get_user_stats', {}, userId);
  });

  it('NC-3 注入只读 executor：写工具步骤被拒且不经 toolRegistry.execute 直调', async () => {
    mockProvider.generate.mockResolvedValue({
      content: JSON.stringify([
        { description: '创建事件', tool: 'create_event', args: { title: 'x' }, dependsOn: [] },
        { description: '查事件', tool: 'query_events', args: {}, dependsOn: [] },
      ]),
    });
    const exec = jest.fn(async (tool: string) => {
      if (tool === 'create_event') {
        throw new Error('Tool "create_event" is write/confirmation-gated; plan and sub-agent steps are read-only');
      }
      return { success: true, data: { total: 2 } };
    });

    const result = await agent.planAndExecute(messages, mockProvider as any, toolRegistry as any, userId, undefined, exec);

    // 写工具步骤被门控 → ERROR；读工具步骤经 executor 正常执行；底层 registry 未被绕过直调
    expect(toolRegistry.execute).not.toHaveBeenCalled();
    expect(result.stepResults[0]).toContain('ERROR');
    expect(result.stepResults[0]).toContain('write/confirmation-gated');
    expect(result.stepResults[1]).toContain('2');
    expect(exec).toHaveBeenNthCalledWith(1, 'create_event', { title: 'x' }, userId);
    expect(exec).toHaveBeenNthCalledWith(2, 'query_events', {}, userId);
  });
});
