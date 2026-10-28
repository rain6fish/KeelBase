// SPDX-License-Identifier: Apache-2.0


import { NotFoundException } from '@nestjs/common';

import { StreamChunk } from './interfaces/llm-provider.interface';
import { AuthorizationDeniedError } from './interfaces/tool.interface';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aiService, confirmationStore, installAiServiceTestbed, mockAuditService, mockConversationService, mockProvider, mockProviderFactory, mockTool, mockToolGate, mockToolRegistry, presentation, r4Approval, toolExecution, wiredSchema } from '../../test/ai-service.testbed';

beforeEach(installAiServiceTestbed);

  describe('AiService › chatStream()', () => {
    it('should yield text chunks from provider', async () => {
      async function* mockStream() {
        yield { type: 'text' as const, content: 'Hello' };
        yield { type: 'text' as const, content: ' world' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      expect(chunks.filter((c) => c.type === 'text').length).toBe(2);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('should record token usage from the stream in the chat audit', async () => {
      async function* mockStream() {
        yield { type: 'text' as const, content: 'Hello' };
        yield { type: 'done' as const, usage: { promptTokens: 1200, completionTokens: 34 } };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      for await (const _ of aiService.chatStream('1', { message: 'Hi' })) {
        // drain
      }

      const chatAudit = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e) => e.action === 'chat' && e.conversationId);
      expect(chatAudit).toBeDefined();
      expect(chatAudit.promptTokens).toBe(1200);
      expect(chatAudit.completionTokens).toBe(34);
    });

    it('should sum token usage across tool rounds', async () => {
      async function* firstRound() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'call_1', name: 'query_events', arguments: '{}' },
        };
        yield { type: 'done' as const, usage: { promptTokens: 1000, completionTokens: 20 } };
      }
      async function* secondRound() {
        yield { type: 'text' as const, content: 'Found: Meeting' };
        yield { type: 'done' as const, usage: { promptTokens: 2000, completionTokens: 50 } };
      }
      mockProvider.stream
        .mockReturnValueOnce(firstRound())
        .mockReturnValueOnce(secondRound());
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Meeting' }],
      });

      for await (const _ of aiService.chatStream('1', { message: 'My events' })) {
        // drain
      }

      const chatAudit = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e) => e.action === 'chat' && e.conversationId);
      // 工具轮次的两次 LLM 调用都要计入——只取最后一轮会漏掉首轮开销
      expect(chatAudit.promptTokens).toBe(3000);
      expect(chatAudit.completionTokens).toBe(70);
    });

    it('should handle tool calls from stream and continue streaming', async () => {
      async function* mockStreamWithToolCall() {
        yield { type: 'text' as const, content: 'Let me check' };
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'query_events',
            arguments: '{"startDate":"2026-07-01"}',
          },
        };
        yield { type: 'done' as const };
      }
      // Second stream call after tool execution
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: 'Found: Meeting' };
        yield { type: 'done' as const };
      }

      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithToolCall())
        .mockReturnValueOnce(mockStreamAfterTool());

      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'Meeting' }],
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'My events' })) {
        chunks.push(chunk);
      }

      // Should have text from both rounds, ending with done
      const textChunks = chunks.filter((c) => c.type === 'text');
      expect(textChunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[chunks.length - 1].type).toBe('done');
      // Should have called stream twice (first for tool call, second for result)
      expect(mockProvider.stream).toHaveBeenCalledTimes(2);
    });

    it('should yield error when stream returns error', async () => {
      async function* mockErrorStream() {
        yield { type: 'error' as const, error: 'API Error' };
      }
      mockProvider.stream.mockReturnValue(mockErrorStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      expect(chunks[0].type).toBe('error');
    });

    it('should fallback to a backup provider when the primary stream errors before content (CR-28)', async () => {
      const fallbackProvider = {
        name: 'qwen',
        displayName: 'Qwen',
        availableModels: [],
        isOpenAICompatible: jest.fn().mockReturnValue(true),
        generate: jest.fn(),
        stream: jest.fn(),
      };
      mockProviderFactory.getProvider.mockImplementation((name: string) =>
        name === 'qwen' ? fallbackProvider : mockProvider,
      );
      async function* primaryError() {
        yield { type: 'error' as const, error: 'Rate limited' };
      }
      async function* fallbackOk() {
        yield { type: 'text' as const, content: 'Fallback OK' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(primaryError());
      fallbackProvider.stream.mockReturnValue(fallbackOk());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      const textChunks = chunks.filter((c) => c.type === 'text');
      expect(textChunks.map((c) => (c as any).content)).toContain('Fallback OK');
      // 主 provider 的首块错误被回退吞掉，不应透传给客户端
      expect(
        chunks.some(
          (c) => c.type === 'error' && (c as any).error === 'Rate limited',
        ),
      ).toBe(false);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('should fallback when provider.stream throws before yielding content (CR-28)', async () => {
      const fallbackProvider = {
        name: 'qwen',
        displayName: 'Qwen',
        availableModels: [],
        isOpenAICompatible: jest.fn().mockReturnValue(true),
        generate: jest.fn(),
        stream: jest.fn(),
      };
      mockProviderFactory.getProvider.mockImplementation((name: string) =>
        name === 'qwen' ? fallbackProvider : mockProvider,
      );
      mockProvider.stream.mockImplementation(() => {
        throw new Error('network down');
      });
      async function* fallbackOk() {
        yield { type: 'text' as const, content: 'Recovered' };
        yield { type: 'done' as const };
      }
      fallbackProvider.stream.mockReturnValue(fallbackOk());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      expect(chunks.filter((c) => c.type === 'text').map((c) => (c as any).content)).toContain('Recovered');
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('should yield a single error chunk when all streaming providers fail (CR-28)', async () => {
      mockProvider.stream.mockReturnValue(
        (async function* () {
          yield { type: 'error' as const, error: 'boom' };
        })(),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      expect(chunks[0].type).toBe('error');
      expect((chunks[0] as any).error).toContain('All providers failed');
    });

    it('should include conversationId in the done chunk', async () => {
      async function* mockStream() {
        yield { type: 'text' as const, content: 'Hello' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi' })) {
        chunks.push(chunk);
      }

      const done = chunks[chunks.length - 1];
      expect(done.type).toBe('done');
      expect(done.conversationId).toBe('conv-1');
    });

    it('KB-5: two write tools in one round aggregate into a single run confirmation; approve executes both', async () => {
      async function* mockStreamWithTwoWrites() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'c1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"2026-08-10T09:00:00Z","endTime":"2026-08-10T10:00:00Z"}',
          },
        };
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 1, id: 'c2', name: 'create_todo', arguments: '{"title":"待办A","dueDate":"2026-08-11"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithTwoWrites())
        .mockReturnValueOnce(mockStreamAfterTool());
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      // getTool 返回工具本体（真实 ToolRegistry 从不返回 undefined）——确认载荷的 revokeClass 由它派生
      mockToolRegistry.getTool.mockReturnValue(mockTool({ requiresConfirmation: true }));
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });

      const originalCreateRun = confirmationStore.createRun.bind(confirmationStore);
      let runToken: string | undefined;
      jest.spyOn(confirmationStore, 'createRun').mockImplementation(async (userId, items, risk) => {
        const r = await originalCreateRun(userId, items, risk);
        runToken = r.token;
        return r;
      });

      // §4 G1：捕获 run 成员副作用登记，断言 runId 从执行点透传到 record（run 级撤销依赖它精确圈定）
      const recordSpy = jest.fn().mockResolvedValue({ id: 1 });
      (toolExecution as any).toolEffectsService = {
        buildKey: jest.fn().mockReturnValue('k'),
        findExisting: jest.fn().mockResolvedValue({ existing: false }),
        record: recordSpy,
        // ACT-5/6 切片1：本地写执行前会占位 —— 替身须满足接口（缺了会在逐工具的错误兜底里变成「执行 0 次」）
        claimWrite: jest.fn().mockResolvedValue({ won: true }),
        settleClaim: jest.fn().mockResolvedValue(undefined),
        releaseClaim: jest.fn().mockResolvedValue(undefined),
      };

      const stream = aiService.chatStream('1', { message: 'create an event and a todo' });
      const it = stream[Symbol.asyncIterator]();
      // 预扫描聚合：第一个确认事件 = mode:'run'（含 2 items），非两条单条 confirmation
      const first = await it.next();
      expect(first.value.type).toBe('confirmation_request');
      const req = first.value.confirmation;
      expect(req?.mode).toBe('run');
      expect(req?.run?.items).toHaveLength(2);
      expect(req?.run?.riskLevel).toBe('R3');
      // §22.17 ④ 影响预览：批内按对象类型分组（create_event→event、create_todo→todo）
      expect(req?.impact).toEqual({
        actions: 2,
        targets: [
          { resultType: 'event', count: 1 },
          { resultType: 'todo', count: 1 },
        ],
      });

      confirmationStore.resolve(runToken!, '1', 'approve');
      const chunks = [];
      for await (const c of stream) chunks.push(c);
      // 两工具都执行；整批只出这一次 confirmation_request（无第二条单条）
      expect(mockToolRegistry.execute).toHaveBeenCalledTimes(2);
      expect(chunks.filter((c: any) => c.type === 'confirmation_request')).toHaveLength(0);
      // run 级整体决策关卡先于逐条 decision（spec §2.3）
      expect(
        chunks.some(
          (c: any) =>
            c.type === 'confirmation_decision' &&
            c.confirmationDecision?.mode === 'run' &&
            c.confirmationDecision?.approved,
        ),
      ).toBe(true);
      // ② 绑定：run 聚合确认请求键集 ⊆ confirmation-request **当前契约**（版本随 registry，
      // 升版自动跟随：v1→v2 加 impact、v2→v3 加 revokeClass 都在此生效）
      const crSchema = wiredSchema('confirmation-request');
      const cr = crSchema.properties as Record<string, unknown> & {
        run: { properties: { items: { items: { properties: Record<string, unknown> } } } };
      };
      expect(Object.keys(req).filter((k) => !(k in cr))).toEqual([]);
      expect(Object.keys(req.run.items[0]).filter((k) => !(k in cr.run.properties.items.items.properties))).toEqual([]);
      // CONF-4：契约把 `summary` 声明为对象（PresentationText），两处一致 —— 此前只比键集，
      // 声明是 string、实现发对象也不会红。这条绑定在 v3 上会直接红（v3 无 definitions）。
      const summaryProp = (cr as Record<string, any>).summary;
      const summaryDef =
        summaryProp?.$ref === '#/definitions/presentationText'
          ? (crSchema.definitions?.presentationText as Record<string, any>)
          : summaryProp;
      expect(summaryDef.type).toBe('object');
      expect(summaryDef.required).toEqual(expect.arrayContaining(['key', 'fallback']));
      expect(summaryDef.additionalProperties).toBe(false);
      expect((cr.run.properties.items.items.properties as Record<string, any>).summary.$ref).toBe(
        '#/definitions/presentationText',
      );
      expect(Object.keys(req.run.items[0].summary).filter((k) => !(k in summaryDef.properties))).toEqual([]);
      // §22.17 ④ 影响预览 v1.1：撤销口径逐条随载荷（create_event / create_todo 均为确认写 → local_compensate）
      expect((req?.run?.items ?? []).map((i: any) => i.revokeClass)).toEqual([
        'local_compensate',
        'local_compensate',
      ]);

      // ② 绑定：run 决策载荷键集 ⊆ confirmation-decision v2 冻结契约
      const cdProps = Object.keys(
        (
          JSON.parse(
            readFileSync(resolve(__dirname, '../../specs/protocol/schemas/v2/confirmation-decision.schema.json'), 'utf8'),
          ) as { properties: Record<string, unknown> }
        ).properties,
      );
      const decisionChunk = chunks.find((c: any) => c.type === 'confirmation_decision') as
        | { confirmationDecision: Record<string, unknown> }
        | undefined;
      expect(decisionChunk).toBeDefined();
      expect(Object.keys(decisionChunk!.confirmationDecision).filter((k) => !cdProps.includes(k))).toEqual([]);
      expect(chunks[chunks.length - 1].type).toBe('done');
      // §4 G1：两条 run 成员副作用都带 runId = run token（run 级批量撤销据此圈定）
      expect(recordSpy).toHaveBeenCalledTimes(2);
      for (const call of recordSpy.mock.calls) {
        expect(call[0]).toMatchObject({ runId: runToken });
      }
      (toolExecution as any).toolEffectsService = undefined;
    });

    /**
     * ARC-5：run 行的目的地绑定。
     *
     * 登记现状说 run 行**不存 audience**，故跨请求路径上该检查「不成文地失效」。核过 HEAD：**run 行没有跨请求
     * 执行路径** —— 两个跨请求裁决入口都明确拒绝 run（`decideApproval`「run confirmation cannot be decided via
     * approval endpoint」／`decideOutOfBand`「…out of band」），治理台回调走的也是前者。⇒ run 成员**只在签发它的
     * 那次请求内执行**，而那次请求里每个成员各自带着自己的目的地（见 `_collectRunCandidates` → `runState.audiences`）。
     *
     * 本用例钉的就是这条边界**确实成立且是真的在检查**：让工具在**签发之后、执行之前**被改指，
     * 本次执行必须被拒。旧实现里 run 成员根本不带目的地 ⇒ 会照常执行（对旧实现为红）。
     */
    it('ARC-5: run 成员在签发请求内执行，且**目的地绑定可达**——签发后工具被改指 → 执行被拒', async () => {
      async function* mockStreamWithTwoWrites() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'c1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"2026-08-10T09:00:00Z","endTime":"2026-08-10T10:00:00Z"}',
          },
        };
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 1, id: 'c2', name: 'create_todo', arguments: '{"title":"待办A","dueDate":"2026-08-11"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithTwoWrites())
        .mockReturnValueOnce(mockStreamAfterTool());
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      // 签发时：该工具的目标是 legacy-erp
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true, audience: 'legacy-erp' } as never);
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });

      const originalCreateRun = confirmationStore.createRun.bind(confirmationStore);
      let runToken: string | undefined;
      jest.spyOn(confirmationStore, 'createRun').mockImplementation(async (userId, items, risk) => {
        const r = await originalCreateRun(userId, items, risk);
        runToken = r.token;
        return r;
      });

      const stream = aiService.chatStream('1', { message: 'create an event and a todo' });
      const it = stream[Symbol.asyncIterator]();
      const first = await it.next();
      expect(first.value.type).toBe('confirmation_request');
      expect((first.value as { confirmation?: { mode?: string } }).confirmation?.mode).toBe('run');

      // 签发之后、执行之前：该工具被改指到另一个目标系统
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true, audience: 'legacy-crm' } as never);
      confirmationStore.resolve(runToken!, '1', 'approve');
      const chunks: any[] = [];
      for await (const c of stream) chunks.push(c);

      // 两个成员的目标都变了 ⇒ 都不执行
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      // 拒绝理由在流里可见（Explainable Authz），且指的就是这条检查
      const denied = chunks.find((c: any) => c.toolEnd?.authorizationDenied);
      expect(denied?.toolEnd.authorizationDenied.checks).toEqual([
        expect.objectContaining({ name: 'destination_binding', ok: false }),
      ]);
    });

    it('KB-5 修复：预扫描遇未注册工具名（LLM 幻觉 / 外部 mcp_*）不中断整条 SSE 流，降级继续', async () => {
      async function* mockStreamWithPhantom() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'hallucinated_tool', arguments: '{}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithPhantom())
        .mockReturnValueOnce(mockStreamAfterTool());
      // 未注册工具名：registry 抛（与真实 ToolRegistry.getTool 同语义）
      const notFound = (name: string): never => {
        throw new Error(`Tool "${name}" not found`);
      };
      mockToolRegistry.requiresConfirmation.mockImplementation((name: string) => {
        if (name === 'hallucinated_tool') notFound(name);
        return true;
      });
      mockToolRegistry.riskLevel.mockImplementation((name: string) => {
        if (name === 'hallucinated_tool') notFound(name);
        return 'R3';
      });

      const chunks: any[] = [];
      // 修复前：预扫描裸调用抛异常 → 逸出 chatStream → 控制器以 Internal stream error 终止流（无 done）
      for await (const c of aiService.chatStream('1', { message: 'phantom' })) chunks.push(c);
      expect(chunks[chunks.length - 1].type).toBe('done');
      // 未注册工具不并入 run（无 run 级 confirmation_request）
      expect(
        chunks.some((c: any) => c.type === 'confirmation_request' && c.confirmation?.mode === 'run'),
      ).toBe(false);
    });

    it('KB-5 修复：run 超时如实回放为「超时未确认」（不塌缩成用户 decline）', async () => {
      async function* mockStreamWithTwoWrites() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'c1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"2026-08-10T09:00:00Z","endTime":"2026-08-10T10:00:00Z"}',
          },
        };
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 1, id: 'c2', name: 'create_todo', arguments: '{"title":"待办A","dueDate":"2026-08-11"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithTwoWrites())
        .mockReturnValueOnce(mockStreamAfterTool());
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      mockToolRegistry.getTool.mockReturnValue(mockTool({ requiresConfirmation: true }));
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });
      // run 决策以 timeout 结束（TTL 到期）
      jest.spyOn(confirmationStore, 'createRun').mockResolvedValue({
        token: 'run-timeout',
        decision: Promise.resolve({ outcome: 'timeout' } as never),
      });

      const chunks: any[] = [];
      for await (const c of aiService.chatStream('1', { message: 'x' })) chunks.push(c);
      const toolEnds = chunks.filter((c: any) => c.type === 'tool_end');
      expect(toolEnds).toHaveLength(2);
      // 修复前 outcome 被塌缩为 'decline' → 此处会是「操作已取消」
      expect(toolEnds.map((c: any) => c.toolEnd.summary)).toEqual([
        { key: 'ai.present.result.timeout', fallback: 'Timed out without a decision' },
        { key: 'ai.present.result.timeout', fallback: 'Timed out without a decision' },
      ]);
      // Trust-grade errors：超时也带「为什么 + 怎么解决」，按请求语言（此处默认英文）渲染。
      for (const end of toolEnds) {
        expect((end as any).toolEnd.explanation).toMatchObject({
          deniedBy: 'confirmation',
          reasonKey: 'ai.deny.confirmation_timeout.reason',
          nextStepKey: 'ai.deny.confirmation_timeout.nextStep',
        });
        expect((end as any).toolEnd.explanation.reason).toContain('confirmation window');
        expect((end as any).toolEnd.explanation.params).toMatchObject({
          ttlSeconds: expect.any(Number),
          offlineTtlHours: expect.any(Number),
        });
      }
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('should yield confirmation_request before executing a write tool, then execute on approve', async () => {
      async function* mockStreamWithWriteTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"2026-08-10T09:00:00Z","endTime":"2026-08-10T10:00:00Z"}',
          },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '事件已创建' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithWriteTool())
        .mockReturnValueOnce(mockStreamAfterTool());

      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      mockToolRegistry.getTool.mockReturnValue(mockTool({ requiresConfirmation: true }));
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: { id: 42, title: '评审' },
      });

      // spy create 以拿到 token
      const originalCreate = confirmationStore.create.bind(confirmationStore);
      let pendingToken: string | undefined;
      jest.spyOn(confirmationStore, 'create').mockImplementation(async (userId, toolName, args) => {
        const r = await originalCreate(userId, toolName, args);
        pendingToken = r.token;
        return r;
      });

      const stream = aiService.chatStream('1', { message: 'create an event titled Review for tomorrow 9am' });
      const it = stream[Symbol.asyncIterator]();
      // tool_start 先发（过程卡片）
      const first = await it.next();
      expect(first.value.type).toBe('tool_start');
      expect(first.value.toolStart?.name).toBe('create_event');
      expect(first.value.toolStart?.summary).toEqual({
        key: 'ai.present.write.createEvent',
        fallback: 'Create event: 评审 (2026-08-10T09:00:00Z – 2026-08-10T10:00:00Z)',
        params: {
          title: '评审',
          startTime: '2026-08-10T09:00:00Z',
          endTime: '2026-08-10T10:00:00Z',
        },
      });
      // W5-⑦ Explainable Authz：tool_start 携带 riskLevel + authorization
      expect(first.value.toolStart?.riskLevel).toBe('R3');
      expect(first.value.toolStart?.authorization?.riskStrategy).toBe('confirmation');
      expect(
        first.value.toolStart?.authorization?.checks.some((c: any) => c.name === 'user_scoped' && c.ok),
      ).toBe(true);
      expect(
        first.value.toolStart?.authorization?.checks.some((c: any) => c.name === 'risk_policy' && c.ok),
      ).toBe(true);
      // 确认前不执行写操作
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();

      // confirmation_request
      const second = await it.next();
      expect(second.value.type).toBe('confirmation_request');
      expect(second.value.confirmation?.toolName).toBe('create_event');
      // §22.17 ④ 影响预览：单条确认也带影响描述符（create_event → event ×1）
      expect(second.value.confirmation?.impact).toEqual({
        actions: 1,
        targets: [{ resultType: 'event', count: 1 }],
      });
      // §22.17 ④ 影响预览 v1.1：单条确认也带撤销口径（create_event → 确认写 → local_compensate）
      expect(second.value.confirmation?.revokeClass).toBe('local_compensate');
      expect(second.value.confirmation?.summary).toEqual({
        key: 'ai.present.write.createEvent',
        fallback: 'Create event: 评审 (2026-08-10T09:00:00Z – 2026-08-10T10:00:00Z)',
        params: {
          title: '评审',
          startTime: '2026-08-10T09:00:00Z',
          endTime: '2026-08-10T10:00:00Z',
        },
      });
      // W5-⑦ Explainable Authz：确认请求携带为何需确认
      expect(second.value.confirmation?.authorization?.requiresConfirmation).toBe(true);
      expect(second.value.confirmation?.authorization?.riskLevel).toBe('R3');
      expect(pendingToken).toBeDefined();

      // 用户确认 → confirmation_decision + tool_end(success)
      confirmationStore.resolve(pendingToken!, '1', 'approve');
      const third = await it.next();
      expect(third.value.type).toBe('confirmation_decision');
      expect(third.value.confirmationDecision?.approved).toBe(true);
      expect(third.value.confirmationDecision?.success).toBe(true);
      expect(mockToolRegistry.execute).toHaveBeenCalledTimes(1);

      const fourth = await it.next();
      expect(fourth.value.type).toBe('tool_end');
      expect(fourth.value.toolEnd?.success).toBe(true);
      expect(fourth.value.toolEnd?.summary).toEqual({ key: 'ai.present.result.createEvent', fallback: 'Event created' });

      // 后续文本 + done
      const chunks = [];
      for await (const c of stream) chunks.push(c);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('CONF-3: the summary emitted in confirmation_request is the one hashed onto the row', async () => {
      async function* mockStreamWithWriteTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"S","endTime":"E"}',
          },
        };
      }
      async function* mockStreamAfterDecline() {
        yield { type: 'text' as const, content: '好的' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithWriteTool())
        .mockReturnValueOnce(mockStreamAfterDecline());
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      mockToolRegistry.getTool.mockReturnValue(mockTool({ requiresConfirmation: true }));

      const persisted: any[] = [];
      const repo = (confirmationStore as unknown as { reqRepo: { save: jest.Mock } }).reqRepo;
      repo.save.mockImplementation(async (row: any) => {
        persisted.push(row);
        return { id: persisted.length };
      });

      const stream = aiService.chatStream('1', { message: 'create an event' });
      const it = stream[Symbol.asyncIterator]();
      await it.next(); // tool_start
      const confirmationChunk = await it.next();
      expect(confirmationChunk.value.type).toBe('confirmation_request');
      const confirmation = confirmationChunk.value.confirmation!;

      confirmationStore.resolve(confirmation.token, '1', 'decline');
      for await (const _ of stream) {
        // drain
      }

      const args = { title: '评审', startTime: 'S', endTime: 'E' };
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({
        toolName: 'create_event',
        args: JSON.stringify(args),
      });
      // 行上记的哈希可以由**同一份下发文案**复现 —— 证明入行的是屏幕上那份，而不是别的。
      expect(confirmation.summary).toEqual(presentation.writeSummaryOrGeneric('create_event', args));
      expect(
        presentation.verifyStoredRender({
          toolName: persisted[0].toolName,
          args: persisted[0].args,
          kind: 'single',
          runItems: null,
          renderHash: persisted[0].renderHash,
          renderVersion: persisted[0].renderVersion,
        }),
      ).toMatchObject({ matched: true });
    });

    it('should NOT execute a write tool when user declines', async () => {
      async function* mockStreamWithWriteTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"S","endTime":"E"}',
          },
        };
      }
      async function* mockStreamAfterDecline() {
        yield { type: 'text' as const, content: '好的，不创建了' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithWriteTool())
        .mockReturnValueOnce(mockStreamAfterDecline());

      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.getTool.mockReturnValue(mockTool({ requiresConfirmation: true }));

      const originalCreate = confirmationStore.create.bind(confirmationStore);
      let pendingToken: string | undefined;
      jest.spyOn(confirmationStore, 'create').mockImplementation(async (userId, toolName, args) => {
        const r = await originalCreate(userId, toolName, args);
        pendingToken = r.token;
        return r;
      });

      const stream = aiService.chatStream('1', { message: 'create an event titled Review for tomorrow 9am' });
      const it = stream[Symbol.asyncIterator]();
      // tool_start → confirmation_request
      const first = await it.next();
      expect(first.value.type).toBe('tool_start');
      const second = await it.next();
      expect(second.value.type).toBe('confirmation_request');

      confirmationStore.resolve(pendingToken!, '1', 'reject');
      const third = await it.next();
      expect(third.value.type).toBe('confirmation_decision');
      expect(third.value.confirmationDecision?.approved).toBe(false);
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();

      // decline 后仍发 tool_end(success:false)
      const fourth = await it.next();
      expect(fourth.value.type).toBe('tool_end');
      expect(fourth.value.toolEnd?.success).toBe(false);
      expect(fourth.value.toolEnd?.summary).toEqual({ key: 'ai.present.result.cancelled', fallback: 'Cancelled' });

      const chunks = [];
      for await (const c of stream) chunks.push(c);
      expect(chunks[chunks.length - 1].type).toBe('done');

      // 2026-10-28：拒绝的那一行**不再冒充失败** —— 它有自己的词（`declined`）。它同时带放行依据，
      // 回答「凭什么允许它走到确认这一步」；A-8 已按**形状**判别（数组=拒绝理由 / 对象=放行快照），
      // 故 isError 行上带放行快照不会被读成越权。
      // Since 2026-10-28 the declined row no longer passes for a failure — it has its own word. It also
      // carries the allow basis ("why was it allowed to reach the confirmation step"), which is safe
      // because A-8 now judges by shape.
      const declinedAudit = (mockAuditService.log as jest.Mock).mock.calls.find(
        (c: any[]) => c[0].action === 'tool_call' && c[0].detail?.startsWith('create_event'),
      );
      expect(declinedAudit).toBeDefined();
      expect(declinedAudit![0].isError).toBe(true);
      expect(declinedAudit![0].errorMessage).toBe('User declined the operation');
      expect(declinedAudit![0].outcome).toBe('declined');
      expect(declinedAudit![0].authorization).toBeDefined();
      expect(JSON.parse(declinedAudit![0].authorization)).toMatchObject({ allowed: true, tool: 'create_event' });
    });

    it('2026-10-28 放宽：R4 待批的 tool_call 行带放行依据（凭什么允许它走到确认这一步）', async () => {
      async function* mockStreamWithWriteTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"S","endTime":"E"}',
          },
        };
      }
      async function* mockStreamAfterPending() {
        yield { type: 'text' as const, content: '已提交人工审批' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithWriteTool())
        .mockReturnValueOnce(mockStreamAfterPending());

      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.getTool.mockReturnValue(mockTool({ requiresConfirmation: true }));
      // 升到审批档：requiresApproval 走 riskLevelFor → riskLevel（治理策略未挂时看风险级）
      mockToolRegistry.riskLevel.mockReturnValue('R4');
      jest.spyOn(r4Approval, 'createR4ApprovalRequest').mockResolvedValue({ token: 'r4-token', id: 1 });

      for await (const _ of aiService.chatStream('1', { message: 'create an event' })) {
        // drain
      }

      const pendingRow = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e: any) => e.action === 'tool_call' && e.detail?.startsWith('create_event'));
      expect(pendingRow).toBeDefined();
      // 结局仍是「在等人」，不是失败 —— 正是放宽后仍不算拒绝的那一档
      expect(pendingRow.outcome).toBe('pending');
      expect(pendingRow.isError).toBe(false);
      expect(pendingRow.authorization).toBeDefined();
      expect(JSON.parse(pendingRow.authorization)).toMatchObject({ allowed: true, tool: 'create_event' });
    });

    it('2026-10-28：超时不是失败 —— tool_call 行 outcome=not_executed，并带放行依据', async () => {
      async function* mockStreamWithWriteTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"S","endTime":"E"}',
          },
        };
      }
      async function* mockStreamAfterTimeout() {
        yield { type: 'text' as const, content: '超时未确认' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithWriteTool())
        .mockReturnValueOnce(mockStreamAfterTimeout());
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.getTool.mockReturnValue(mockTool({ requiresConfirmation: true }));
      jest.spyOn(confirmationStore, 'create').mockResolvedValue({
        token: 'timeout-token',
        decision: Promise.resolve({ outcome: 'timeout' } as never),
      });

      for await (const _ of aiService.chatStream('1', { message: 'create an event' })) {
        // drain
      }

      const row = (mockAuditService.log as jest.Mock).mock.calls
        .map((c) => c[0])
        .find((e: any) => e.action === 'tool_call' && e.detail?.startsWith('create_event'));
      expect(row).toBeDefined();
      // 「没发生」不再与「失败」共用一个词
      expect(row.outcome).toBe('not_executed');
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      // 依据在：凭什么允许它走到确认这一步
      expect(row.authorization).toBeDefined();
      expect(JSON.parse(row.authorization)).toMatchObject({ allowed: true, tool: 'create_event' });
    });

    it('ACT-3：勾选「不再询问」只免**那一次调用** —— 同工具换参数仍须确认', async () => {
      async function* streamA() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'create_event',
            arguments: '{"title":"A项目","startTime":"S","endTime":"E"}',
          },
        };
      }
      async function* streamB() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_2',
            name: 'create_event',
            arguments: '{"title":"B项目","startTime":"S","endTime":"E"}',
          },
        };
      }
      async function* streamDone() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(streamA())
        .mockReturnValueOnce(streamB())
        .mockReturnValueOnce(streamDone());

      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true } as any);
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 42 } });

      const tokens: string[] = [];
      const originalCreate = confirmationStore.create.bind(confirmationStore);
      jest.spyOn(confirmationStore, 'create').mockImplementation(async (userId, toolName, args) => {
        const r = await originalCreate(userId, toolName, args);
        tokens.push(r.token);
        return r;
      });

      // 实现是 async generator，声明却是 `AsyncIterable`（没有 `next()`）——要逐帧取就得把这件事说明白
      const stream = aiService.chatStream('1', { message: '创建两个事件' });
      const it = stream[Symbol.asyncIterator]();
      expect((await it.next()).value.type).toBe('tool_start');
      const firstConfirm = await it.next();
      expect(firstConfirm.value.type).toBe('confirmation_request');
      expect(tokens).toHaveLength(1);

      // 批准 A 次调用**并勾选「不再询问」**（旧实现此刻把整个 create_event 都放行）
      confirmationStore.resolve(tokens[0], '1', 'approve', true);

      // 换参数再来一次：必须**重新确认**。旧实现（按工具名免确认）这里不会再发 confirmation_request，
      // 因而这一环根本进不来 —— 断言即钉住旧实现不可能产出的观测面。
      let secondAsked = false;
      for await (const c of stream) {
        if ((c as any).type === 'confirmation_request') {
          secondAsked = true;
          expect(tokens).toHaveLength(2);
          confirmationStore.resolve(tokens[1], '1', 'decline');
        }
      }
      expect(secondAsked).toBe(true);
      expect(tokens).toHaveLength(2);

      // A 执行了（被批准）；B 没有（被拒）—— 免确认没有顺延到换参数的调用上
      expect(mockToolRegistry.execute).toHaveBeenCalledTimes(1);
      expect(mockToolRegistry.execute.mock.calls[0][1]).toMatchObject({ title: 'A项目' });
    });

    it('CONF-1 有界变动：声明了界限的字段，界限内的取值变动**不再**要求确认', async () => {
      // 工具声明了 amount ≤ 10000（治理策略 `boundedFields`，落点 = 工具元数据、不进协议）
      jest.spyOn(mockToolGate, 'boundedFieldsOf').mockResolvedValue({ amount: { max: 10000 } });

      const call = (id: string, amount: number) =>
        (async function* () {
          yield {
            type: 'tool_call' as const,
            toolCall: { index: 0, id, name: 'create_contract', arguments: `{"counterparty":"X","amount":${amount}}` },
          };
        })();
      async function* streamDone() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      // 第一轮 3000 → 第二轮 8000：**同一个界限内**的两个取值
      mockProvider.stream
        .mockReturnValueOnce(call('call_1', 3000))
        .mockReturnValueOnce(call('call_2', 8000))
        .mockReturnValueOnce(streamDone());

      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true } as any);
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 42 } });

      const tokens: string[] = [];
      const originalCreate = confirmationStore.create.bind(confirmationStore);
      jest.spyOn(confirmationStore, 'create').mockImplementation(async (userId, toolName, args) => {
        const r = await originalCreate(userId, toolName, args);
        tokens.push(r.token);
        return r;
      });

      const stream = aiService.chatStream('1', { message: '建两份合同' });
      const it = stream[Symbol.asyncIterator]();
      expect((await it.next()).value.type).toBe('tool_start');
      expect((await it.next()).value.type).toBe('confirmation_request');
      expect(tokens).toHaveLength(1);

      // 批准第一次**并勾选「不再询问」**
      confirmationStore.resolve(tokens[0], '1', 'approve', true);

      // 换到界限内的另一个取值：**不再问**（这就是判据点名的那条断言）⇒ 整条流里只有一次询问
      let askedAgain = false;
      for await (const c of stream) {
        if ((c as any).type === 'confirmation_request') askedAgain = true;
      }
      expect(askedAgain).toBe(false);
      expect(tokens).toHaveLength(1);
      // 两次都执行了（第二次凭界限内的信任作用域直接放行）
      expect(mockToolRegistry.execute).toHaveBeenCalledTimes(2);
      expect(mockToolRegistry.execute.mock.calls[1][1]).toMatchObject({ amount: 8000 });
    });

    it('ACT-4：执行路径的审计写入被 await —— 审计未落库时流不越过它', async () => {
      async function* streamTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'create_event',
            arguments: '{"title":"评审","startTime":"S","endTime":"E"}',
          },
        };
      }
      async function* streamDone() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValueOnce(streamTool()).mockReturnValueOnce(streamDone());

      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      mockToolRegistry.riskLevel.mockReturnValue('R3');
      mockToolRegistry.getTool.mockReturnValue({ requiresConfirmation: true } as any);
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 42 } });

      // 把**决策审计**那一笔写入悬停：不释放就等于「审计还没落库」
      let releaseAudit: (() => void) | undefined;
      const heldAudit = new Promise<void>((res) => {
        releaseAudit = res;
      });
      let held = false;
      (mockAuditService.log as jest.Mock).mockImplementation(async (entry: any) => {
        if (entry?.action === 'tool_confirmation' && !held) {
          held = true;
          await heldAudit;
        }
      });

      let token: string | undefined;
      const originalCreate = confirmationStore.create.bind(confirmationStore);
      jest.spyOn(confirmationStore, 'create').mockImplementation(async (userId, toolName, args) => {
        const r = await originalCreate(userId, toolName, args);
        token = r.token;
        return r;
      });

      const stream = aiService.chatStream('1', { message: '创建事件' });
      const it = stream[Symbol.asyncIterator]();
      expect((await it.next()).value.type).toBe('tool_start');
      expect((await it.next()).value.type).toBe('confirmation_request');
      confirmationStore.resolve(token!, '1', 'approve');

      // 审计未落库 ⇒ 流必须停在写入之前。
      // 旧实现是 fire-and-forget（不 await），这里会直接拿到下一个 chunk —— 这正是要钉住的观测面。
      // 注意复用**同一个** next()：另起一个会把解开后的第一个 chunk 吃掉。
      const pendingNext = it.next();
      const raced = await Promise.race([
        pendingNext.then(() => 'chunk'),
        new Promise((res) => setTimeout(() => res('stalled'), 100)),
      ]);
      expect(raced).toBe('stalled');
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();

      // 放行审计后，流继续（决策结果 → 执行 → done）
      releaseAudit!();
      expect((await pendingNext).value.type).toBe('confirmation_decision');
      for await (const _ of stream) {
        /* 排空 */
      }
    });

    it('should emit tool_start/tool_end around a read tool call', async () => {
      async function* mockStreamWithReadTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: {
            index: 0,
            id: 'call_1',
            name: 'query_events',
            arguments: '{"startDate":"2026-08-01","endDate":"2026-08-07"}',
          },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '找到 2 个事件' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithReadTool())
        .mockReturnValueOnce(mockStreamAfterTool());

      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }],
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'query my events' })) {
        chunks.push(chunk);
      }

      const startIdx = chunks.findIndex((c) => c.type === 'tool_start');
      const endIdx = chunks.findIndex((c) => c.type === 'tool_end');
      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(endIdx).toBeGreaterThan(startIdx);
      expect(chunks[startIdx].toolStart?.name).toBe('query_events');
      expect(chunks[startIdx].toolStart?.summary).toEqual({ key: 'ai.tool.queryEvents', fallback: 'Query events' });
      expect(chunks[endIdx].toolEnd?.success).toBe(true);
      expect(chunks[endIdx].toolEnd?.summary).toEqual({
        key: 'ai.present.result.rows',
        fallback: '2 result(s)',
        params: { count: '2' },
      });
      // 工具执行后 text + done
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('should emit paired tool_start/tool_end for two same-name tool calls', async () => {
      async function* mockStreamWithTwoTools() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'call_1', name: 'query_events', arguments: '{}' },
        };
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 1, id: 'call_2', name: 'query_events', arguments: '{"status":"active"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: 'done' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithTwoTools())
        .mockReturnValueOnce(mockStreamAfterTool());

      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: [] });

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'query' })) {
        chunks.push(chunk);
      }

      const starts = chunks.filter((c) => c.type === 'tool_start');
      const ends = chunks.filter((c) => c.type === 'tool_end');
      expect(starts).toHaveLength(2);
      expect(ends).toHaveLength(2);
      // 顺序保证串行成对：start,end,start,end
      const order = chunks
        .filter((c) => c.type === 'tool_start' || c.type === 'tool_end')
        .map((c) => c.type);
      expect(order).toEqual(['tool_start', 'tool_end', 'tool_start', 'tool_end']);
    });

    it('should emit a failed tool_end when tool execution throws', async () => {
      async function* mockStreamWithReadTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'call_1', name: 'query_events', arguments: '{}' },
        };
      }
      async function* mockStreamAfterError() {
        yield { type: 'text' as const, content: 'sorry' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithReadTool())
        .mockReturnValueOnce(mockStreamAfterError());

      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      mockToolRegistry.execute.mockRejectedValue(new Error('boom'));

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'query' })) {
        chunks.push(chunk);
      }

      const starts = chunks.filter((c) => c.type === 'tool_start');
      const ends = chunks.filter((c) => c.type === 'tool_end');
      expect(starts).toHaveLength(1);
      expect(ends).toHaveLength(1);
      expect(ends[0].toolEnd?.success).toBe(false);
    });

    it('T5 流式 deny：tool_end 透出 authorizationDenied + 审计 authorization 序列化 reasons + proxy 标 source=bridge', async () => {
      async function* mockStreamWithReadTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'call_1', name: 'query_events', arguments: '{}' },
        };
      }
      async function* mockStreamAfterError() {
        yield { type: 'text' as const, content: 'sorry' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithReadTool())
        .mockReturnValueOnce(mockStreamAfterError());
      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      // proxy 工具 deny：对齐非流式 deny 与成功分支，审计 source=bridge
      jest.spyOn(toolExecution, 'isProxyTool').mockReturnValue(true);
      mockToolRegistry.execute.mockRejectedValue(
        new AuthorizationDeniedError('Tool "query_events" is restricted to roles: admin', [
          { name: 'role_allowed', ok: false, note: '需要角色 [admin]，当前 user' },
        ]),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'query' })) {
        chunks.push(chunk);
      }

      // 前端决策轨迹：tool_end.authorizationDenied 带结构化 reasons
      const deniedEnd = chunks.find(
        (c) => c.type === 'tool_end' && (c.toolEnd as { authorizationDenied?: unknown })?.authorizationDenied,
      );
      expect((deniedEnd as any)?.toolEnd?.authorizationDenied?.checks[0].name).toBe('role_allowed');
      // 审计行：isError + authorization 序列化 reasons + proxy 工具 source=bridge
      const denyAudit = (mockAuditService.log as jest.Mock).mock.calls.find(
        (c) => c[0]?.action === 'tool_call' && c[0]?.isError === true,
      );
      expect(denyAudit).toBeDefined();
      expect(denyAudit![0].source).toBe('bridge');
      // C-4(c): a refused call's structured record answers the tool from its own `tool` column (and the
      // gate from `outcome` = `refused`, not `risk_policy`) — the reader no longer has to parse `detail`.
      // C-4(c)：被拒调用的结构化记录从自己的 `tool` 列答出工具（结局 `refused` 而非 `blocked`，因这次
      // 没过的是角色闸）——读取侧不必再去解析 `detail`。
      expect((denyAudit![0] as any).tool).toBe('query_events');
      expect((denyAudit![0] as any).outcome).toBe('refused');
      expect(denyAudit![0].authorization).toBe(
        JSON.stringify([{ name: 'role_allowed', ok: false, note: '需要角色 [admin]，当前 user' }]),
      );
    });

    it('should not hijack a write request containing a page keyword (帮我创建事件)', async () => {
      // 写操作动词「创建」命中 → 不走导航拦截，进入工具循环（最终 text + done，而非导航文本）
      async function* mockStream() {
        yield { type: 'text' as const, content: '好的，为你创建' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: '帮我创建事件' })) {
        chunks.push(chunk);
      }

      const textChunks = chunks.filter((c) => c.type === 'text');
      expect(textChunks.length).toBe(1);
      expect(textChunks[0].content).not.toContain('跳转');
    });

    it('should still navigate for a pure navigation request', async () => {
      // 去掉「帮我」后，纯导航「打开设置」仍走确定性导航，不调用 LLM
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: { navigateTo: '/settings' },
      });
      async function* mockStream() {
        yield { type: 'text' as const, content: 'x' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: '打开设置' })) {
        chunks.push(chunk);
      }

      // 导航路径只产出 navigate + text「已为您跳转到设置」+ done，不调用 provider.stream
      expect(mockProvider.stream).not.toHaveBeenCalled();
      const navChunk = chunks.find((c) => c.type === 'navigate');
      expect(navChunk?.route).toBe('/settings');
      const texts = chunks.filter((c) => c.type === 'text').map((c) => c.content);
      expect(texts[0]).toContain('跳转');
      // P0：导航经治理层执行 —— 有工具行 + 审计（此前直接返回 route，毫无留痕）
      expect(mockToolRegistry.execute).toHaveBeenCalledWith(
        'navigate_page',
        { page: 'settings' },
        '1',
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tool_call', tool: 'navigate_page' }),
      );
    });

    it('should treat 帮我查询 as a query (no action verb, no navigation hijack)', async () => {
      async function* mockStream() {
        yield { type: 'text' as const, content: '查到 5 个事件' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: '帮我查一下这个月的事件' })) {
        chunks.push(chunk);
      }

      // 命中 LLM 工具循环（provider.stream 被调用），非导航拦截
      expect(mockProvider.stream).toHaveBeenCalled();
      const texts = chunks.filter((c) => c.type === 'text').map((c) => c.content);
      expect(texts[0]).not.toContain('跳转');
    });

    it('chatStream：会话不存在（NotFound）时自动新建', async () => {
      mockConversationService.getConversation.mockRejectedValue(new NotFoundException('x'));
      mockConversationService.createConversation.mockReturnValue({ id: 'new-stream-conv' });
      async function* mockStream() {
        yield { type: 'text' as const, content: 'ok' };
        yield { type: 'done' as const };
      }
      mockProvider.stream.mockReturnValue(mockStream());

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'Hi', conversationId: 'stale' })) {
        chunks.push(chunk);
      }
      expect(mockConversationService.createConversation).toHaveBeenCalled();
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    it('chatStream：工具循环超过最大轮数 → 道歉文本 + done', async () => {
      // 每次流都返回工具调用（query_events 安全执行）→ 循环 5 轮后超限
      async function* mockToolStream() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'query_events', arguments: '{}' },
        };
        yield { type: 'done' as const };
      }
      // mockReturnValue 复用同一已耗尽的 generator，需每轮新建才能触发超限
      mockProvider.stream.mockImplementation(() => mockToolStream());
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: [] });

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'query' })) {
        chunks.push(chunk);
      }

      const texts = chunks.filter((c) => c.type === 'text');
      // 超限道歉文案 yield 给客户端
      expect(texts.some((c) => c.content.includes('unable to complete'))).toBe(true);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });

    /**
     * Trust-grade errors：三类拒绝在**真实流式入口**上都要给出「为什么 + 怎么解决」，
     * 且成功路径不带这些字段（避免噪音）。
     *
     * Trust-grade errors: all three refusal classes must expose why + next step on the real stream
     * entry point, and the success path must not carry them.
     */
    it('策略拒绝：tool_end 在 tool_start 之前也发出，并带 explanation（zh）', async () => {
      async function* mockWithTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'query_events', arguments: '{}' },
        };
      }
      async function* mockAfter() {
        yield { type: 'text' as const, content: 'blocked' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockWithTool())
        .mockReturnValueOnce(mockAfter());
      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      (mockToolGate as any).governancePolicy = {
        isToolEnabled: jest.fn().mockResolvedValue(false),
        getAllowedRoles: jest.fn().mockResolvedValue([]),
      };

      const chunks: any[] = [];
      for await (const c of aiService.chatStream('1', { message: 'query' }, 'zh')) chunks.push(c);

      // 拒绝发生在门控段 → 没有 tool_start；但 tool_end 仍要可见（否则响应体只有模型转述）
      expect(chunks.filter((c) => c.type === 'tool_start')).toHaveLength(0);
      const end = chunks.find((c) => c.type === 'tool_end');
      expect(end?.toolEnd?.authorizationDenied?.checks[0].name).toBe('tool_enabled');
      expect(end?.toolEnd?.explanation).toMatchObject({
        deniedBy: 'governance',
        reasonKey: 'ai.deny.tool_disabled.reason',
        nextStepKey: 'ai.deny.tool_disabled.nextStep',
        params: { tool: 'query_events' },
      });
      expect(end?.toolEnd?.explanation?.reason).toContain('治理策略');
      expect(end?.toolEnd?.explanation?.nextStep).toContain('策略中心');

      (mockToolGate as any).governancePolicy = undefined;
    });

    it('R5 阻断：tool_end 带 explanation（deniedBy=risk，下一步可执行）', async () => {
      async function* mockWithTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'delete_customer', arguments: '{}' },
        };
      }
      async function* mockAfter() {
        yield { type: 'text' as const, content: 'blocked' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockWithTool())
        .mockReturnValueOnce(mockAfter());
      mockToolRegistry.getTool.mockReturnValue(mockTool());
      mockToolRegistry.riskLevel.mockReturnValue('R5');
      mockToolRegistry.requiresConfirmation.mockReturnValue(false);

      const chunks: any[] = [];
      for await (const c of aiService.chatStream('1', { message: 'delete' })) chunks.push(c);

      const end = chunks.find((c) => c.type === 'tool_end');
      expect(end?.toolEnd?.explanation).toMatchObject({
        deniedBy: 'risk_policy',
        reasonKey: 'ai.deny.risk_r5.reason',
        nextStepKey: 'ai.deny.risk_r5.nextStep',
        params: { tool: 'delete_customer' },
      });
      expect(end?.toolEnd?.explanation?.reason).toMatch(/R5/);
      expect(end?.toolEnd?.explanation?.nextStep).toContain('reversible');
    });

    it('成功路径不带 explanation（同一路径不产生噪音）', async () => {
      async function* mockWithTool() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'query_events', arguments: '{}' },
        };
      }
      async function* mockAfter() {
        yield { type: 'text' as const, content: 'ok' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockWithTool())
        .mockReturnValueOnce(mockAfter());
      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: [] });

      const chunks: any[] = [];
      for await (const c of aiService.chatStream('1', { message: 'query' })) chunks.push(c);

      const end = chunks.find((c) => c.type === 'tool_end');
      expect(end?.toolEnd?.success).toBe(true);
      expect(end?.toolEnd?.explanation).toBeUndefined();
    });
  });

