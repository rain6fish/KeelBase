// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolSideEffect } from '../entities/ai-tool-side-effect.entity';
import { AiWriteClaim, WRITE_CLAIM_STATUS } from '../entities/ai-write-claim.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { operationKey, operationKeyOf } from './effect-shared';
import { ToolExecutionService } from '../../ai/tools/tool-execution.service';

/**
 * AW-20: the operation identity is independent of worker, conversation and single invocation, and it is
 * the arbitration point for external-write retries. The two *reverse* criteria are red against the old
 * implementation: a second session re-sending the same operation used to get its own claim and a second
 * real write; arguments that changed but landed on the same downstream effect used to pass as new.
 *
 * Four things are pinned, two of them reverse criteria:
 * 1. A second session with the same arguments is recognised as **the same in-flight operation** and
 *    refused — the old path gave it a fresh claim and sent the external write again.
 * 2. Arguments that changed but reached the same downstream effect get `possible_duplicate`
 *    (`args_changed`) on the row — the old path treated it as a brand-new operation, silently.
 * 3. **The conversation dimension is not deleted**: once the first operation has settled, the same
 *    arguments may still be executed as a **second, legitimate operation** from another session.
 * 4. The identity ignores key order and conversation/worker.
 *
 * A real database rather than a stand-in: the arbitration point is the **partial unique index** on
 * `ai_write_claims`, a decision the database makes, not the mapping layer.
 *
 * AW-20（roadmap §2.1.27）：**操作身份**独立于 worker / 会话 / 单次调用，并成为外部写重试的仲裁点。
 *
 * 读者反馈 F-64：系统有「每个会话内的幂等键」，却没有「一次外部效果的操作身份」—— 同一效果经两个会话
 * 发起时，两边各记各的，谁也不比较。
 *
 * 本套件钉住四件事，其中两条是**反向**判据（对旧实现为红）：
 * 1. 跨会话同参数的第二会话被认成**同一次未结操作**并被拒 —— 旧实现给它一条新占位，照发第二次外部写。
 * 2. 参数变化但下游效果相同 ⇒ 行上标 `possible_duplicate`（`args_changed`）—— 旧实现静默当作新操作。
 * 3. **不删会话维度**：相同参数在第一个操作落定之后，仍可被第二个会话当作**另一次合法操作**执行。
 * 4. 操作身份对键序不敏感、对会话/worker 不敏感。
 *
 * 真数据库而不是替身：仲裁点是 `ai_write_claims` 上那个**部分唯一索引**，它是数据库侧的判定。
 */
const TOOL = 'mcp_vendor_create_ticket';
const USER = 'u-alice';
const ARGS = { to: 'ops@vendor.example', subject: '逾期工单升级' };

describe('AW-20 操作身份：跨会话仲裁 + possible-duplicate', () => {
  let ds: DataSource;
  let effects: AiToolEffectsService;
  let exec: ToolExecutionService;
  let callTool: jest.Mock;
  let executeMock: jest.Mock;

  const claims = () => ds.getRepository(AiWriteClaim);
  const effectRows = () => ds.getRepository(AiToolSideEffect);

  const build = (): void => {
    callTool = jest.fn();
    executeMock = jest.fn();
    const gate = {
      assertToolAllowed: jest.fn().mockResolvedValue(undefined),
      assertWithinDeclaredScope: jest.fn().mockResolvedValue(undefined),
      assertApprovalRequirementHolds: jest.fn().mockResolvedValue(undefined),
      decisionBasis: jest.fn().mockResolvedValue({ role: null, policyRevision: null }),
      destinationOf: () => 'external',
    };
    // Positional assembly of the service: effectsRepo, …(optional slots)…, claimsRepo (11th).
    // 位置式装配：effectsRepo、中间可选槽位、claimsRepo（第 11 位）。
    effects = new AiToolEffectsService(
      effectRows(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      claims(),
    );
    const external = { current: { isExternal: (n: string) => n === TOOL, callTool } };
    exec = new ToolExecutionService(
      { execute: executeMock, getTool: () => ({ name: TOOL }) } as any,
      gate as any,
      external as any,
      effects,
      undefined,
    );
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, AiWriteClaim],
      synchronize: true,
    });
    await ds.initialize();
    build();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  describe('操作身份本身', () => {
    it('对键序不敏感（同一逻辑调用 → 同一身份）', () => {
      expect(operationKeyOf(USER, TOOL, { b: { d: 2, c: 1 }, a: 'x' })).toBe(
        operationKeyOf(USER, TOOL, { a: 'x', b: { c: 1, d: 2 } }),
      );
    });

    it('不含会话 / run：换会话、换 run 仍是同一身份；换用户或换参数则不是', () => {
      const base = operationKey({ userId: USER, toolName: TOOL, args: ARGS });
      expect(
        operationKey({ userId: USER, toolName: TOOL, args: ARGS, conversationId: 'conv-other' } as any),
      ).toBe(base);
      expect(
        operationKey({ userId: USER, toolName: TOOL, args: { ...ARGS, subject: '别的' } }),
      ).not.toBe(base);
      expect(operationKeyOf('u-bob', TOOL, ARGS)).not.toBe(base);
    });
  });

  describe('判据①：同一操作经第二个会话发起 ⇒ 认出是同一次未结操作', () => {
    it('**反向**：外部写未了结后，第二会话的同操作被拒，外呼只发生一次', async () => {
      callTool.mockResolvedValue({ executed: false, error: '目标系统请求超时（30000ms）' });

      const first = await exec.executeWrite(TOOL, ARGS, USER, 'conv-A');
      expect(first.success).toBe(false);
      expect(callTool).toHaveBeenCalledTimes(1);

      // Second session: its claim key differs (the conversation is part of it) but the operation identity is the same.
      // 第二会话：会话级幂等键不同（键含会话），但操作身份相同。
      const second = await exec.executeWrite(TOOL, ARGS, USER, 'conv-B');
      expect(second.success).toBe(false);
      expect(second.error).toContain('同一次操作');
      expect(second.error).toContain('本次未执行');
      // The strongest observation: the real outbound call happens exactly once (the old path sent a second — a real double write).
      // 最强的观测面：真实外呼始终只有一次（旧实现此处会再发一次 —— 真双写）
      expect(callTool).toHaveBeenCalledTimes(1);

      // The second session left no claim of its own: the lease refused it at the insert.
      // 第二会话没有落下自己的占位行：租约在插入处就拒绝了它。
      const keyB = AiToolEffectsService.buildKey({
        userId: USER,
        conversationId: 'conv-B',
        toolName: TOOL,
        args: ARGS,
      });
      expect(await claims().findOne({ where: { idempotencyKey: keyB } })).toBeNull();
    });

    it('占位结果指得出持有者（哪个会话、哪条占位），而不是只给一个 false', async () => {
      callTool.mockResolvedValue({ executed: false, error: 'ECONNRESET' });
      await exec.executeWrite(TOOL, ARGS, USER, 'conv-A');

      const held = await effects.claimWrite({
        userId: USER,
        conversationId: 'conv-C',
        toolName: TOOL,
        args: ARGS,
      });

      expect(held.won).toBe(false);
      expect(held.reason).toBe('operation_in_flight');
      expect(held.heldBy).toMatchObject({ conversationId: 'conv-A', userId: USER });
      expect(held.operationKey).toBe(operationKey({ userId: USER, toolName: TOOL, args: ARGS }));
    });
  });

  describe('判据②：不删会话维度 —— 相同参数仍可以是另一次合法操作', () => {
    it('第一个操作**落定之后**，第二会话的同参数写照常执行（两条独立记录）', async () => {
      callTool.mockResolvedValue({ executed: true, content: { id: 900 } });

      const first = await exec.executeWrite(TOOL, ARGS, USER, 'conv-A');
      expect(first.success).toBe(true);

      const second = await exec.executeWrite(TOOL, ARGS, USER, 'conv-B');
      expect(second.success).toBe(true);
      // The old path (and any implementation that simply drops the conversation) would answer "idempotent hit" and skip the second call; here it must really execute.
      // 旧实现（也是去掉会话维度后的错误实现）会给第二次「幂等命中」而不再执行；这里必须真执行。
      expect(callTool).toHaveBeenCalledTimes(2);

      const rows = await effectRows().find({ order: { id: 'ASC' } });
      expect(rows).toHaveLength(2);
      expect(rows[0].conversationId).toBe('conv-A');
      expect(rows[1].conversationId).toBe('conv-B');

      const settled = await claims().find({ order: { id: 'ASC' } });
      expect(settled.map((c) => c.status)).toEqual([
        WRITE_CLAIM_STATUS.SETTLED,
        WRITE_CLAIM_STATUS.SETTLED,
      ]);
      expect(settled[1].attempts).toBe(1);
    });

    it('本地写同样如此：跨会话同参数的第二次执行不被折叠成一次', async () => {
      executeMock
        .mockResolvedValueOnce({ success: true, data: { id: 42 } })
        .mockResolvedValueOnce({ success: true, data: { id: 43 } });

      const first = await exec.executeWrite('create_event', { title: '同一件事' }, USER, 'conv-A');
      const second = await exec.executeWrite('create_event', { title: '同一件事' }, USER, 'conv-B');

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(executeMock).toHaveBeenCalledTimes(2);
      expect(await effectRows().count()).toBe(2);
    });
  });

  describe('判据③：参数变化但下游效果相同 ⇒ possible-duplicate，不静默当新操作', () => {
    it('**反向**：不同参数打回同一个 resultId ⇒ 第二行被标 `args_changed` 并指回第一行', async () => {
      // The target lands both calls on the same downstream record (same id): the arguments changed, the effect did not.
      // 目标系统把两次调用都落到同一条下游记录（同一个 id）—— 参数变了，效果没变。
      callTool.mockResolvedValue({ executed: true, content: { id: 900 } });

      const first = await exec.executeWrite(TOOL, ARGS, USER, 'conv-A');
      expect(first.success).toBe(true);

      const second = await exec.executeWrite(
        TOOL,
        { ...ARGS, subject: '逾期工单升级（重发）' },
        USER,
        'conv-A',
      );
      expect(second.success).toBe(true);

      const rows = await effectRows().find({ order: { id: 'ASC' } });
      expect(rows).toHaveLength(2);
      expect(rows[0].possibleDuplicate ?? null).toBeNull();
      expect(JSON.parse(rows[1].possibleDuplicate as string)).toEqual({
        of: rows[0].id,
        reason: 'args_changed',
      });
      // Kept as a finding: the mark rewrites nothing; both rows remain and both are reachable by the revoke path.
      // 保留判定：标记不改写任何东西，两行都还在、都能被撤销路径读到
      expect(rows[1].resultType).toBe(rows[0].resultType);
      expect(rows[1].resultId).toBe(rows[0].resultId);
    });

    it('同一操作从另一会话再次登记（已落定后）⇒ 标 `same_operation_other_claim`，两行并列保留', async () => {
      callTool.mockResolvedValue({ executed: true, content: { id: 900 } });
      await exec.executeWrite(TOOL, ARGS, USER, 'conv-A');
      await exec.executeWrite(TOOL, ARGS, USER, 'conv-B');

      const rows = await effectRows().find({ order: { id: 'ASC' } });
      expect(JSON.parse(rows[1].possibleDuplicate as string)).toEqual({
        of: rows[0].id,
        reason: 'same_operation_other_claim',
      });
    });

    it('正常路径不被乱标：不同参数、不同下游目标 ⇒ 两行都干净', async () => {
      callTool
        .mockResolvedValueOnce({ executed: true, content: { id: 900 } })
        .mockResolvedValueOnce({ executed: true, content: { id: 901 } });

      await exec.executeWrite(TOOL, ARGS, USER, 'conv-A');
      await exec.executeWrite(TOOL, { ...ARGS, subject: '另一件事' }, USER, 'conv-B');

      const rows = await effectRows().find({ order: { id: 'ASC' } });
      expect(rows.map((r) => r.possibleDuplicate ?? null)).toEqual([null, null]);
    });
  });

  describe('租约只绑在途，不绑历史', () => {
    it('释放（确定未落库）之后，同一操作可被另一会话重新占位', async () => {
      callTool.mockResolvedValue({ executed: true, content: { id: 900 } });
      const first = await exec.executeWrite(TOOL, ARGS, USER, 'conv-A');
      expect(first.success).toBe(true);
      const keyA = AiToolEffectsService.buildKey({
        userId: USER,
        conversationId: 'conv-A',
        toolName: TOOL,
        args: ARGS,
      });
      // Simulate the "confirmed not persisted" branch: a release leaves no lease behind.
      // 模拟「本地确认未落库」那一支：释放不留租约
      await effects.releaseClaim(keyA, 'execute_failed');

      const held = await effects.claimWrite({
        userId: USER,
        conversationId: 'conv-B',
        toolName: TOOL,
        args: ARGS,
      });
      expect(held.won).toBe(true);
    });
  });
});
