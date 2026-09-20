// SPDX-License-Identifier: Apache-2.0

import { ToolPresentationService } from './tool-presentation.service';
import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistry } from './tool-registry';
import { ToolGateService } from './tool-gate.service';
import { ExternalToolRegistry } from './external-tool-registry';
import { AiConfirmationRequest } from '../approvals/ai-confirmation-request.entity';

/**
 * 呈现/摘要域单测（阶段 3 第八刀从 `ai.service.spec.ts` 整段搬来，**断言一字未改**；
 * `describeConfirmation` 那组为搬迁时新增的护栏，已标注）。
 */
describe('ToolPresentationService（呈现/摘要域）', () => {
  let presentation: ToolPresentationService;
  let mockToolRegistry: jest.Mocked<ToolRegistry>;
  let externalTools: ExternalToolRegistry;

  beforeEach(() => {
    mockToolRegistry = {
      getToolDefinitions: jest.fn().mockReturnValue([]),
      execute: jest.fn(),
      register: jest.fn(),
      getTool: jest.fn(),
      getAllTools: jest.fn(),
      requiresConfirmation: jest.fn().mockReturnValue(false),
      riskLevel: jest.fn().mockReturnValue('R1'),
    } as any;
    externalTools = new ExternalToolRegistry();
    const gate = new ToolGateService(mockToolRegistry as any, externalTools);
    const toolExecution = new ToolExecutionService(mockToolRegistry as any, gate, externalTools);
    presentation = new ToolPresentationService(mockToolRegistry as any, toolExecution);
  });

  describe('摘要文案（与拆分前逐字同断言）', () => {
    it('summarizeReadTool 各分支', () => {
      const s = presentation;
      expect(s.summarizeReadTool('query_events')).toBe('查询事件');
      expect(s.summarizeReadTool('count_events_by_status')).toBe('统计事件');
      expect(s.summarizeReadTool('query_events_by_keyword')).toBe('搜索事件');
      expect(s.summarizeReadTool('get_user_stats')).toBe('获取用户统计');
      expect(s.summarizeReadTool('navigate_page')).toBe('页面跳转');
      expect(s.summarizeReadTool('query_customers')).toBe('查询客户');
      expect(s.summarizeReadTool('analyze_customer_risk')).toBe('分析客户风险');
      expect(s.summarizeReadTool('unknown_tool')).toBe('执行工具调用');
    });

    it('summarizeToolResult 成功/失败/各工具分支', () => {
      const s = presentation;
      expect(s.summarizeToolResult('query_events', { success: true, data: [1, 2] })).toBe('查询到 2 个结果');
      expect(s.summarizeToolResult('count_events_by_status', { success: true, data: { total: 5 } })).toBe('共 5 个事件');
      expect(s.summarizeToolResult('count_events_by_status', { success: true, data: {} })).toBe('统计完成');
      expect(s.summarizeToolResult('create_event', { success: true, data: { id: 1 } })).toBe('创建事件成功');
      expect(s.summarizeToolResult('navigate_page', { success: true, data: { description: '设置' } })).toBe('跳转至设置');
      expect(s.summarizeToolResult('x', { success: true, data: {} })).toBe('执行完成');
      expect(s.summarizeToolResult('x', { success: false, error: 'boom' })).toBe('boom');
    });

    it('summarizeWriteTool 写操作摘要分支（确认卡片文案）', () => {
      const s = presentation;
      expect(s.summarizeWriteTool('create_event', { title: '评审', startTime: '10:00', endTime: '11:00' })).toBe('创建事件：评审（10:00 至 11:00）');
      expect(s.summarizeWriteTool('create_todo', { title: '周报', dueDate: '2026-08-20' })).toBe('创建待办：周报（截止 2026-08-20）');
      expect(s.summarizeWriteTool('create_todo', { title: '无截止' })).toBe('创建待办：无截止');
      expect(s.summarizeWriteTool('create_customers', { name: '张三' })).toBe('创建客户：张三');
      expect(s.summarizeWriteTool('create_followup_task', { title: '跟进' })).toBe('创建跟进任务：跟进');
      expect(s.summarizeWriteTool('unknown', {})).toBe('执行写操作');
    });

    it('HS-5: should truncate oversized tool results (array)', () => {
      const svc = presentation as any;
      const bigData = Array.from({ length: 500 }, (_, i) => ({ id: i, title: `Event ${i}`.repeat(10) }));
      const json = svc.truncateToolResult({ success: true, data: bigData });
      expect(json).toContain('_truncated');
      expect(json.length).toBeLessThan(5000);
      // 数组被截断到前 N 条
      expect(JSON.parse(json).data).toHaveLength(20);
    });

    it('HS-5: should truncate oversized object results', () => {
      const svc = presentation as any;
      const hugeObj: Record<string, string> = {};
      for (let i = 0; i < 200; i++) hugeObj[`key${i}`] = 'x'.repeat(50);
      const json = svc.truncateToolResult({ success: true, data: hugeObj });
      expect(json.length).toBeLessThan(5000);
      expect(json).toContain('_truncated');
    });

    it('HS-5: should keep small tool results unchanged', () => {
      const svc = presentation as any;
      const small = { success: true, data: [{ id: 1, title: 'Meeting' }] };
      const json = svc.truncateToolResult(small);
      expect(json).toBe(JSON.stringify(small));
      expect(json).not.toContain('_truncated');
    });

    it('§22.17 ④：撤销口径遇未注册名（外部 mcp_*）不抛错——否则会打挂确认卡', () => {
      // 真实注册表对未注册名抛错；revokeClass 必须容错（同门控 / isProxyTool 的既有约定）
      mockToolRegistry.getTool.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_send_email" not found');
      });
      expect(presentation.revokeClass('mcp_wx_send_email')).toBeUndefined();
    });
  });

  // ── 以下一组为搬迁时**新增**的护栏：describeConfirmation 此前无直接覆盖 ──

  describe('搬迁时新增的护栏：describeConfirmation 三种展示模式', () => {
    const row = (over: Partial<AiConfirmationRequest>): AiConfirmationRequest =>
      ({
        token: 'tok-1',
        toolName: 'create_event',
        args: '{"title":"评审"}',
        operatorId: '42',
        riskLevel: 'R3',
        kind: 'single',
        status: 'pending',
        ...over,
      }) as AiConfirmationRequest;

    it('R3 单条 → mode=immediate，摘要取写工具文案', () => {
      const d = presentation.describeConfirmation(row({}));
      expect(d.mode).toBe('immediate');
      expect(d.summary).toBe('创建事件：评审（? 至 ?）');
      expect(d.run).toBeNull();
    });

    it('R4 单条 → mode=approval（同一行、不同档位就是不同展示）', () => {
      expect(presentation.describeConfirmation(row({ riskLevel: 'R4' })).mode).toBe('approval');
    });

    it('run 行 → mode=run，摘要为批次数、run 快照可读；坏 JSON 按空处理不藏整行', () => {
      const items = [{ toolName: 'create_event', args: {} }, { toolName: 'create_todo', args: {} }];
      const ok = presentation.describeConfirmation(
        row({ kind: 'run', riskLevel: 'R4', toolName: 'run', runItems: JSON.stringify(items) }),
      );
      expect(ok.mode).toBe('run');
      expect(ok.summary).toBe('一次授权整批（2 个动作）');
      expect(ok.run?.items).toHaveLength(2);

      const broken = presentation.describeConfirmation(
        row({ kind: 'run', riskLevel: 'R4', toolName: 'run', runItems: '{not json' }),
      );
      expect(broken.mode).toBe('run');
      expect(broken.summary).toBe('一次授权整批（0 个动作）');
      expect(broken.run?.items).toEqual([]);
    });

    it('参数 JSON 坏掉 → 摘要仍产出（不让坏数据打挂确认卡）', () => {
      const d = presentation.describeConfirmation(row({ args: '{broken' }));
      expect(d.mode).toBe('immediate');
      expect(d.summary).toBe('创建事件：（? 至 ?）');
    });
  });
});
