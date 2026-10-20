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
  let conversation: { appendMessage: jest.Mock };
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
    conversation = { appendMessage: jest.fn().mockResolvedValue(undefined) };
    service = new MyConfirmationService(
      repo as never,
      store as never,
      presentation as never,
      r4 as never,
      conversation as never,
    );
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

    it('超离线窗口的 pending 不返回；窗口内的返回，且带的是**记录下来的**那个窗口', async () => {
      // REV-7：刻意选一个与 `createdAt + 当前离线 TTL` **不相等**的窗口值 —— 旧实现是按当前配置重算的，
      // 这条断言因此对旧实现为红（它给的会是 24h 后的值，而不是这里记下的 1h 后）。
      const recordedWindow = new Date(Date.now() + 3600_000);
      const fresh = row({ token: 'fresh', expiresAt: recordedWindow });
      const stale = row({ token: 'stale', createdAt: new Date(Date.now() - OFFLINE_TTL - 60_000) });
      repo.find.mockResolvedValue([fresh, stale]);

      const items = await service.list('42');

      expect(items.map((i) => i.token)).toEqual(['fresh']);
      expect(items[0].expiresAt).toBe(recordedWindow.toISOString());
    });

    it('CONF-7：恰好等于离线截止时刻仍是「可裁决」（闭区间，与裁决/清扫同口径）', async () => {
      const now = 1_700_000_100_000;
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
      try {
        const atCutoff = new Date(now - OFFLINE_TTL);
        repo.find.mockResolvedValue([
          row({ token: 'edge', createdAt: atCutoff }),
          row({ token: 'just-out', createdAt: new Date(atCutoff.getTime() - 1) }),
        ]);

        const items = await service.list('42');

        expect(items.map((i) => i.token)).toEqual(['edge']);
      } finally {
        clock.mockRestore();
      }
    });

    it('pending 但**没有**记录窗口的行（引入本列之前的行）→ 省略该字段，不按今天的配置去猜', async () => {
      repo.find.mockResolvedValue([row({ token: 'legacy' })]);

      const items = await service.list('42');

      expect(items.map((i) => i.token)).toEqual(['legacy']);
      expect(items[0].expiresAt).toBeUndefined();
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

    it('CONF-6：迟到批准执行后，向原对话写回可观察的系统注记（终态 + effectId）', async () => {
      repo.findOne.mockResolvedValue(row({ conversationId: 'conv-1' }));
      store.decideOutOfBand.mockResolvedValue({ ok: true, status: 'approved' });

      const res = await service.decide('tok-1', '42', 'approve');

      expect(res).toMatchObject({ ok: true, success: true, resultId: 7 });
      // The next turn reads "approved later and executed" from the conversation history, so the
      // agent no longer treats the timeout as the truth.
      // 对话侧下一轮从会话历史里读得到「稍后已批准并执行」——agent 不再把 timeout 当事实
      expect(conversation.appendMessage).toHaveBeenCalledTimes(1);
      const [conversationId, message] = conversation.appendMessage.mock.calls[0];
      expect(conversationId).toBe('conv-1');
      expect(message.role).toBe('system');
      expect(message.content).toMatch(/out-of-band/i);
      expect(message.content).toContain('create_event');
      expect(message.content).toContain('resultId: 7');
    });

    it('CONF-6：迟到拒绝同样写回，且明确「没有工具跑过」', async () => {
      repo.findOne.mockResolvedValue(row({ conversationId: 'conv-1' }));
      store.decideOutOfBand.mockResolvedValue({ ok: true, status: 'declined' });

      await service.decide('tok-1', '42', 'decline');

      expect(r4.executeApprovedTool).not.toHaveBeenCalled();
      expect(conversation.appendMessage).toHaveBeenCalledTimes(1);
      const [, message] = conversation.appendMessage.mock.calls[0];
      expect(message.content).toMatch(/declined/i);
      expect(message.content).toMatch(/no tool ran/i);
    });

    it('CONF-6：执行未成功时注记如实说「未报成功」，不假装已执行', async () => {
      repo.findOne.mockResolvedValue(row({ conversationId: 'conv-1' }));
      store.decideOutOfBand.mockResolvedValue({ ok: true, status: 'approved' });
      r4.executeApprovedTool.mockResolvedValue({ success: false, error: 'destination changed' });

      await service.decide('tok-1', '42', 'approve');

      const [, message] = conversation.appendMessage.mock.calls[0];
      expect(message.content).toMatch(/did not report success/i);
      expect(message.content).toContain('destination changed');
      expect(message.content).not.toMatch(/executed exactly once/i);
    });

    it('CONF-6：并发两次裁决只执行一次、只写一条注记（后到者 already_decided）', async () => {
      repo.findOne.mockResolvedValue(row({ conversationId: 'conv-1' }));
      store.decideOutOfBand
        .mockResolvedValueOnce({ ok: true, status: 'approved' })
        .mockResolvedValueOnce({ ok: false, reason: 'already_decided', status: 'approved' });

      const [first, second] = await Promise.all([
        service.decide('tok-1', '42', 'approve'),
        service.decide('tok-1', '42', 'approve'),
      ]);

      expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
      expect(r4.executeApprovedTool).toHaveBeenCalledTimes(1);
      expect(conversation.appendMessage).toHaveBeenCalledTimes(1);
    });

    it('CONF-6：历史行没有 conversationId → 不写回、也不因此失败', async () => {
      repo.findOne.mockResolvedValue(row());
      store.decideOutOfBand.mockResolvedValue({ ok: true, status: 'approved' });

      const res = await service.decide('tok-1', '42', 'approve');

      expect(res).toMatchObject({ ok: true, success: true });
      expect(conversation.appendMessage).not.toHaveBeenCalled();
    });

    it('幂等：仲裁 already_decided → **绝不**执行工具（重复点击/并发都走这条）', async () => {
      repo.findOne.mockResolvedValue(row());
      store.decideOutOfBand.mockResolvedValue({ ok: false, reason: 'already_decided' });

      const res = await service.decide('tok-1', '42', 'approve');

      expect(res).toMatchObject({ ok: false, message: 'already decided' });
      expect(r4.executeApprovedTool).not.toHaveBeenCalled();
      // Losing the arbitration produces no new fact to write back — otherwise the same event would
      // land in the conversation twice.
      // 没抢到仲裁就没有「新事实」可回写——否则同一件事会被写进对话两次
      expect(conversation.appendMessage).not.toHaveBeenCalled();
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
