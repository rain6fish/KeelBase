// SPDX-License-Identifier: Apache-2.0

/**
 * Wiring tests for 0-B retention: they do not test the retention service (it has its own spec) —
 * they prove the chat paths **call it**, and that the `auditRowId` they hand over is the id of the
 * audit row that same tool call just wrote. Deleting or mis-wiring either `capture` call must turn
 * one of these red.
 *
 * 0-B 留存的**接线**测试：不测留存服务本身（它有自己的 spec）—— 测的是对话路径**确实调用了它**，
 * 且交出的 `auditRowId` 就是同一次工具调用刚写下的那条审计行的 id。删掉或接错任一处 `capture`，
 * 这里必红。
 */
import { aiService, installAiServiceTestbed, mockAuditService, mockProvider, mockSubAgentOrchestrator, mockToolRegistry, presentation } from '../../test/ai-service.testbed';

describe('AiService › retention wiring (0-B)', () => {
  let retention: { capture: jest.Mock };
  /** The id the audit mock reports for the *tool_call* row, so the assertion can compare against it. */
  const TOOL_AUDIT_ROW_ID = 4242;

  beforeEach(() => {
    retention = { capture: jest.fn().mockResolvedValue(undefined) };
    // The live module binding picks up the freshly built service and its injected retention.
    installAiServiceTestbed({ toolResultRetention: retention });
    mockAuditService.log.mockImplementation(async (entry: any) => ({
      id: entry?.action === 'tool_call' ? TOOL_AUDIT_ROW_ID : 100,
    }));
  });

  it('streaming chat: capture receives the tool_call audit row id and the call’s own fields', async () => {
    async function* toolRound() {
      yield {
        type: 'tool_call' as const,
        toolCall: { index: 0, id: 'call_1', name: 'query_events', arguments: '{"status":"active"}' },
      };
      yield { type: 'done' as const };
    }
    async function* answerRound() {
      yield { type: 'text' as const, content: 'Found one event' };
      yield { type: 'done' as const };
    }
    mockProvider.stream.mockReturnValueOnce(toolRound()).mockReturnValueOnce(answerRound());
    mockToolRegistry.execute.mockResolvedValue({ success: true, data: [{ id: 1 }] });

    for await (const _ of aiService.chatStream('1', { message: '查询我的事件' })) {
      // drain
    }

    const toolAuditEntry = (mockAuditService.log as jest.Mock).mock.calls
      .map((c) => c[0])
      .find((e) => e.action === 'tool_call');
    expect(toolAuditEntry).toBeDefined();

    expect(retention.capture).toHaveBeenCalledTimes(1);
    const captured = retention.capture.mock.calls[0][0] as {
      auditRowId: number;
      conversationId?: string;
      userId: string;
      toolName: string;
      result: { success: boolean };
      rendered?: unknown;
    };
    // (b) the retention row is anchored to the audit row this very call wrote.
    expect(captured.auditRowId).toBe(TOOL_AUDIT_ROW_ID);
    expect(toolAuditEntry).toMatchObject({ userId: '1', tool: 'query_events' });
    // (c) the fields agree with the call.
    expect(captured).toMatchObject({
      conversationId: 'conv-1',
      userId: '1',
      toolName: 'query_events',
      result: expect.objectContaining({ success: true }),
    });
    // The chat path already rendered the result for the model; retention must reuse that render.
    expect(captured.rendered).toBeDefined();
  });

  it('non-streaming chat: capture receives the tool_call audit row id and the call’s own fields', async () => {
    mockProvider.generate
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'call_2', name: 'query_events', arguments: '{"status":"active"}' }],
      })
      .mockResolvedValueOnce({ content: 'Found one event' });
    mockToolRegistry.execute.mockResolvedValue({ success: true, data: [{ id: 1 }] });

    await aiService.chat('1', { message: '查询我的事件' });

    const toolAuditEntry = (mockAuditService.log as jest.Mock).mock.calls
      .map((c) => c[0])
      .find((e) => e.action === 'tool_call');
    expect(toolAuditEntry).toBeDefined();

    expect(retention.capture).toHaveBeenCalledTimes(1);
    const captured = retention.capture.mock.calls[0][0] as {
      auditRowId: number;
      conversationId?: string;
      userId: string;
      toolName: string;
      result: { success: boolean };
      rendered?: unknown;
    };
    expect(captured.auditRowId).toBe(TOOL_AUDIT_ROW_ID);
    expect(toolAuditEntry).toMatchObject({ userId: '1', tool: 'query_events' });
    expect(captured).toMatchObject({
      conversationId: 'conv-1',
      userId: '1',
      toolName: 'query_events',
      result: expect.objectContaining({ success: true }),
    });
    expect(captured.rendered).toBeDefined();
  });

  it('sub-agent read executor: capture is anchored to its tool_call audit row', async () => {
    // Delegate, then have the orchestrator run the read-only executor it was handed.
    // 走委托，再让编排器调用交给它的只读执行器。
    (mockSubAgentOrchestrator.matchSkill as jest.Mock).mockReturnValue({ name: 'week-plan' });
    (mockSubAgentOrchestrator.run as jest.Mock).mockImplementation(async (opts: any) => {
      await opts.readOnlyExecutor('query_events', { status: 'active' }, '1');
      return { content: 'done', stepResults: ['a'] };
    });
    mockProvider.generate.mockResolvedValue({ content: '已为你安排本周', usage: { promptTokens: 1, completionTokens: 1 } });
    mockToolRegistry.execute.mockResolvedValue({ success: true, data: [{ id: 1 }] });

    await aiService.chat('1', { message: '帮我安排本周' });

    const toolAuditEntry = (mockAuditService.log as jest.Mock).mock.calls
      .map((c) => c[0])
      .find((e) => e.action === 'tool_call');
    expect(toolAuditEntry).toMatchObject({ userId: '1', tool: 'query_events' });
    expect(toolAuditEntry.parentActionId).toEqual(expect.any(String));

    expect(retention.capture).toHaveBeenCalledTimes(1);
    const captured = retention.capture.mock.calls[0][0] as {
      auditRowId: number;
      conversationId?: string;
      userId: string;
      toolName: string;
      result: { success: boolean };
      rendered?: unknown;
    };
    expect(captured).toMatchObject({
      auditRowId: TOOL_AUDIT_ROW_ID,
      conversationId: 'conv-1',
      userId: '1',
      toolName: 'query_events',
      result: expect.objectContaining({ success: true }),
    });
    // The orchestrator pushes `renderToolResult(result).text` to the model on this path (F1), and L1
    // makes retention record that same rendering — so `model_text` must be the model's actual input,
    // not a projection no model saw. Equality with the render of the captured result proves both.
    // 这条路径上编排器推给模型的就是 `renderToolResult(result).text`（F1），L1 让留存记下同一份渲染 ——
    // 故 `model_text` 必须是模型实收，而不是一份没人见过的投影。与「对 captured.result 的渲染」全等
    // 同时证明了两点。
    expect(captured.rendered).toEqual(presentation.renderToolResult(captured.result));
  });
});
