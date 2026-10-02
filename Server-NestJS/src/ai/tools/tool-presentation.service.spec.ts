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
    it('readSummary：登记的复用工具标签 key；未登记返回 null（由各端自己的标签兜底）', () => {
      const s = presentation;
      // 与 ai-feature-map 同一个派生：key = ai.tool.<camelCase>，兜底取元数据里的英文标签
      expect(s.readSummary('query_events')).toEqual({ key: 'ai.tool.queryEvents', fallback: 'Query events' });
      expect(s.readSummary('count_events_by_status')).toEqual({
        key: 'ai.tool.countEventsByStatus',
        fallback: 'Count events by status',
      });
      expect(s.readSummary('get_user_stats')).toEqual({ key: 'ai.tool.getUserStats', fallback: 'Query user stats' });
      expect(s.readSummary('navigate_page')).toEqual({ key: 'ai.tool.navigatePage', fallback: 'Navigate page' });
      // 未登记工具不自作主张（旧实现给一句通用中文）
      expect(s.readSummary('unknown_tool')).toBeNull();
    });

    it('resultSummary：成功/失败/各工具分支（key + 参数 + 英文兜底）', () => {
      const s = presentation;
      expect(s.resultSummary('query_events', { success: true, data: [1, 2] })).toEqual({
        key: 'ai.present.result.rows',
        fallback: '2 result(s)',
        params: { count: '2' },
      });
      expect(s.resultSummary('count_events_by_status', { success: true, data: { total: 5 } })).toEqual({
        key: 'ai.present.result.count',
        fallback: '5 event(s)',
        params: { count: '5' },
      });
      expect(s.resultSummary('count_events_by_status', { success: true, data: {} })).toEqual({
        key: 'ai.present.result.done',
        fallback: 'Done',
      });
      expect(s.resultSummary('navigate_page', { success: true, data: { description: '设置' } })).toEqual({
        key: 'ai.present.result.navigate',
        fallback: 'Navigated to 设置',
        params: { description: '设置' },
      });
      expect(s.resultSummary('x', { success: true, data: {} })).toEqual({
        key: 'ai.present.result.done',
        fallback: 'Done',
      });
      // 失败沿用工具自己的错误文本作兜底（不改今天逐字显示的文案）
      expect(s.resultSummary('x', { success: false, error: 'boom' })).toEqual({
        key: 'ai.present.result.failed',
        fallback: 'boom',
      });
    });

    it('writeSummaryOrGeneric 写操作摘要分支（确认卡片文案）', () => {
      const s = presentation;
      expect(s.writeSummaryOrGeneric('create_event', { title: '评审', startTime: '10:00', endTime: '11:00' })).toEqual({
        key: 'ai.present.write.createEvent',
        fallback: 'Create event: 评审 (10:00 – 11:00)',
        params: { title: '评审', startTime: '10:00', endTime: '11:00' },
      });
      // 有截止与无截止是**两条 key**（模板里没法表达「有就加一段」），而不是拼半个句子
      expect(s.writeSummaryOrGeneric('create_todo', { title: '周报', dueDate: '2026-08-20' })).toEqual({
        key: 'ai.present.write.createTodoDue',
        fallback: 'Create todo: 周报 (due 2026-08-20)',
        params: { title: '周报', dueDate: '2026-08-20' },
      });
      expect(s.writeSummaryOrGeneric('create_todo', { title: '无截止' })).toEqual({
        key: 'ai.present.write.createTodo',
        fallback: 'Create todo: 无截止',
        params: { title: '无截止' },
      });
      expect(s.writeSummaryOrGeneric('unknown', {})).toEqual({
        key: 'ai.present.write.generic',
        fallback: 'Ran a write operation',
      });
    });

    it('writeSummary：无具体摘要的工具返回 null（run 聚合据此不并入该条）', () => {
      expect(presentation.writeSummary('delete_customer', { customerId: 7 })).toBeNull();
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
      expect(d.summary).toEqual({
        key: 'ai.present.write.createEvent',
        fallback: 'Create event: 评审 (? – ?)',
        params: { title: '评审', startTime: '?', endTime: '?' },
      });
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
      expect(ok.summary).toEqual({
        key: 'ai.present.runBatch',
        fallback: 'Authorize 2 action(s) in one batch',
        params: { count: '2' },
      });
      expect(ok.run?.items).toHaveLength(2);

      const broken = presentation.describeConfirmation(
        row({ kind: 'run', riskLevel: 'R4', toolName: 'run', runItems: '{not json' }),
      );
      expect(broken.mode).toBe('run');
      expect(broken.summary).toEqual({
        key: 'ai.present.runBatch',
        fallback: 'Authorize 0 action(s) in one batch',
        params: { count: '0' },
      });
      expect(broken.run?.items).toEqual([]);
    });

    it('参数 JSON 坏掉 → 摘要仍产出（不让坏数据打挂确认卡）', () => {
      const d = presentation.describeConfirmation(row({ args: '{broken' }));
      expect(d.mode).toBe('immediate');
      expect(d.summary).toEqual({
        key: 'ai.present.write.createEvent',
        fallback: 'Create event:  (? – ?)',
        params: { title: '', startTime: '?', endTime: '?' },
      });
    });
  });
});
