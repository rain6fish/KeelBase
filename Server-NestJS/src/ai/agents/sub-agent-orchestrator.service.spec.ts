// SPDX-License-Identifier: Apache-2.0

import { SubAgentOrchestrator } from './sub-agent-orchestrator.service';
import { SkillsRegistry, WEEK_PLAN_SKILL } from '../skills/skills-registry';

describe('SubAgentOrchestrator', () => {
  let orchestrator: SubAgentOrchestrator;
  let mockProvider: any;
  let mockRegistry: any;
  const registry = new SkillsRegistry([WEEK_PLAN_SKILL]);

  beforeEach(() => {
    mockProvider = {
      availableModels: ['deepseek-v4-flash'],
      generate: jest.fn(),
    };
    mockRegistry = {
      getAllTools: jest.fn().mockReturnValue([]),
      requiresConfirmation: jest.fn().mockReturnValue(false),
      execute: jest.fn().mockResolvedValue({ success: true, data: 'ok' }),
      getToolDefinitions: jest.fn().mockReturnValue([]),
    };
    orchestrator = new SubAgentOrchestrator(registry);
    jest.clearAllMocks();
  });

  describe('skill-matched run (week-plan)', () => {
    it('should use fixed tasks WITHOUT calling decomposition LLM', async () => {
      // 每个子代理的工具循环：generate 返回纯文本（无 toolCalls）
      mockProvider.generate.mockResolvedValue({ content: '子代理结果', toolCalls: [] });

      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我安排本周',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });

      // 3 个任务 → 3 次 generate（各子代理一轮纯文本）
      expect(mockProvider.generate).toHaveBeenCalledTimes(3);
      expect(result.usedSkill).toBe('week-plan');
      expect(result.stepResults).toHaveLength(3);
      expect(result.content).toContain('步骤 1（calendar）');
      expect(result.content).toContain('步骤 2（stats）');
      expect(result.content).toContain('步骤 3（organizer）');
    });

    it('should pass prior results to later tasks as system context', async () => {
      mockProvider.generate.mockResolvedValue({ content: '结果', toolCalls: [] });
      await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我安排本周',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });

      // task 2 和 task 3 的 messages 应包含之前结果上下文（system 消息含「之前子代理」）
      const calls = mockProvider.generate.mock.calls;
      const task3Messages = calls[2][0].messages;
      expect(task3Messages.some((m: any) => String(m.content).includes('之前子代理'))).toBe(true);
    });

    it('should filter tool defs per sub-agent (calendar gets only its tools)', async () => {
      const tools = [
        { name: 'query_events', toToolDefinition: () => ({ name: 'query_events' }) },
        { name: 'count_events_by_status', toToolDefinition: () => ({ name: 'count_events_by_status' }) },
        { name: 'get_user_stats', toToolDefinition: () => ({ name: 'get_user_stats' }) },
      ];
      mockRegistry.getAllTools.mockReturnValue(tools);
      mockProvider.generate.mockResolvedValue({ content: '', toolCalls: [] });

      await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我安排本周',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });

      // stats 子代理只该拿到 count + get_user_stats
      const statsCall = mockProvider.generate.mock.calls[1];
      const statsTools = statsCall[0].tools.map((t: any) => t.name).sort();
      expect(statsTools).toEqual(['count_events_by_status', 'get_user_stats']);
    });
  });

  describe('LLM decomposition (no skill match)', () => {
    it('should call decomposition and parse fence-stripped JSON', async () => {
      mockProvider.generate
        .mockResolvedValueOnce({
          content: '```json\n{"tasks":[{"subAgent":"calendar","query":"查日程"},{"subAgent":"organizer","query":"给建议"}]}\n```',
          toolCalls: [],
        })
        .mockResolvedValue({ content: '子代理结果', toolCalls: [] });

      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '综合分析我的日程',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });

      expect(result.usedSkill).toBeUndefined();
      expect(result.stepResults).toHaveLength(2);
      // 分解 1 次 + 两个子代理各 1 次 = 3 次 generate
      expect(mockProvider.generate).toHaveBeenCalledTimes(3);
    });

    it('should filter unknown sub-agents during decomposition and keep valid ones', async () => {
      mockProvider.generate
        .mockResolvedValueOnce({
          content: '{"tasks":[{"subAgent":"nonexistent","query":"x"},{"subAgent":"calendar","query":"查"}]}',
        })
        .mockResolvedValue({ content: '结果', toolCalls: [] });

      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我综合看看',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });

      // 未知 subAgent 在分解阶段被过滤 → 只剩 calendar
      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0]).toBe('结果');
      expect(mockProvider.generate).toHaveBeenCalledTimes(2); // 分解 + calendar
    });

    it('should return empty stepResults on invalid decomposition', async () => {
      mockProvider.generate.mockResolvedValueOnce({ content: 'not json', toolCalls: [] });
      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我综合看看',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });
      expect(result.stepResults).toEqual([]);
      expect(result.content).toBe('');
    });
  });

  describe('tool loop safety', () => {
    it('should refuse write tools leaked into a sub-agent', async () => {
      mockRegistry.requiresConfirmation.mockImplementation((name: string) => name === 'create_event');
      const calls = [
        {
          content: '',
          toolCalls: [
            { id: 'call_1', name: 'create_event', arguments: '{}' },
          ],
        },
        { content: '子代理总结', toolCalls: [] },
        // 后续子代理任务：纯文本
        { content: 'stats', toolCalls: [] },
        { content: 'organizer', toolCalls: [] },
      ];
      let callIdx = 0;
      mockProvider.generate.mockImplementation(async () => calls[Math.min(callIdx++, calls.length - 1)]);

      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我安排本周',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });

      // create_event 未被执行
      expect(mockRegistry.execute).not.toHaveBeenCalled();
      expect(result.stepResults[0]).toContain('子代理总结');
    });

    it('should refuse tools not in the sub-agent tool set', async () => {
      const calls = [
        {
          content: '',
          toolCalls: [{ id: 'call_1', name: 'get_user_stats', arguments: '{}' }],
        },
        { content: 'ok', toolCalls: [] },
        { content: 'stats', toolCalls: [] },
        { content: 'organizer', toolCalls: [] },
      ];
      let callIdx = 0;
      mockProvider.generate.mockImplementation(async () => calls[Math.min(callIdx++, calls.length - 1)]);

      // calendar 子代理不含 get_user_stats
      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我安排本周',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });

      expect(mockRegistry.execute).not.toHaveBeenCalled();
      expect(result.stepResults[0]).toContain('ok');
    });

    it('SubAgent 工具执行以发起者 userId 作用域（他人数据不可达）', async () => {
      mockRegistry.getAllTools.mockReturnValue([
        { name: 'query_events', toToolDefinition: () => ({ name: 'query_events' }) },
        { name: 'count_events_by_status', toToolDefinition: () => ({ name: 'count_events_by_status' }) },
        { name: 'get_user_stats', toToolDefinition: () => ({ name: 'get_user_stats' }) },
      ]);
      const calls = [
        { content: '', toolCalls: [{ id: 'call_1', name: 'query_events', arguments: '{}' }] },
        { content: '日程', toolCalls: [] },
        { content: '统计', toolCalls: [] },
        { content: '建议', toolCalls: [] },
      ];
      let callIdx = 0;
      mockProvider.generate.mockImplementation(async () => calls[Math.min(callIdx++, calls.length - 1)]);

      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我安排本周',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '42',
      });

      // calendar 子代理的 query_events 以发起者 userId（42）执行——工具查询按本人作用域，他人数据不可达
      expect(mockRegistry.execute).toHaveBeenCalledWith('query_events', expect.anything(), '42');
      expect(result.stepResults[0]).toContain('日程');
    });

    it('NC-3 注入 readOnlyExecutor：子代理经 executor 执行，不直调 toolRegistry.execute', async () => {
      mockRegistry.getAllTools.mockReturnValue([
        { name: 'query_events', toToolDefinition: () => ({ name: 'query_events' }) },
        { name: 'count_events_by_status', toToolDefinition: () => ({ name: 'count_events_by_status' }) },
        { name: 'get_user_stats', toToolDefinition: () => ({ name: 'get_user_stats' }) },
      ]);
      const calls = [
        { content: '', toolCalls: [{ id: 'call_1', name: 'query_events', arguments: '{}' }] },
        { content: '日程', toolCalls: [] },
        { content: '统计', toolCalls: [] },
        { content: '建议', toolCalls: [] },
      ];
      let callIdx = 0;
      mockProvider.generate.mockImplementation(async () => calls[Math.min(callIdx++, calls.length - 1)]);
      const exec = jest.fn().mockResolvedValue({ success: true, data: 'gated-ok' });

      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我安排本周',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '42',
        readOnlyExecutor: exec,
      });

      // 工具执行改走 AiService 注入的门控 executor（_assertToolAllowed + 只读强制），不再绕过直调 registry
      expect(mockRegistry.execute).not.toHaveBeenCalled();
      expect(exec).toHaveBeenCalledWith('query_events', {}, '42');
      expect(result.stepResults[0]).toContain('日程');
    });
  });

  describe('补充覆盖', () => {
    it('matchSkill 委托 skillsRegistry', () => {
      expect(orchestrator.matchSkill('帮我安排本周')).not.toBeNull();
      expect(orchestrator.matchSkill('不相关的请求')).toBeNull();
    });

    it('子代理 LLM 调用失败返回 ERROR', async () => {
      mockProvider.generate
        .mockResolvedValueOnce({ content: '{"tasks":[{"subAgent":"calendar","query":"q"}]}', toolCalls: [] })
        .mockRejectedValue(new Error('provider down'));

      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我综合看看',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });
      expect(result.stepResults[0]).toContain('ERROR');
    });

    it('子代理工具循环超过最大轮数返回提示', async () => {
      // 分解 1 个任务；子代理 generate 每次都返回 toolCall → 循环到 MAX 轮
      const toolCall = { id: 'c1', name: 'query_events', arguments: '{}' };
      mockProvider.generate
        .mockResolvedValueOnce({ content: '{"tasks":[{"subAgent":"calendar","query":"q"}]}', toolCalls: [] })
        .mockResolvedValue({ content: '', toolCalls: [toolCall] });

      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我综合看看',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });
      expect(result.stepResults[0]).toBe('子代理执行超出最大轮数');
    });

    it('工具参数非法 JSON 时 executeSafe 返回错误', async () => {
      mockProvider.generate
        .mockResolvedValueOnce({ content: '{"tasks":[{"subAgent":"calendar","query":"q"}]}', toolCalls: [] })
        .mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'c1', name: 'query_events', arguments: 'not-json' }] })
        .mockResolvedValue({ content: 'done', toolCalls: [] });

      const result = await orchestrator.run({
        messages: [{ role: 'system', content: 'sys' }],
        userRequest: '帮我综合看看',
        provider: mockProvider,
        toolRegistry: mockRegistry as any,
        userId: '1',
      });
      // 工具解析失败不阻断，最终子代理给出文本结果
      expect(result.stepResults[0]).toBe('done');
    });
  });
});
