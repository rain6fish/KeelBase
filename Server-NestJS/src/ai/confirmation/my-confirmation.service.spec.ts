// SPDX-License-Identifier: Apache-2.0

/**
 * GA 待我确认中心（docs/ai-action-center.spec.md §9）单元测试。
 * 断言都选在「实现错就必然出事」的观测面：越权不能裁决、run/R4 不能离线裁、
 * 已决策**绝不**二次执行工具、超窗口的 pending 不返回。
 */
import { MyConfirmationService } from './my-confirmation.service';
import { AiConfirmationRequest } from '../approvals/ai-confirmation-request.entity';

describe('MyConfirmationService（GA 待我确认中心）', () => {
  const OFFLINE_TTL = 86_400_000;
  let repo: { find: jest.Mock; findOne: jest.Mock };
  let store: { offlineTtlMs: jest.Mock; decideOutOfBand: jest.Mock };
  let presentation: { describeConfirmation: jest.Mock };
  let r4: { executeApprovedTool: jest.Mock };
  let service: MyConfirmationService;

  const row = (over: Partial<AiConfirmationRequest> = {}): AiConfirmationRequest =>
    ({
      token: 'tok-1',
      toolName: 'create_event',
      args: '{"title":"T"}',
      operatorId: '42',
      riskLevel: 'R3',
      kind: 'single',
      status: 'pending',
      // 相对当前时间：离线窗口是「距今 24h」，写死日期会在次日必然过期（本行曾因此挂掉）
      createdAt: new Date(Date.now() - 60_000),
      decidedAt: null,
      ...over,
    }) as AiConfirmationRequest;

  beforeEach(() => {
    repo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() };
    store = { offlineTtlMs: jest.fn().mockResolvedValue(OFFLINE_TTL), decideOutOfBand: jest.fn() };
    presentation = {
      describeConfirmation: jest.fn().mockReturnValue({
        summary: '创建事件：T',
        impact: { actions: 1, targets: [{ resultType: 'event', count: 1 }] },
        revokeClass: 'local_compensate',
        mode: 'immediate',
        run: null,
      }),
    };
    // 执行已拆到 R4ApprovalService（第七刀），呈现行还原已拆到 ToolPresentationService（第八刀）
    r4 = { executeApprovedTool: jest.fn().mockResolvedValue({ success: true, data: { id: 7 } }) };
    service = new MyConfirmationService(repo as never, store as never, presentation as never, r4 as never);
  });

  describe('list：本人作用域 + 离线窗口', () => {
    it('只查本人的行（operatorId 收束）', async () => {
      await service.list('42');
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { operatorId: '42' } }));
    });

    it('status 过滤透传', async () => {
      await service.list('42', { status: 'approved' });
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { operatorId: '42', status: 'approved' } }),
      );
    });

    it('超离线窗口的 pending 不返回；窗口内的返回且带 expiresAt', async () => {
      const fresh = row({ token: 'fresh' });
      const stale = row({ token: 'stale', createdAt: new Date(Date.now() - OFFLINE_TTL - 60_000) });
      repo.find.mockResolvedValue([fresh, stale]);

      const items = await service.list('42');

      expect(items.map((i) => i.token)).toEqual(['fresh']);
      expect(items[0].expiresAt).toBe(new Date(fresh.createdAt.getTime() + OFFLINE_TTL).toISOString());
    });

    it('已决策的行不受窗口限制（历史照常可见），且不带 expiresAt', async () => {
      const old = row({ token: 'old', status: 'approved', createdAt: new Date(Date.now() - OFFLINE_TTL * 10) });
      repo.find.mockResolvedValue([old]);

      const items = await service.list('42');

      expect(items).toHaveLength(1);
      expect(items[0].expiresAt).toBeUndefined();
    });

    it('摘要 / 影响 / 撤销档取自 AiService 单一真源，不在此重算', async () => {
      repo.find.mockResolvedValue([row()]);

      const items = await service.list('42');

      expect(presentation.describeConfirmation).toHaveBeenCalledTimes(1);
      expect(items[0]).toMatchObject({ summary: '创建事件：T', revokeClass: 'local_compensate', mode: 'immediate' });
    });

    it('args 非法 JSON 时降级为空对象，而不是整行报错', async () => {
      repo.find.mockResolvedValue([row({ args: '{not json' })]);

      const items = await service.list('42');

      expect(items[0].arguments).toEqual({});
    });
  });

  describe('decide：安全热路径', () => {
    it('越权与不存在同形：他人 token → not found，且**不**进入裁决', async () => {
      repo.findOne.mockResolvedValue(row({ operatorId: '99' }));

      const res = await service.decide('tok-1', '42', 'approve');

      expect(res.ok).toBe(false);
      expect(store.decideOutOfBand).not.toHaveBeenCalled();
      expect(r4.executeApprovedTool).not.toHaveBeenCalled();
    });

    it('run 行拒绝——离开对话上下文无法完整回放整批', async () => {
      repo.findOne.mockResolvedValue(row({ kind: 'run', toolName: 'run' }));

      const res = await service.decide('tok-1', '42', 'approve');

      expect(res.ok).toBe(false);
      expect(store.decideOutOfBand).not.toHaveBeenCalled();
      expect(r4.executeApprovedTool).not.toHaveBeenCalled();
    });

    it('R4 行拒绝——那是待他人审批，本人无权批', async () => {
      repo.findOne.mockResolvedValue(row({ riskLevel: 'R4' }));

      const res = await service.decide('tok-1', '42', 'approve');

      expect(res.ok).toBe(false);
      expect(store.decideOutOfBand).not.toHaveBeenCalled();
    });

    it('approve：仲裁通过 → 执行一次，并把来源写进审计注记', async () => {
      repo.findOne.mockResolvedValue(row());
      store.decideOutOfBand.mockResolvedValue({ ok: true, status: 'approved' });

      const res = await service.decide('tok-1', '42', 'approve');

      expect(res).toMatchObject({ ok: true, success: true, resultId: 7 });
      expect(r4.executeApprovedTool).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'tok-1' }),
        'R3 approved out-of-band via Action Center',
      );
    });

    it('幂等：仲裁 already_decided → **绝不**执行工具（重复点击/并发都走这条）', async () => {
      repo.findOne.mockResolvedValue(row());
      store.decideOutOfBand.mockResolvedValue({ ok: false, reason: 'already_decided' });

      const res = await service.decide('tok-1', '42', 'approve');

      expect(res).toMatchObject({ ok: false, message: 'already decided' });
      expect(r4.executeApprovedTool).not.toHaveBeenCalled();
    });

    it('decline：只改状态，不执行工具', async () => {
      repo.findOne.mockResolvedValue(row());
      store.decideOutOfBand.mockResolvedValue({ ok: true, status: 'declined' });

      const res = await service.decide('tok-1', '42', 'decline');

      expect(res).toMatchObject({ ok: true, success: false });
      expect(r4.executeApprovedTool).not.toHaveBeenCalled();
    });
  });
});
