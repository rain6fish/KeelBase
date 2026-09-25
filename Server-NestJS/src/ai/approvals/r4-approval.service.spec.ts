// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { R4ApprovalService } from './r4-approval.service';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolGateService } from '../tools/tool-gate.service';
import { ExternalToolRegistry } from '../tools/external-tool-registry';

/**
 * R4 双人审批域单测（阶段 3 第七刀从 `ai.service.spec.ts` 整段搬来，**断言一字未改**；
 * 文末两条为搬迁时新增的护栏，已标注）。
 * 门控用真实 `ToolGateService`、执行用真实 `ToolExecutionService`（与 ai.service.spec 同口径）：
 * mock 掉就丢了被测对象——「批准前工具被禁用 → 批准也不执行」这条断言正是穿过它们成立的。
 */
describe('R4ApprovalService（R4 双人审批域）', () => {
  let r4: R4ApprovalService;
  let mockToolRegistry: jest.Mocked<ToolRegistry>;
  let mockToolGate: ToolGateService;
  let externalTools: ExternalToolRegistry;
  let toolExecution: ToolExecutionService;
  let mockAuditService: { log: jest.Mock };

  const makeService = (
    repo?: unknown,
    users?: unknown,
    audit: { log: jest.Mock } = mockAuditService,
  ): R4ApprovalService =>
    new R4ApprovalService(toolExecution, audit as any, repo as any, users as any);

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
    mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    r4 = makeService();
  });

  describe('审批列表与裁决（管理端审批页）', () => {
    it('KB-5 修复：R4 审批箱排除 kind=run 聚合行（只列单条请求，并保留迁移前 NULL）', async () => {
      const find = jest.fn().mockResolvedValue([]);
      r4 = makeService({ find });

      await r4.listPendingApprovals(50);

      const arg = find.mock.calls[0][0] as { where: Array<Record<string, unknown>> };
      // 两条件 OR：kind='single' 与 kind IS NULL（迁移前旧行）——两者都保留，kind='run' 被排除
      expect(arg.where).toHaveLength(2);
      expect(arg.where[0]).toMatchObject({ status: 'pending', riskLevel: 'R4', kind: 'single' });
      expect(arg.where[1]).toMatchObject({ status: 'pending', riskLevel: 'R4' });
      expect(arg.where[1].kind).toBeDefined(); // IsNull() 操作符（非 'run'）
    });

    it('② 绑定：审批列表项键集 ⊆ governance-confirmation-item 冻结契约（无越界键）', async () => {
      const row = {
        id: 1, token: 't', toolName: 'create_event', args: '{}', operatorId: '5',
        conversationId: null, riskLevel: 'R4', status: 'pending', kind: 'single',
        runItems: null, approverId: null, decidedAt: null, createdAt: new Date(),
        // P2 执行轴三列（租约列是内部并发状态，投影必须把它挡在响应之外）
        executionClaimedAt: null, executedAt: null, executionError: null,
      };
      r4 = makeService(
        { find: jest.fn().mockResolvedValue([row]) },
        { findOne: jest.fn().mockResolvedValue({ username: 'alice' }) },
      );
      const items = await r4.listPendingApprovals(50);
      // 契约已升 v2（P2 加执行轴），绑定断言随之读 v2
      const props = Object.keys(
        (
          JSON.parse(
            readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v2/governance-confirmation-item.schema.json'), 'utf8'),
          ) as { properties: Record<string, unknown> }
        ).properties,
      );
      expect(Object.keys(items[0]).filter((k) => !props.includes(k))).toEqual([]);
      // 契约 additionalProperties:false：内部租约列绝不外泄
      expect(Object.keys(items[0])).not.toContain('executionClaimedAt');
    });

    it('③ 已审批历史的投影也带执行态（P2）：失败的行如实报 failed，租约列同样不外泄', async () => {
      const row = {
        id: 2, token: 't2', toolName: 'create_event', args: '{}', operatorId: '5',
        conversationId: null, riskLevel: 'R4', status: 'approved', kind: 'single',
        runItems: null, approverId: '9', decidedAt: new Date(), createdAt: new Date(),
        // 认领已过期（> 租约）且无成功 → failed；有错误记录时 UI 可直接显示原因
        executionClaimedAt: new Date(Date.now() - 10 * 60 * 1000),
        executedAt: null,
        executionError: '目标系统不可达',
      };
      r4 = makeService(
        { find: jest.fn().mockResolvedValue([row]) },
        { findOne: jest.fn().mockResolvedValue({ username: 'alice' }) },
      );

      const items = await r4.listDecidedApprovals(50);

      expect(items[0]).toMatchObject({
        id: 2,
        status: 'approved',
        executionState: 'failed',
        executedAt: null,
        executionError: '目标系统不可达',
        approverName: 'alice',
      });
      expect(Object.keys(items[0])).not.toContain('executionClaimedAt');
    });

    it('R4 approve 时拒绝 self-approve（operator === approver）', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue({
          token: 't1',
          operatorId: '1',
          status: 'pending',
          toolName: 'create_event',
          args: '{}',
          conversationId: 'c',
          approverId: null,
          decidedAt: null,
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      r4 = makeService(repo);

      const res = await r4.decideApproval('t1', '1', 'approve');

      expect(res).toEqual({ ok: false, message: 'cannot self-approve' });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('KB-5：run 聚合行（kind=run）不可经审批入口裁决（越权改状态 + 绕 run 语义）', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue({
          token: 'run-1',
          operatorId: '1',
          status: 'pending',
          kind: 'run',
          toolName: 'run',
          args: '[]',
          conversationId: 'c',
          approverId: null,
          decidedAt: null,
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      r4 = makeService(repo);

      const res = await r4.decideApproval('run-1', 'admin', 'approve');

      expect(res.ok).toBe(false);
      expect(res.message).toContain('run confirmation cannot be decided');
      expect(repo.update).not.toHaveBeenCalled(); // 未翻状态
    });

    it('§HS-9 执行前门控：审批请求创建后工具被策略禁用 → 批准也不执行（kill-switch 对在途审批生效）', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue({
          token: 't2',
          operatorId: '1',
          status: 'pending',
          toolName: 'create_event',
          args: '{"title":"x"}',
          conversationId: 'c',
          approverId: null,
          decidedAt: null,
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      r4 = makeService(repo);
      // 发起审批后、批准前：治理策略把该工具禁用（策略实时生效）
      (mockToolGate as any).governancePolicy = { isToolEnabled: jest.fn().mockResolvedValue(false) };
      mockToolRegistry.execute.mockClear();

      const res = await r4.decideApproval('t2', 'admin', 'approve');

      // 执行点复查命中禁用 → 工具未真正执行（此前只在发起时断言，批准仍会执行）
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      expect(res.success).toBe(false);
      (mockToolGate as any).governancePolicy = undefined;
    });

    /**
     * AUTHZ-1：确认 artifact 绑的是**目的地**，不只是工具与参数。
     *
     * 观测面（旧实现不可能产出）：旧实现里确认行没有 audience 这一列，执行点也不做比对，
     * 所以「同一个确认 token，在签发之后目的地被改指」这件事**它照做不误**——本用例在旧实现上是绿的
     * 反面：工具会被调用。修复后同一 token 不再跨目标有效，工具一次都不该被调用。
     */
    it('AUTHZ-1 执行点复查目的地：确认行绑 legacy-erp、工具此刻指向 legacy-crm → 拒且不执行', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue({
          token: 't4',
          operatorId: '1',
          status: 'pending',
          toolName: 'create_invoice',
          args: '{"amount":1}',
          conversationId: 'c',
          approverId: null,
          decidedAt: null,
          // 签发时记下的目的地（artifact 的 audience 绑定）
          audience: 'legacy-erp',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      r4 = makeService(repo);
      // 签发之后、批准之前：该工具被改指到另一个目标系统（Settings 热重载换代理目标的等价形态）
      mockToolRegistry.getTool.mockReturnValue({ name: 'create_invoice', audience: 'legacy-crm' } as any);
      mockToolRegistry.execute.mockClear();

      const res = await r4.decideApproval('t4', 'admin', 'approve');

      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
      expect(res.success).toBe(false);
      expect(res.message).toContain('destination changed since the confirmation was issued');
    });

    // 回归：原先 findOne + save 读改写 → 双人同时批准时两人都通过 pending 检查 → 写工具执行两次。
    // 现在条件更新是唯一仲裁点：只有 affected=1 的那一方执行。
    it('并发裁决：条件更新未命中（affected=0）→ already decided，且**不执行**写工具', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue({
          token: 't3',
          operatorId: '1',
          status: 'pending',
          toolName: 'create_event',
          args: '{"title":"x"}',
          conversationId: 'c',
          approverId: null,
          decidedAt: null,
        }),
        update: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      r4 = makeService(repo);
      mockToolRegistry.execute.mockClear();

      const res = await r4.decideApproval('t3', 'admin', 'approve');

      expect(res.ok).toBe(false);
      expect(res.message).toBe('already decided');
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });
  });

  // ── P2 审批执行轴（执行态 + 重试）：批准 ≠ 执行成功 ──

  describe('P2 执行轴：重试入口与执行认领', () => {
    const approvedRow = (extra: Record<string, unknown> = {}) => ({
      token: 't-exec',
      operatorId: '1',
      status: 'approved',
      toolName: 'create_event',
      args: '{"title":"x"}',
      conversationId: 'c',
      approverId: '9',
      decidedAt: new Date(),
      executionClaimedAt: null,
      executedAt: null,
      executionError: null,
      ...extra,
    });

    it('「已批准但执行失败」的行可重试：认领后真的执行，并落 executedAt', async () => {
      const patches: Array<Record<string, unknown>> = [];
      const repo = {
        findOne: jest.fn().mockResolvedValue(approvedRow({ executionError: 'boom' })),
        update: jest.fn(async (_crit: unknown, patch: Record<string, unknown>) => {
          patches.push(patch);
          return { affected: 1 };
        }),
      };
      r4 = makeService(repo);
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 5 } });
      mockToolRegistry.execute.mockClear();

      const res = await r4.retryExecution('t-exec');

      expect(res.ok).toBe(true);
      expect(res.success).toBe(true);
      expect(mockToolRegistry.execute).toHaveBeenCalledTimes(1);
      expect(patches.some((p) => p.executionClaimedAt instanceof Date)).toBe(true);
      expect(patches.some((p) => p.executedAt instanceof Date)).toBe(true);
      expect(patches.some((p) => p.executionError === null && 'executedAt' in p)).toBe(true);
    });

    it('已成功的行不可重试（不产生第二次执行）', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue(approvedRow({ executedAt: new Date() })),
        update: jest.fn(),
      };
      r4 = makeService(repo);
      mockToolRegistry.execute.mockClear();

      const res = await r4.retryExecution('t-exec');

      expect(res).toMatchObject({ ok: false, reason: 'not_retryable', message: 'already executed' });
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('租约仍新鲜（可能正在执行）时拒绝重试，避免与在途执行撞车', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue(approvedRow({ executionClaimedAt: new Date() })),
        update: jest.fn(),
      };
      r4 = makeService(repo);
      mockToolRegistry.execute.mockClear();

      const res = await r4.retryExecution('t-exec');

      expect(res).toMatchObject({ ok: false, reason: 'not_retryable', message: 'execution in progress' });
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('未批准的行不可重试；不存在的 token → not_found', async () => {
      const pending = { ...approvedRow(), status: 'pending' };
      r4 = makeService({ findOne: jest.fn().mockResolvedValue(pending), update: jest.fn() });
      mockToolRegistry.execute.mockClear();
      expect((await r4.retryExecution('t-exec')).reason).toBe('not_retryable');

      r4 = makeService({ findOne: jest.fn().mockResolvedValue(null), update: jest.fn() });
      expect((await r4.retryExecution('nope')).reason).toBe('not_found');
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('认领未命中（并发裁决 / 重复执行，affected=0）→ **不执行**工具', async () => {
      const repo = {
        findOne: jest.fn(),
        update: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      r4 = makeService(repo);
      mockToolRegistry.execute.mockClear();

      const result = await r4.executeApprovedTool(approvedRow() as never, 'note');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already in progress or already completed');
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('未注入仓储（单测/裁剪装配）时降级：重试明确不可用，执行仍按拆分前行为直跑', async () => {
      r4 = makeService(); // 无 repo
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { id: 8 } });
      mockToolRegistry.execute.mockClear();

      expect(await r4.retryExecution('t')).toMatchObject({ ok: false, reason: 'not_retryable' });

      const result = await r4.executeApprovedTool(approvedRow() as never, 'note');
      expect(result.success).toBe(true);
      expect(mockToolRegistry.execute).toHaveBeenCalledTimes(1);
    });

    it('执行失败：落 executionError 且**不**落 executedAt（该行随后可重试）', async () => {
      const patches: Array<Record<string, unknown>> = [];
      const repo = {
        findOne: jest.fn(),
        update: jest.fn(async (_crit: unknown, patch: Record<string, unknown>) => {
          patches.push(patch);
          return { affected: 1 };
        }),
      };
      r4 = makeService(repo);
      mockToolRegistry.execute.mockResolvedValue({ success: false, error: '目标系统不可达' });
      mockToolRegistry.execute.mockClear();

      const result = await r4.executeApprovedTool(approvedRow() as never, 'note');

      expect(result.success).toBe(false);
      expect(patches.some((p) => p.executionError === '目标系统不可达')).toBe(true);
      expect(patches.some((p) => p.executedAt instanceof Date)).toBe(false);
    });
  });

  // ── 以下两条为搬迁时**新增**的护栏（原文件无直接覆盖），非迁移代码 ──

  describe('搬迁时新增的护栏', () => {
    it('createR4ApprovalRequest：落 pending R4 行并返回 token（operator 发起，不阻塞对话）', async () => {
      const create = jest.fn((x: unknown) => x);
      const save = jest.fn().mockResolvedValue({ id: 42 });
      r4 = makeService({ create, save });

      const out = await r4.createR4ApprovalRequest('7', 'create_event', { title: 'x' }, 'conv-1');

      expect(out.id).toBe(42);
      expect(out.token).toEqual(expect.any(String));
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          token: out.token,
          toolName: 'create_event',
          args: '{"title":"x"}',
          operatorId: '7',
          riskLevel: 'R4',
          status: 'pending',
          conversationId: 'conv-1',
        }),
      );
    });

    it('未注入 repo 时降级：创建抛错、列表空、裁决 not supported', async () => {
      r4 = makeService();
      await expect(r4.createR4ApprovalRequest('1', 'create_event', {})).rejects.toThrow(
        'Approvals repository not injected',
      );
      await expect(r4.listPendingApprovals()).resolves.toEqual([]);
      await expect(r4.listDecidedApprovals()).resolves.toEqual([]);
      await expect(r4.decideApproval('t', '2', 'approve')).resolves.toEqual({
        ok: false,
        message: 'not supported',
      });
    });
  });
});
