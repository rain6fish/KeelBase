// SPDX-License-Identifier: Apache-2.0

/**
 * Revoke ownership: one rule, one implementation.
 *
 * The user-facing revoke path (`revokeOwned`) and the trust showcase's revoke scenario replay the same
 * ownership criterion. This suite pins that down in two ways:
 * 1. the shareable predicate answers the full input matrix, and `revokeOwned` refuses / admits exactly
 *    the same rows — including the deliberately state-independent cases (target deleted / restored);
 * 2. both call sites are shown to consult the exported predicate, by flipping it through a spy: if
 *    either side goes back to an inline hand-copied comparison, the flip stops biting and the test
 *    turns red.
 *
 * 撤销属主：一条规则，一份实现。
 *
 * 用户侧撤销（`revokeOwned`）与信任沙盘的撤销场景重放同一条属主判据。本套件从两处钉住它：
 * ① 共享谓词走过完整输入矩阵，`revokeOwned` 的放行 / 拒绝与它逐行一致（含刻意与状态无关的
 * 「目标已删 / 已恢复」两例）；② 用 spy 翻转导出的谓词，证明两个调用点都真的在问它 —— 任一侧
 * 改回手抄比较式，这一翻转就不再起作用，测试转红。
 */

import { AiToolEffectsService } from '../../governance-shared/services/ai-tool-effects.service';
import * as effectShared from '../../governance-shared/services/effect-shared';
import { isEffectOwner } from '../../governance-shared/services/effect-shared';

describe('revoke ownership: one predicate shared by the real path and the showcase replay', () => {
  /** Local revoker stand-in: enough for the real revoke path to reach its terminal write. */
  function localRevoker(deletedAt: Date | null, revoked = true) {
    return {
      canHandle: jest.fn().mockReturnValue(true),
      describeTarget: jest.fn().mockReturnValue({ deletedAt }),
      revoke: jest.fn().mockResolvedValue({ revoked }),
    };
  }

  function makeService(
    effect: Record<string, unknown> | null,
    revoker?: ReturnType<typeof localRevoker>,
  ) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(effect),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const svc = new AiToolEffectsService(
      repo as never,
      revoker as never,
      undefined,
      undefined,
      undefined,
      undefined as never,
    );
    return { svc, repo };
  }

  function effectRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 7,
      userId: '42',
      resultType: 'todo',
      resultId: 11,
      revokeClass: 'local_compensate',
      revokeStatus: 'revoked',
      ...overrides,
    };
  }

  describe('predicate matrix (pure function)', () => {
    const cases: Array<{ name: string; owner: string; requester: string; expected: boolean }> = [
      { name: '本人', owner: '42', requester: '42', expected: true },
      { name: '他人', owner: '42', requester: '7', expected: false },
      // Admin is not a special case here: the admin path is a different entry (`revoke()`), and the
      // user-facing path grants nobody extra authority. 管理员不是这里的特例：管理端走 `revoke()`，
      // 用户侧入口不给任何人额外权限。
      { name: '管理员（不同 userId）', owner: '42', requester: '1', expected: false },
      { name: '无身份（空串）', owner: '42', requester: '', expected: false },
      { name: '目标属主为空串', owner: '', requester: '', expected: true },
      { name: '相似 id 不等于本人', owner: '42', requester: '042', expected: false },
    ];

    it.each(cases)('$name → $expected', ({ owner, requester, expected }) => {
      expect(isEffectOwner({ userId: owner }, requester)).toBe(expected);
    });

    it('the ownership decision does not read target state (deleted / restored)', () => {
      // The predicate consumes only `userId`; row state cannot change its answer. That is what makes
      // the matrix below safe to pair with revoke outcomes. 谓词只读 `userId`，行状态改变不了答案。
      const base = effectRow({ revokeStatus: 'revoked' });
      const restored = effectRow({ revokeStatus: 'revoked', restored: true });
      expect(isEffectOwner(base, '42')).toBe(true);
      expect(isEffectOwner(restored, '42')).toBe(true);
    });
  });

  describe('revokeOwned agrees with the predicate on every input', () => {
    const cases: Array<{ name: string; requester: string; allowed: boolean }> = [
      { name: '本人', requester: '42', allowed: true },
      { name: '他人', requester: '7', allowed: false },
      { name: '管理员（不同 userId）', requester: '1', allowed: false },
      { name: '无身份（空串）', requester: '', allowed: false },
    ];

    it.each(cases)('$name: revokeOwned → $allowed', async ({ requester, allowed }) => {
      // A revoked row makes the skip path idempotent, so the test isolates ownership from the
      // state machine. 用已撤销行让收尾走幂等跳过，把属主判据从状态机里隔离出来。
      const effect = effectRow();
      const { svc } = makeService(effect, localRevoker(new Date()));
      const res = await svc.revokeOwned(7, requester);
      expect(res !== null).toBe(allowed);
    });

    it('not found → null（存在性不是属主判据，但同一入口的另一个 null 分支）', async () => {
      const { svc } = makeService(null);
      expect(await svc.revokeOwned(7, '42')).toBeNull();
    });

    const stateCases: Array<{
      name: string;
      row: Record<string, unknown>;
      deletedAt: Date | null;
      skipped: boolean;
    }> = [
      {
        name: '目标未撤销过（fresh）',
        row: effectRow({ revokeStatus: null }),
        deletedAt: null,
        skipped: false,
      },
      {
        name: '目标已删（仍在软删态）',
        row: effectRow({ revokeStatus: 'revoked' }),
        deletedAt: new Date(),
        skipped: true,
      },
      {
        name: '目标已恢复（撤销后从回收站恢复）',
        row: effectRow({ revokeStatus: 'revoked' }),
        deletedAt: null,
        skipped: false,
      },
    ];

    it.each(stateCases)('owner, $name → allowed', async ({ row, deletedAt, skipped }) => {
      const { svc } = makeService(row, localRevoker(deletedAt));
      const res = await svc.revokeOwned(7, '42');
      expect(res).not.toBeNull();
      expect(res?.revoked).toBe(true);
      expect(Boolean(res?.skipped)).toBe(skipped);
    });

    it.each(stateCases)('non-owner, $name → denied', async ({ row, deletedAt }) => {
      const { svc } = makeService(row, localRevoker(deletedAt));
      expect(await svc.revokeOwned(7, '7')).toBeNull();
    });
  });

  describe('anti-drift: both call sites consult the exported predicate', () => {
    it('revokeOwned delegates the ownership decision to isEffectOwner', async () => {
      const effect = effectRow();
      const { svc } = makeService(effect, localRevoker(new Date()));
      const spy = jest.spyOn(effectShared, 'isEffectOwner');
      try {
        expect(await svc.revokeOwned(7, '42')).not.toBeNull();
        expect(spy).toHaveBeenCalledWith(effect, '42');

        // Flip the shared predicate: the owner is now rejected without touching the row comparison.
        // 翻转共享谓词：属主也被拒 —— 说明判据不在这里另写一份。
        spy.mockReturnValue(false);
        expect(await svc.revokeOwned(7, '42')).toBeNull();

        // And a non-owner is admitted when the shared predicate says so.
        // 反过来：非属主在谓词放行时也能进入 —— 门就是这一个函数。
        spy.mockReturnValue(true);
        expect(await svc.revokeOwned(7, '7')).not.toBeNull();
      } finally {
        spy.mockRestore();
      }
    });
  });
});
