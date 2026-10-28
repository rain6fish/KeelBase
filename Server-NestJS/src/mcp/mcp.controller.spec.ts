// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { McpExportController } from './mcp.controller';
import { ToolExposureService } from '../ai/tools/tool-exposure.service';
import { AuditService } from '../governance-shared/services/audit.service';
import { AuthorizationDeniedError } from '../ai/interfaces/tool.interface';
import { AuthorizationExplainerService } from '../ai/authorization-explainer.service';
import { ConfirmationStore } from '../ai/confirmation/confirmation.store';
import { R4ApprovalService } from '../ai/approvals/r4-approval.service';
import { ToolGateService } from '../ai/tools/tool-gate.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('McpExportController (HS-10)', () => {
  let controller: McpExportController;
  let ai: jest.Mocked<Pick<AiService, 'listMcpTools' | 'executeToolForExternal'>>;
  let audit: jest.Mocked<Pick<AuditService, 'log'>>;
  let store: { create: jest.Mock };
  let r4: { createR4ApprovalRequest: jest.Mock };
  let gate: { destinationOf: jest.Mock; requiresApproval: jest.Mock };

  const user = { sub: 1, username: 'alex', role: 'user' } as JwtPayload;

  beforeEach(async () => {
    ai = {
      listMcpTools: jest.fn().mockResolvedValue([
        {
          name: 'query_events',
          description: '查询事件',
          inputSchema: { type: 'object', properties: {} },
          riskLevel: 'R1',
          riskStrategy: 'auto',
          requiresConfirmation: false,
        },
        {
          name: 'create_event',
          description: '创建事件',
          inputSchema: { type: 'object', properties: {} },
          riskLevel: 'R3',
          riskStrategy: 'confirmation',
          requiresConfirmation: true,
        },
      ]),
      executeToolForExternal: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    store = { create: jest.fn().mockResolvedValue({ token: 'r3-token', decision: new Promise(() => {}) }) };
    r4 = { createR4ApprovalRequest: jest.fn().mockResolvedValue({ token: 'r4-token', id: 7 }) };
    gate = {
      destinationOf: jest.fn().mockReturnValue('local'),
      requiresApproval: jest.fn().mockResolvedValue(false),
    };
    const explainer = {
      getAuthorizationReasons: jest.fn().mockResolvedValue({
        tool: 'query_events',
        riskLevel: 'R1',
        riskStrategy: 'auto',
        requiresConfirmation: false,
        checks: [{ name: 'tool_enabled', ok: true }],
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        McpExportController,
        { provide: ToolExposureService, useValue: ai },
        { provide: AuditService, useValue: audit },
        { provide: AuthorizationExplainerService, useValue: explainer },
        { provide: ConfirmationStore, useValue: store },
        { provide: R4ApprovalService, useValue: r4 },
        { provide: ToolGateService, useValue: gate },
      ],
    }).compile();
    controller = moduleRef.get(McpExportController);
  });

  it('initialize 返回 serverInfo + tools 能力', async () => {
    const res = await controller.handle(user, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    expect((res as any).id).toBe(1);
    expect((res as any).result.serverInfo.name).toBe('keelbase');
    const pkgVersion = (JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string }).version;
    expect((res as any).result.serverInfo.version).toBe(pkgVersion);
    expect((res as any).result.capabilities.tools).toEqual({});
  });

  it('ping 返回空 result', async () => {
    const res = await controller.handle(user, { jsonrpc: '2.0', id: 2, method: 'ping' });
    expect((res as any).result).toEqual({});
  });

  it('tools/list 返回工具清单 + 治理契约扩展（§4.4）', async () => {
    const res = await controller.handle(user, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const tools = (res as any).result.tools;
    expect(tools).toHaveLength(2);
    const q = tools.find((t: { name: string }) => t.name === 'query_events');
    expect(q.inputSchema.type).toBe('object');
    // 读工具 R1：annotations.readOnlyHint + _meta.keelbase 契约透出
    expect(q.annotations.readOnlyHint).toBe(true);
    expect(q.annotations.destructiveHint).toBe(false);
    expect(q._meta.keelbase).toEqual({ riskLevel: 'R1', riskStrategy: 'auto', requiresConfirmation: false });
    // 写工具 R3：非只读 + 需确认
    const c = tools.find((t: { name: string }) => t.name === 'create_event');
    expect(c.annotations.readOnlyHint).toBe(false);
    expect(c._meta.keelbase).toEqual({ riskLevel: 'R3', riskStrategy: 'confirmation', requiresConfirmation: true });
  });

  it('E 收口：readOnlyHint/destructiveHint 映射边缘（R0/R2 只读、R5 破坏性）', async () => {
    const mk = (name: string, riskLevel: string, riskStrategy: string, requiresConfirmation: boolean) => ({
      name, description: '', inputSchema: { type: 'object' }, riskLevel, riskStrategy, requiresConfirmation,
    });
    ai.listMcpTools.mockResolvedValue([
      mk('r0_read', 'R0', 'auto', false),
      mk('r2_read', 'R2', 'policy', false),
      mk('r4_human', 'R4', 'human_approval', true),
      mk('r5_block', 'R5', 'block', true),
    ]);
    const res = await controller.handle(user, { jsonrpc: '2.0', id: 10, method: 'tools/list' });
    const tools = (res as any).result.tools as Array<{ name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }>;
    const by = (n: string) => tools.find((t) => t.name === n)!;
    // readOnlyHint 边界：READ_ONLY_RISKS = R0/R1/R2
    expect(by('r0_read').annotations.readOnlyHint).toBe(true);
    expect(by('r2_read').annotations.readOnlyHint).toBe(true);
    expect(by('r4_human').annotations.readOnlyHint).toBe(false);
    expect(by('r5_block').annotations.readOnlyHint).toBe(false);
    // destructiveHint 边界：仅 R5
    expect(by('r5_block').annotations.destructiveHint).toBe(true);
    expect(by('r4_human').annotations.destructiveHint).toBe(false);
  });

  it('tools/call 读工具 → 执行 + 审计，返回结果', async () => {
    ai.executeToolForExternal.mockResolvedValue({
      executed: true,
      requiresConfirmation: false,
      result: { success: true, data: { total: 3 } },
    });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'query_events', arguments: { status: 'active' } },
    });
    expect(ai.executeToolForExternal).toHaveBeenCalledWith('query_events', { status: 'active' }, '1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tool_call', provider: 'mcp', userId: '1' }),
    );
    // T5 跨入口一致：放行/成功也写放行依据快照（与 REST/SSE 同形，buildAllowSnapshot 单一构造）
    const logged = (audit.log as jest.Mock).mock.calls[0][0] as {
      authorization?: string;
      outcome?: string;
      tool?: string;
    };
    // C-4: the `tool_call` row lands both off-chain attribution columns — the tool name and the
    // structured outcome, spelled in the chat path's own vocabulary.
    // C-4：`tool_call` 行落下两列链外归因列 —— 工具名与结构化结局，用对话那条路自己的词表拼写。
    expect(logged.outcome).toBe('executed');
    expect(logged.tool).toBe('query_events');
    expect(logged.authorization).toBeDefined();
    expect(JSON.parse(logged.authorization!)).toMatchObject({
      allowed: true,
      tool: 'query_events',
      riskLevel: 'R1',
      strategy: 'auto',
    });
    expect((res as any).result.content[0].text).toContain('3');
    expect((res as any).result.isError).toBe(false);
  });

  it('tools/call 读工具执行失败 → 不写放行快照（避免 isError+authorization 被误判为阻断）', async () => {
    ai.executeToolForExternal.mockResolvedValue({
      executed: true,
      requiresConfirmation: false,
      result: { success: false, error: 'boom' },
    });
    await controller.handle(user, {
      jsonrpc: '2.0',
      id: 44,
      method: 'tools/call',
      params: { name: 'query_events', arguments: {} },
    });
    const logged = (audit.log as jest.Mock).mock.calls[0][0] as {
      authorization?: string;
      isError?: boolean;
      outcome?: string;
    };
    expect(logged.isError).toBe(true);
    expect(logged.authorization).toBeUndefined();
    // C-4: a failed execution is `failed` — a real value, not a blank column.
    // C-4：执行失败是 `failed` —— 一个真值，不是空列。
    expect(logged.outcome).toBe('failed');
  });

  it('tools/call 写工具 → 不执行，返回需确认提示', async () => {
    ai.executeToolForExternal.mockResolvedValue({ executed: false, requiresConfirmation: true });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'create_event', arguments: {} },
    });
    expect((res as any).result.content[0].text).toContain('requires confirmation');
    expect((res as any).result.isError).toBe(false);
    // C-4: a call held for confirmation is `pending`, and still names its tool — a blank row here is
    // what the two columns exist to prevent.
    // C-4：被扣下等确认的调用是 `pending`，并仍点名它的工具 —— 空行正是这两列要防止的东西。
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'pending', tool: 'create_event' }),
    );
  });

  /**
   * Holding a call is only half a promise: before this, the door said "requires confirmation" and
   * handed the client nothing to confirm with — a dead end the P0-19 readings charged as
   * `confirmation-asked` missing. These three pin the artifact and the token.
   *
   * 只说「需确认」是半句承诺：此前那扇门告诉客户端「requires confirmation」，却没给任何可拿去确认的
   * 东西 —— 正是 P0-19 读数记为 `confirmation-asked` 缺失的那条死路。下面三条钉住 artifact 与 token。
   */
  it('写工具（R3）→ 建持久确认行并把 token 返给客户端（本人可裁）', async () => {
    ai.executeToolForExternal.mockResolvedValue({ executed: false, requiresConfirmation: true });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 51,
      method: 'tools/call',
      params: { name: 'create_event', arguments: { title: 'x' } },
    });

    // 同一份参数进 artifact（不是散文），目的地绑定随行（AUTHZ-1）
    expect(store.create).toHaveBeenCalledWith('1', 'create_event', { title: 'x' }, undefined, undefined, 'local');
    expect(r4.createR4ApprovalRequest).not.toHaveBeenCalled();
    expect((res as any).result._meta.keelbase).toEqual({
      requiresConfirmation: true,
      status: 'pending',
      confirmationToken: 'r3-token',
      decidedBy: 'operator',
    });
    expect((res as any).result.content[0].text).toContain('r3-token');
    expect((res as any).result.isError).toBe(false);
    // 被扣下的结局不变：pending；工具没有执行
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'pending', tool: 'create_event' }),
    );
  });

  it('写工具（审批档 R4）→ 建审批请求而不是本人可裁的确认行（第二个人点头）', async () => {
    gate.requiresApproval.mockResolvedValue(true);
    ai.executeToolForExternal.mockResolvedValue({ executed: false, requiresConfirmation: true });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 52,
      method: 'tools/call',
      params: { name: 'create_event', arguments: { title: 'x' } },
    });

    expect(r4.createR4ApprovalRequest).toHaveBeenCalledWith('1', 'create_event', { title: 'x' }, undefined, 'local');
    // 派到本人确认行就等于绕过 R4 的双人控制
    expect(store.create).not.toHaveBeenCalled();
    expect((res as any).result._meta.keelbase).toMatchObject({
      confirmationToken: 'r4-token',
      decidedBy: 'approver',
    });
  });

  it('建 artifact 失败 → 仍如实回「需确认且未执行」，不谎称有 token、不 500', async () => {
    store.create.mockRejectedValue(new Error('db down'));
    ai.executeToolForExternal.mockResolvedValue({ executed: false, requiresConfirmation: true });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 53,
      method: 'tools/call',
      params: { name: 'create_event', arguments: {} },
    });

    expect((res as any).result.content[0].text).toContain('requires confirmation');
    expect((res as any).result._meta).toBeUndefined();
    expect((res as any).result.isError).toBe(false);
    // 审计行照写（失败的是「留可确认的凭据」，不是「这次调用没发生」）
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'pending', tool: 'create_event' }),
    );
  });

  it('tools/call 工具调用失败 → isError 标记 + 错误内容', async () => {
    ai.executeToolForExternal.mockResolvedValue({
      executed: true,
      requiresConfirmation: false,
      result: { success: false, error: 'boom' },
    });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'query_events', arguments: {} },
    });
    expect((res as any).result.isError).toBe(true);
    expect((res as any).result.content[0].text).toContain('boom');
  });

  it('未知方法 → -32601', async () => {
    const res = await controller.handle(user, { jsonrpc: '2.0', id: 7, method: 'bogus' });
    expect((res as any).error.code).toBe(-32601);
  });

  it('执行抛异常 → -32603', async () => {
    ai.executeToolForExternal.mockImplementation(() => {
      throw new Error('disabled by policy');
    });
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'web_search', arguments: {} },
    });
    expect((res as any).error.code).toBe(-32603);
    expect((res as any).error.message).toContain('disabled by policy');
  });

  it('T5 tools/call 授权拒绝 → 写 deny 审计（authorization 序列化 reasons）+ -32603 原始文案', async () => {
    const reasons = [
      { name: 'policy', ok: false, note: 'tool disabled by governance policy' },
      { name: 'risk_level', ok: true },
    ];
    ai.executeToolForExternal.mockRejectedValue(new AuthorizationDeniedError('无权访问此工具', reasons));
    const res = await controller.handle(user, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'create_event', arguments: { title: 'x' } },
    });
    // deny 分支只记一次审计，authorization 带结构化 reasons（对齐 REST/SSE deny 分支形状）
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '1',
        username: 'alex',
        action: 'tool_call',
        provider: 'mcp',
        isError: true,
        errorMessage: '无权访问此工具',
        detail: expect.stringContaining('authorization denied'),
        authorization: JSON.stringify(reasons),
        // C-4: a governance refusal is `refused` and still names the tool it was about.
        // C-4：治理拒绝是 `refused`，并仍点名它针对的那个工具。
        outcome: 'refused',
        tool: 'create_event',
      }),
    );
    expect((res as any).error.code).toBe(-32603);
    expect((res as any).error.message).toBe('无权访问此工具');
  });

  it('Trust-grade：MCP 拒绝在 JSON-RPC error.data.explanation 带「为什么 + 怎么解决」（zh）', async () => {
    ai.executeToolForExternal.mockRejectedValue(
      new AuthorizationDeniedError(
        'Tool "delete_customer" is blocked (risk level R5)',
        [{ name: 'risk_policy', ok: false }],
        { kind: 'risk_r5', params: { tool: 'delete_customer' } },
      ),
    );
    const res = await controller.handle(
      user,
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'delete_customer', arguments: {} },
      },
      'zh-CN,zh;q=0.9',
    );

    expect((res as any).error.data.explanation).toMatchObject({
      deniedBy: 'risk_policy',
      reasonKey: 'ai.deny.risk_r5.reason',
      nextStepKey: 'ai.deny.risk_r5.nextStep',
      params: { tool: 'delete_customer' },
    });
    expect((res as any).error.data.explanation.reason).toContain('R5');
    expect((res as any).error.data.explanation.nextStep).toContain('低风险工具');
  });

  it('T5 tools/call 风险策略拒绝（risk_policy）→ outcome=blocked（未到裁决，另一道闸）', async () => {
    ai.executeToolForExternal.mockRejectedValue(
      new AuthorizationDeniedError('blocked by risk policy', [{ name: 'risk_policy', ok: false }]),
    );
    await controller.handle(user, {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'delete_customer', arguments: { id: 1 } },
    });
    // C-4: `risk_policy` never reached a decision, so the outcome is `blocked`, not `refused`.
    // C-4：`risk_policy` 从没到过裁决，故结局是 `blocked`，不是 `refused`。
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'blocked', tool: 'delete_customer' }),
    );
  });

  it('通知类方法无响应', async () => {
    const res = await controller.handle(user, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res).toEqual({});
  });
});
