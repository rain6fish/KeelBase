// SPDX-License-Identifier: Apache-2.0

import { AiToolEffectsService } from './ai-tool-effects.service';
import { revokeWindow } from './revoke-staleness';

/**
 * REV-2 细化：外呼补偿端点**之前**先写「意图」，返回后把**确认**单独记为事件。
 *
 * 旧实现是「先外呼、返回后才写态」——进程若在调用中途死掉，该行一个字段都不写，读起来像**从未请求过补偿**；
 * 而「可能根本没到达」与「确实到达了但没有回音」两种不确定被折进同一个 `compensating` 取值。
 *
 * 本组用例钉的是**旧实现不可能产出的观测面**：在外呼发起的那一刻查库，看意图是否**已经**在库；
 * 以及「确认」是否是一条**独立**的写入（旧实现只写一次，且从不写确认列）。
 */

const EFFECT = {
  id: 8,
  userId: '1',
  toolName: 'java_ext',
  resultType: 'proxy_call',
  resultId: 10,
  revokeClass: 'governed_external',
  revokeStatus: null as string | null,
};

function makeRepo(effect: Record<string, unknown> = EFFECT) {
  return {
    findOne: jest.fn().mockResolvedValue(effect),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    create: jest.fn((d: unknown) => d),
    save: jest.fn(),
  };
}

/** 每条 update 的 patch（按调用序） */
function patches(repo: ReturnType<typeof makeRepo>): Array<Record<string, unknown>> {
  return repo.update.mock.calls.map((c) => c[1] as Record<string, unknown>);
}

function makeService(repo: ReturnType<typeof makeRepo>, externalRevoke: jest.Mock) {
  return new AiToolEffectsService(repo as never, undefined, { revoke: externalRevoke } as never);
}

describe('REV-2 细化：意图写在外呼之前，确认是独立事件', () => {
  it('外呼**发起的那一刻**意图已落库（旧实现此刻一个字段都没写）', async () => {
    const repo = makeRepo();
    let atSend: Array<Record<string, unknown>> = [];
    const externalRevoke = jest.fn(async () => {
      // 「外呼进行中」这一刻的快照：意图必须在，否则进程死在这里就什么都不剩
      atSend = patches(repo);
      return { ok: true, message: 'compensated' };
    });
    const svc = makeService(repo, externalRevoke);

    await svc.revokeOwned(8, '1');

    expect(externalRevoke).toHaveBeenCalledTimes(1);
    expect(atSend).toEqual([
      {
        revokeStatus: 'compensating',
        revokeRequestedAt: expect.any(Date),
        revokeAcknowledgedAt: null,
      },
    ]);
  });

  it('确认是**独立**事件：两次写入，第二次只带确认时刻（不把两种情形折进同一个值）', async () => {
    const repo = makeRepo();
    const svc = makeService(repo, jest.fn().mockResolvedValue({ ok: true, message: 'compensated' }));

    const res = await svc.revokeOwned(8, '1');

    expect(patches(repo)).toHaveLength(2);
    // 第二次写入只有确认——不带请求时刻，故「发出」与「确认」之间的间隙本身就是可读的事实
    expect(patches(repo)[1]).toEqual({
      revokeStatus: 'compensating',
      revokeAcknowledgedAt: expect.any(Date),
    });
    expect(patches(repo)[1]).not.toHaveProperty('revokeRequestedAt');
    expect(res?.revokeStatus).toBe('compensating');
  });

  it('重试（revoke_failed 可重试）→ 新意图清掉上一次的确认，旧确认不得冒充这一次', async () => {
    const repo = makeRepo({
      ...EFFECT,
      revokeStatus: 'revoke_failed',
      revokeAcknowledgedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const svc = makeService(repo, jest.fn().mockResolvedValue({ ok: true, message: 'compensated' }));

    await svc.revokeOwned(8, '1');

    expect(patches(repo)[0]).toMatchObject({
      revokeStatus: 'compensating',
      revokeAcknowledgedAt: null,
    });
    expect(patches(repo)[1]).toMatchObject({ revokeAcknowledgedAt: expect.any(Date) });
  });

  it('对方拒绝（非 2xx）也算**到达**：确认落库 + 状态 revoke_failed', async () => {
    const repo = makeRepo();
    const svc = makeService(repo, jest.fn().mockResolvedValue({ ok: false, message: '目标系统拒绝' }));

    const res = await svc.revokeOwned(8, '1');

    expect(patches(repo)[1]).toEqual({
      revokeStatus: 'revoke_failed',
      revokeAcknowledgedAt: expect.any(Date),
    });
    expect(res?.revokeStatus).toBe('revoke_failed');
    expect(res?.revoked).toBe(false);
  });

  it('外呼中途失败（进程死/抛错）→ 意图仍在库：该行可被区分于「从未请求」，且读作**可能未到达**', async () => {
    const repo = makeRepo();
    const svc = makeService(repo, jest.fn().mockRejectedValue(new Error('socket hang up')));

    await expect(svc.revokeOwned(8, '1')).rejects.toThrow(/socket hang up/);

    // 意图写了、确认没写 —— 「可能根本没到达外部系统」，而不是「从未请求过补偿」（后者 revoke_status 仍是 null）
    const written = patches(repo);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      revokeStatus: 'compensating',
      revokeRequestedAt: expect.any(Date),
      revokeAcknowledgedAt: null,
    });
    expect(revokeWindow('compensating', written[0].revokeAcknowledgedAt as null)).toBe(
      'unacknowledged',
    );
    expect(revokeWindow('compensating', new Date())).toBe('awaiting_target');
  });

  it('本地可撤路径不受影响：不写意图、不写确认（只有外呼才需要这段间隙）', async () => {
    const repo = makeRepo({
      id: 3,
      userId: '1',
      toolName: 'create_event',
      resultType: 'event',
      resultId: 7,
      revokeClass: 'local_compensate',
      revokeStatus: null,
    });
    const revoker = {
      canHandle: jest.fn().mockReturnValue(true),
      revoke: jest.fn().mockResolvedValue({ revoked: true }),
      describeTarget: jest.fn(),
    };
    const svc = new AiToolEffectsService(repo as never, revoker as never, undefined);

    await svc.revokeOwned(3, '1');

    expect(patches(repo)).toEqual([{ revokeStatus: 'revoked' }]);
  });
});
