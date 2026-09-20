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
      };
      r4 = makeService(
        { find: jest.fn().mockResolvedValue([row]) },
        { findOne: jest.fn().mockResolvedValue({ username: 'alice' }) },
      );
      const items = await r4.listPendingApprovals(50);
      const props = Object.keys(
        (
          JSON.parse(
            readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v1/governance-confirmation-item.schema.json'), 'utf8'),
          ) as { properties: Record<string, unknown> }
        ).properties,
      );
      expect(Object.keys(items[0]).filter((k) => !props.includes(k))).toEqual([]);
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
        save: jest.fn(),
      };
      r4 = makeService(repo);

      const res = await r4.decideApproval('t1', '1', 'approve');

      expect(res).toEqual({ ok: false, message: 'cannot self-approve' });
      expect(repo.save).not.toHaveBeenCalled();
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
        save: jest.fn(),
      };
      r4 = makeService(repo);

      const res = await r4.decideApproval('run-1', 'admin', 'approve');

      expect(res.ok).toBe(false);
      expect(res.message).toContain('run confirmation cannot be decided');
      expect(repo.save).not.toHaveBeenCalled(); // 未翻状态
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
        save: jest.fn().mockResolvedValue({}),
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
