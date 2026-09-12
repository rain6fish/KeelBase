// SPDX-License-Identifier: Apache-2.0

/**
 * 撤销幂等（单条 ↔ 批量一致性）— 缺陷扫查用例
 *
 * 背景：批量撤销 `_revokeBatch` 对 revokeStatus=revoked/compensating 的副作用**跳过不重复触发**
 * （revoke-conversation.spec `already_revoked`）；但单条撤销 `revoke()`（管理端）/`revokeOwned()`
 * （P0-15 本人端）此前**直接调 _doRevoke**，无同款守卫 —— 对外部副作用（governed_external）
 * 二次撤销会**重复发出外部补偿请求**。
 * 本用例断言：单条撤销对已 compensating 的副作用不得重复触发外部补偿。
 */

import { AiToolEffectsService } from './ai-tool-effects.service';

describe('revoke 幂等：单条撤销与批量撤销一致性', () => {
  function make(effect: Record<string, unknown>, externalRevoke: jest.Mock) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(effect),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const svc = new AiToolEffectsService(
      repo as never,
      undefined, // 无本地 revoker
      { revoke: externalRevoke } as never, // 外部补偿执行器
      undefined,
      undefined,
      undefined as never,
    );
    return { svc, repo };
  }

  it('revokeOwned：已 compensating 的外部副作用 → 二次撤销不重复触发外部补偿', async () => {
    const externalRevoke = jest.fn().mockResolvedValue({ ok: true, message: 'compensated' });
    const effect = {
      id: 5,
      userId: '42',
      toolName: 'proxy_update_x',
      resultType: 'proxy_call',
      resultId: 9,
      revokeClass: 'governed_external',
      revokeStatus: 'compensating',
    };
    const { svc } = make(effect, externalRevoke);
    const res = await svc.revokeOwned(5, '42');
    expect(externalRevoke).not.toHaveBeenCalled(); // 已请求过补偿 → 不再重复触发
    expect(res?.revoked).toBe(false);
  });

  it('revoke（管理端）：已 compensating → 同样不重复触发外部补偿', async () => {
    const externalRevoke = jest.fn().mockResolvedValue({ ok: true, message: 'compensated' });
    const effect = {
      id: 6,
      userId: '1',
      toolName: 'proxy_update_y',
      resultType: 'proxy_call',
      resultId: 7,
      revokeClass: 'governed_external',
      revokeStatus: 'compensating',
    };
    const { svc } = make(effect, externalRevoke);
    const res = await svc.revoke(6);
    expect(externalRevoke).not.toHaveBeenCalled();
    expect(res?.revoked).toBe(false);
  });

  it('revokeOwned：已 revoked 的副作用 → 幂等成功（revoked:true + skipped，不再触发）', async () => {
    const externalRevoke = jest.fn();
    const effect = {
      id: 7,
      userId: '42',
      toolName: 'create_event',
      resultType: 'event',
      resultId: 11,
      revokeClass: 'local_compensate',
      revokeStatus: 'revoked',
    };
    const { svc } = make(effect, externalRevoke);
    const res = await svc.revokeOwned(7, '42');
    // 终态已达成 → 幂等成功；skipped 标记不重复触发
    expect(res?.revoked).toBe(true);
    expect(res?.skipped).toBe(true);
    expect(res?.reason).toBe('already_revoked');
    expect(externalRevoke).not.toHaveBeenCalled();
  });
});
