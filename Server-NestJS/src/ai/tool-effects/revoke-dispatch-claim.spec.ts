// SPDX-License-Identifier: Apache-2.0

import { AiToolEffectsService } from './ai-tool-effects.service';

/**
 * ARC-3：外部补偿派发的**条件认领**（CAS）。
 *
 * 缺陷形状：`_skipReason` 的预检是 read-then-act —— 并发的两次撤销都能通过预检、都读到「可派发」，
 * 于是**派发两次补偿**。对退款 / 取消订单这类端点，若非幂等即**真双发**，而这是本条与其余各条
 * 不同量级的地方：别的缺陷是「记录不诚实」，这条是沉默地多执行了一次不可逆操作。
 *
 * 本仓在确认域早有正解（`ConfirmationStore.resolve` 用 `status='pending'` 条件更新 + `affected===0` 即拒），
 * 撤销派发此前没有对应物。修法即把「读态 → 写意图」合成一条带守卫的 UPDATE。
 *
 * 旧实现不可能产出本组用例的观测面：它对行 id 无条件写，两次并发都会走到外呼。
 */

const EXTERNAL_EFFECT = {
  id: 8,
  userId: '1',
  toolName: 'java_ext',
  resultType: 'proxy_call',
  resultId: 10,
  compensationGroup: null,
  revokeClass: 'governed_external',
  revokeStatus: null as string | null,
};

function makeRepo(effect: Record<string, unknown> = EXTERNAL_EFFECT) {
  return {
    findOne: jest.fn().mockResolvedValue(effect),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    create: jest.fn((d: unknown) => d),
    save: jest.fn(),
  };
}

function makeService(repo: ReturnType<typeof makeRepo>, externalRevoke: jest.Mock) {
  return new AiToolEffectsService(repo as never, undefined, { revoke: externalRevoke } as never);
}

describe('ARC-3：外部补偿派发的条件认领', () => {
  it('并发的两次撤销只派发**一次**补偿（旧实现派发两次）', async () => {
    const repo = makeRepo();
    // 模拟真实的条件更新：认领语句只在行尚未被认领时命中；认领之后两条 WHERE 都不再命中。
    // （旧实现对行 id 无条件写，故 criteria 是裸数字 —— 这里连那个分支都进不去。）
    let claimed = false;
    repo.update = jest.fn(async (criteria: unknown) => {
      if (typeof criteria === 'object' && criteria !== null) {
        if (claimed) return { affected: 0 };
        claimed = true;
        return { affected: 1 };
      }
      return { affected: 1 };
    });
    const externalRevoke = jest.fn().mockResolvedValue({ ok: true, message: 'compensated' });
    const svc = makeService(repo, externalRevoke);

    const [a, b] = await Promise.all([svc.revoke(8), svc.revoke(8)]);

    expect(externalRevoke).toHaveBeenCalledTimes(1);
    // 落败的那次不重复外呼，且如实报「已请求、结果未知」——不谎报已撤销，也不谎报失败
    const loser = [a, b].find((r) => r?.skipped === true);
    expect(loser).toBeDefined();
    expect(loser?.revoked).toBe(false);
    expect(loser?.reason).toBe('compensating');
    expect(loser?.revokeStatus).toBe('compensating');
  });

  it('底层没给 affected → 一律不派发（fail-closed，不因读数缺失而多执行一次不可逆操作）', async () => {
    const repo = makeRepo();
    // `UpdateResult.affected` 缺席：拿不到可判定的结果，宁可拒绝，也不误执行（与 ConfirmationStore.resolve 同口径）
    repo.update = jest.fn().mockResolvedValue({});
    const externalRevoke = jest.fn().mockResolvedValue({ ok: true, message: 'compensated' });
    const svc = makeService(repo, externalRevoke);

    const res = await svc.revoke(8);

    expect(externalRevoke).not.toHaveBeenCalled();
    expect(res?.revoked).toBe(false);
    expect(res?.skipped).toBe(true);
  });

  it('闸门的边界：`revoke_failed` 仍可重试（只拦并发，不把重试一并锁死）', async () => {
    const repo = makeRepo({ ...EXTERNAL_EFFECT, revokeStatus: 'revoke_failed' });
    // 第一条（IS NULL）不命中 → 第二条（revoke_failed）命中，认领成功
    let guarded = 0;
    repo.update = jest.fn(async (criteria: unknown) => {
      if (typeof criteria === 'object' && criteria !== null) {
        guarded += 1;
        return { affected: guarded === 1 ? 0 : 1 };
      }
      return { affected: 1 };
    });
    const externalRevoke = jest.fn().mockResolvedValue({ ok: true, message: 'compensated' });
    const svc = makeService(repo, externalRevoke);

    await svc.revoke(8);

    expect(externalRevoke).toHaveBeenCalledTimes(1);
  });
});
