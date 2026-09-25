// SPDX-License-Identifier: Apache-2.0

import { ToolExecutionService } from './tool-execution.service';
import { ToolRegistry } from './tool-registry';
import { ToolGateService } from './tool-gate.service';
import { ExternalToolRegistry } from './external-tool-registry';
import { AuthorizationDeniedError } from '../interfaces/tool.interface';

/**
 * 执行域单测（阶段 3 第六刀从 `ai.service.spec.ts` 整段搬来，**断言一字未改**）。
 * 门控用真实 `ToolGateService`（与 ai.service.spec 同口径）：mock 掉就丢了被测对象。
 */
describe('ToolExecutionService（执行域）', () => {
  let toolExecution: ToolExecutionService;
  let mockToolRegistry: jest.Mocked<ToolRegistry>;
  let mockToolGate: ToolGateService;
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
    mockToolGate = new ToolGateService(mockToolRegistry as any, externalTools);
    toolExecution = new ToolExecutionService(mockToolRegistry as any, mockToolGate, externalTools);
  });

  describe('executeWrite（HS-3 幂等 + 副作用登记）', () => {
    it('HS-3: executeWrite 无已有副作用时执行并记录', async () => {
      const record = jest.fn().mockResolvedValue({ id: 1 });
      (toolExecution as any).toolEffectsService = {
        buildKey: jest.fn().mockReturnValue('new-key'),
        findExisting: jest.fn().mockResolvedValue({ existing: false }),
        record,
      };
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 100 } });

      const result = await toolExecution.executeWrite('create_event', { title: 'X' }, '1', 'c1');

      expect(result).toEqual({ success: true, data: { id: 100 } });
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '1', toolName: 'create_event', conversationId: 'c1' }),
        'event',
        100,
        { before: null, after: null }, // E-1 快照（测试未注入 captor → null）
      );
      (toolExecution as any).toolEffectsService = undefined;
    });

    // ── P1：外部 MCP 写工具的幂等（回归）────────────────────────────────────────
    const registerExternal = (callTool: jest.Mock) =>
      externalTools.register({
        isExternal: (n: string) => n.startsWith('mcp_'),
        requiresConfirmation: async () => true,
        callTool,
      } as never);

    it('P1: 外部写同键重放 → 幂等命中，且**不再调用** callTool（防真实二次外部写）', async () => {
      const callTool = jest.fn().mockResolvedValue({ executed: true, content: { id: 7 } });
      registerExternal(callTool);
      const record = jest.fn().mockResolvedValue({ id: 1 });
      (toolExecution as any).toolEffectsService = {
        findExisting: jest.fn().mockResolvedValue({ existing: false }),
        record,
        listGroup: jest.fn().mockResolvedValue([]),
      };

      const first = await toolExecution.executeWrite('mcp_send_email', { to: 'a@b.c' }, '1', 'c1');
      expect(first).toEqual({ success: true, data: { id: 7 } });
      expect(callTool).toHaveBeenCalledTimes(1);
      // 锚行：resultType=external_call，resultId 取外部返回的 id，revokeClass 钉 none（MCP 无补偿通道 ⇒ 不可撤）
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ toolName: 'mcp_send_email', conversationId: 'c1', revokeClass: 'none' }),
        'external_call',
        7,
      );

      // 同键重放（LLM 重试 / 二次裁决 / 重启）→ 命中幂等，**不再**触发外部调用
      (toolExecution as any).toolEffectsService.findExisting = jest
        .fn()
        .mockResolvedValue({ existing: true, effect: { resultId: 7, resultType: 'external_call' } });
      const second = await toolExecution.executeWrite('mcp_send_email', { to: 'a@b.c' }, '1', 'c1');
      expect(second).toEqual({ success: true, data: { id: 7, idempotent: true } });
      expect(callTool).toHaveBeenCalledTimes(1);
    });

    it('P1: 外部写**失败不登记**锚行（否则键被占，之后每次重试都回放失败结果）', async () => {
      registerExternal(jest.fn().mockResolvedValue({ executed: false, error: 'boom' }));
      const record = jest.fn().mockResolvedValue({ id: 1 });
      (toolExecution as any).toolEffectsService = {
        findExisting: jest.fn().mockResolvedValue({ existing: false }),
        record,
        listGroup: jest.fn().mockResolvedValue([]),
      };

      const res = await toolExecution.executeWrite('mcp_send_email', { to: 'a@b.c' }, '1', 'c1');

      expect(res.success).toBe(false);
      expect(record).not.toHaveBeenCalled();
    });

    it('P1: 外部写无返回 id 时用稳定 hash 作 resultId（同参数两次调用取同一个值）', async () => {
      registerExternal(jest.fn().mockResolvedValue({ executed: true, content: {} }));
      const record = jest.fn().mockResolvedValue({ id: 1 });
      (toolExecution as any).toolEffectsService = {
        findExisting: jest.fn().mockResolvedValue({ existing: false }),
        record,
        listGroup: jest.fn().mockResolvedValue([]),
      };

      await toolExecution.executeWrite('mcp_send_email', { to: 'a@b.c' }, '1', 'c1');
      await toolExecution.executeWrite('mcp_send_email', { to: 'a@b.c' }, '1', 'c2');

      const [firstId, secondId] = record.mock.calls.map((c) => c[2] as number);
      expect(Number.isInteger(firstId)).toBe(true);
      expect(firstId).toBeGreaterThan(0);
      expect(firstId).toBe(secondId); // 稳定（可回溯同参数调用），不随会话漂移
    });

    it('HS-3: create_contract 副作用 resultType 记 contract（非兜底 todo）', async () => {
      const record = jest.fn().mockResolvedValue({ id: 1 });
      (toolExecution as any).toolEffectsService = {
        buildKey: jest.fn().mockReturnValue('new-key-contract'),
        findExisting: jest.fn().mockResolvedValue({ existing: false }),
        record,
      };
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 200 } });

      const result = await toolExecution.executeWrite('create_contract', { name: 'X' }, '1', 'c1');

      expect(result).toEqual({ success: true, data: { id: 200 } });
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '1', toolName: 'create_contract', conversationId: 'c1' }),
        'contract',
        200,
        { before: null, after: null },
      );
      (toolExecution as any).toolEffectsService = undefined;
    });

    it('FP-8: B 路径写空体成功 → 仍记 proxy_call 副作用锚（proxyResultId），不假装有 data', async () => {
      const record = jest.fn().mockResolvedValue({ id: 1 });
      (toolExecution as any).toolEffectsService = {
        buildKey: jest.fn().mockReturnValue('fp8-key'),
        findExisting: jest.fn().mockResolvedValue({ existing: false }),
        record,
      };
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: null });
      const origIsProxy = (toolExecution as any).isProxyTool;
      (toolExecution as any).isProxyTool = () => true;
      try {
        const result = await toolExecution.executeWrite('proxy_write_empty', { id: '7' }, '1', 'c1');
        expect(result).toEqual({ success: true, data: null });
        expect(record).toHaveBeenCalledTimes(1);
        const [ctx, resultType, resultId, snap] = record.mock.calls[0];
        expect(ctx).toMatchObject({ userId: '1', toolName: 'proxy_write_empty', conversationId: 'c1' });
        expect(resultType).toBe('proxy_call');
        expect(typeof resultId).toBe('number');
        expect(resultId).toBeGreaterThan(0); // 稳定 proxyResultId 锚，非空不伪造
        expect(snap).toEqual({ before: null, after: null });
      } finally {
        (toolExecution as any).isProxyTool = origIsProxy;
        (toolExecution as any).toolEffectsService = undefined;
      }
    });

    it('FP-8: 非 proxy 写返回空体（无 data）→ 不记录（缺锚不伪造）', async () => {
      const record = jest.fn();
      (toolExecution as any).toolEffectsService = {
        buildKey: jest.fn().mockReturnValue('local-empty'),
        findExisting: jest.fn().mockResolvedValue({ existing: false }),
        record,
      };
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: null });
      await toolExecution.executeWrite('create_event', { title: 'X' }, '1', 'c1');
      expect(record).not.toHaveBeenCalled();
      (toolExecution as any).toolEffectsService = undefined;
    });

    it('HS-3: executeWrite 无 toolEffectsService 时直接执行不记录', async () => {
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });
      (toolExecution as any).toolEffectsService = undefined;
      const result = await toolExecution.executeWrite('create_event', {}, '1');
      expect(result).toEqual({ success: true, data: { id: 1 } });
    });

    it('HS-3: executeWrite 外部 MCP 工具经 provider 调用', async () => {
      (toolExecution as any).externalTools.provider = {
        isExternal: jest.fn().mockReturnValue(true),
        callTool: jest.fn().mockResolvedValue({ executed: true, content: 'sent' }),
      };
      const result = await toolExecution.executeWrite('mcp_wx_send_email', { to: 'a' }, '1');
      expect(result).toEqual({ success: true, data: 'sent' });
      (toolExecution as any).externalTools.provider = undefined;
    });
  });

  describe('NC-3 plan/子代理只读门控（executeAgentRead）', () => {
    it('写/需确认工具 → 拒绝（agent_read_only reasons），不经 toolRegistry.execute', async () => {
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      const err = await toolExecution
        .executeAgentRead('create_event', { title: 'x' }, '1')
        .catch((e: any) => e);
      expect(err.message).toContain('write/confirmation-gated');
      expect(err.reasons.some((c: any) => c.name === 'agent_read_only' && c.ok === false)).toBe(true);
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('治理策略禁用的只读工具 → 拒绝（tool_enabled），不执行', async () => {
      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      (mockToolGate as any).governancePolicy = {
        isToolEnabled: jest.fn().mockResolvedValue(false),
        getAllowedRoles: jest.fn().mockResolvedValue([]),
      };
      const err = await toolExecution
        .executeAgentRead('web_search', { q: 'x' }, '1')
        .catch((e: any) => e);
      expect(err.message).toContain('disabled by governance policy');
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('放行的只读工具 → 经 executeRead 同源执行', async () => {
      mockToolRegistry.requiresConfirmation.mockReturnValue(false);
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { total: 3 } });
      const res = await toolExecution.executeAgentRead('query_events', { start: 'x' }, '1');
      expect(res.success).toBe(true);
      expect(mockToolRegistry.execute).toHaveBeenCalledWith('query_events', { start: 'x' }, '1');
    });
  });

  /**
   * AUTHZ-1 / AUTHZ-2 都在**执行点**成立，故断言也钉在这里。
   *
   * 观测面（旧实现不可能产出）：旧实现里「artifact 绑的目的地与工具此刻的目的地不一致」这件事
   * **根本不存在**——artifact 没有目的地，执行点也没有比对，于是同一个 artifact 指向另一个目标时
   * 照常写下去；同理「越域字段」在旧实现里只是普通参数。两者修复后的表现都是**拒绝执行**，
   * 而「工具一次都没被调用」是旧实现无论如何都产不出的观测面。
   */
  describe('AUTHZ-1 确认 artifact 的目的地绑定（执行点）', () => {
    const proxyTool = (audience: string) => ({ name: 'create_invoice', audience } as any);

    it('artifact 绑 legacy-erp、工具此刻指向 legacy-crm → 拒，且不执行', async () => {
      mockToolRegistry.getTool.mockReturnValue(proxyTool('legacy-crm'));
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });

      const err = await toolExecution
        .executeWrite('create_invoice', { amount: 1 }, '1', 'c1', undefined, {
          audience: 'legacy-erp',
        })
        .catch((e: any) => e);

      expect(err).toBeInstanceOf(AuthorizationDeniedError);
      expect(err.message).toContain('destination changed since the confirmation was issued');
      expect(err.reasons).toEqual([
        expect.objectContaining({ name: 'destination_binding', ok: false }),
      ]);
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('artifact 绑定的目的地与此刻一致 → 照常执行', async () => {
      mockToolRegistry.getTool.mockReturnValue(proxyTool('legacy-erp'));
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });

      const res = await toolExecution.executeWrite(
        'create_invoice',
        { amount: 1 },
        '1',
        'c1',
        undefined,
        { audience: 'legacy-erp' },
      );

      expect(res).toEqual({ success: true, data: { id: 1 } });
      expect(mockToolRegistry.execute).toHaveBeenCalledTimes(1);
    });

    it('外部 MCP 工具的目的地是它的 server 名——换 server 即换目标', async () => {
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });

      const err = await toolExecution
        .executeWrite('mcp_billing_charge', { amount: 1 }, '1', 'c1', undefined, {
          audience: 'mcp:inventory',
        })
        .catch((e: any) => e);

      expect(err.message).toContain('confirmed for "mcp:inventory", now "mcp:billing"');
    });

    it('没有 artifact 的写（免确认 / 本轮信任）不传 audience → 不受此约束', async () => {
      mockToolRegistry.getTool.mockReturnValue(proxyTool('legacy-crm'));
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 2 } });

      const res = await toolExecution.executeWrite('create_invoice', { amount: 1 }, '1', 'c1');

      expect(res).toEqual({ success: true, data: { id: 2 } });
    });
  });

  describe('AUTHZ-2 授权层声明的可写字段域 / destination 白名单（执行点）', () => {
    const withPolicy = (override: Record<string, unknown>) => {
      const gate = new ToolGateService(mockToolRegistry as any, externalTools, {
        getToolPolicy: jest.fn().mockResolvedValue({
          enabled: true,
          requiresConfirmation: true,
          requiresApproval: false,
          allowedRoles: [],
          mode: 'confirm',
          writableFields: [],
          allowedDestinations: [],
          ...override,
        }),
        isToolEnabled: jest.fn().mockResolvedValue(true),
        getAllowedRoles: jest.fn().mockResolvedValue([]),
      } as any);
      return new ToolExecutionService(mockToolRegistry as any, gate, externalTools);
    };

    it('声明了字段域的工具，请求带域外字段 → 拒（旧实现无域概念，照常写）', async () => {
      const svc = withPolicy({ writableFields: ['status'] });
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });

      const err = await svc
        .executeWrite('update_ticket', { status: 'done', owner: 9 }, '1', 'c1')
        .catch((e: any) => e);

      expect(err).toBeInstanceOf(AuthorizationDeniedError);
      expect(err.message).toContain('outside its writable field domain: owner');
      expect(err.reasons).toEqual([expect.objectContaining({ name: 'field_domain', ok: false })]);
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('域内字段 → 照常执行（字段域是上限，不是要求逐字全等）', async () => {
      const svc = withPolicy({ writableFields: ['status', 'priority'] });
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 3 } });

      const res = await svc.executeWrite('update_ticket', { status: 'done' }, '1', 'c1');

      expect(res).toEqual({ success: true, data: { id: 3 } });
    });

    it('destination 不在白名单 → 拒', async () => {
      const svc = withPolicy({ allowedDestinations: ['legacy-erp'] });
      mockToolRegistry.getTool.mockReturnValue({ name: 'create_invoice', audience: 'legacy-crm' } as any);
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 1 } });

      const err = await svc
        .executeWrite('create_invoice', { amount: 1 }, '1', 'c1')
        .catch((e: any) => e);

      expect(err.message).toContain('not allowed to write to destination "legacy-crm"');
      expect(err.reasons).toEqual([
        expect.objectContaining({ name: 'destination_allowed', ok: false }),
      ]);
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('未声明（两域皆空）→ 不约束，照常执行', async () => {
      const svc = withPolicy({});
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 4 } });

      const res = await svc.executeWrite('update_ticket', { anything: 1 }, '1', 'c1');

      expect(res).toEqual({ success: true, data: { id: 4 } });
    });
  });
});
