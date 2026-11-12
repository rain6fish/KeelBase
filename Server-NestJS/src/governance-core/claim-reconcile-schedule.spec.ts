// SPDX-License-Identifier: Apache-2.0

import {
  DEFAULT_CLAIM_RECONCILE_BACKOFF_MINUTES,
  DEFAULT_CLAIM_RECONCILE_MAX_ATTEMPTS,
  claimReconcilePlan,
  claimReconcileSchedule,
} from './claim-reconcile-schedule';

/**
 * F-79: the decay schedule that bounds automatic re-asking. Pure functions, so the cases below are
 * the whole story — the sweep and the read surface only feed these the clock, the row and the count.
 *
 * 时刻一律显式传入，故这些用例不依赖真时钟：本文件钉的是「等多久才允许再问」这一条。
 */
const NOW = new Date('2026-11-12T12:00:00.000Z');
const minutesAgo = (m: number): Date => new Date(NOW.getTime() - m * 60_000);
const plusMinutes = (d: Date, m: number): string => new Date(d.getTime() + m * 60_000).toISOString();
const plan = (): ReturnType<typeof claimReconcilePlan> => claimReconcilePlan(undefined, undefined);

describe('F-79 有界自动重问的衰减计划 / the bounded re-ask schedule', () => {
  describe('计划解析', () => {
    it('缺配置 ⇒ 默认 4 次、+1h/+6h/+24h/+72h', () => {
      const p = plan();
      expect(p.maxAttempts).toBe(DEFAULT_CLAIM_RECONCILE_MAX_ATTEMPTS);
      expect(p.maxAttempts).toBe(4);
      expect(p.backoffMinutes).toEqual([...DEFAULT_CLAIM_RECONCILE_BACKOFF_MINUTES]);
      expect(p.backoffMinutes).toEqual([60, 360, 1440, 4320]);
    });

    it('逗号串可配，空白与非法项被丢掉', () => {
      expect(claimReconcilePlan(3, '30, 120 ,abc, 0').backoffMinutes).toEqual([30, 120]);
      expect(claimReconcilePlan(3, '30, 120 ,abc, 0').maxAttempts).toBe(2);
    });

    it('全是非法项 ⇒ 回落到默认表，而不是「0 次」', () => {
      expect(claimReconcilePlan(undefined, 'x,y').backoffMinutes).toEqual([
        ...DEFAULT_CLAIM_RECONCILE_BACKOFF_MINUTES,
      ]);
    });

    it('档位数是次数上限：三步的表 + 6 次 ⇒ 只问三次，不凭空造第四个间隔', () => {
      expect(claimReconcilePlan(6, '60,120,180')).toMatchObject({
        maxAttempts: 3,
        backoffMinutes: [60, 120, 180],
      });
    });

    it('次数非法 ⇒ 回落默认次数（仍受档位数限制）', () => {
      expect(claimReconcilePlan('nope', undefined).maxAttempts).toBe(4);
      expect(claimReconcilePlan(0, undefined).maxAttempts).toBe(4);
      expect(claimReconcilePlan(0, '60,120').maxAttempts).toBe(2);
    });
  });

  describe('到期判读', () => {
    it('从没问过 ⇒ 锚点是 claimedAt：59 分钟未到期，61 分钟到期（第一档 +1h）', () => {
      const early = claimReconcileSchedule(minutesAgo(59), null, 0, plan(), NOW);
      expect(early.due).toBe(false);
      expect(early.nextDueAt?.toISOString()).toBe(plusMinutes(minutesAgo(59), 60));

      const late = claimReconcileSchedule(minutesAgo(61), null, 0, plan(), NOW);
      expect(late.due).toBe(true);
      expect(late.stopped).toBe(false);
    });

    it('问过 1 次 ⇒ 第二档 +6h 从**上一次询问**起算：5 小时未到期，7 小时到期', () => {
      const early = claimReconcileSchedule(minutesAgo(24 * 60), minutesAgo(5 * 60), 1, plan(), NOW);
      expect(early.due).toBe(false);
      expect(early.nextDueAt?.toISOString()).toBe(plusMinutes(minutesAgo(5 * 60), 6 * 60));

      const late = claimReconcileSchedule(minutesAgo(24 * 60), minutesAgo(7 * 60), 1, plan(), NOW);
      expect(late.due).toBe(true);
    });

    it('问过 2 / 3 次 ⇒ 第三档 +24h、第四档 +72h', () => {
      expect(claimReconcileSchedule(minutesAgo(9999), minutesAgo(23 * 60), 2, plan(), NOW).due).toBe(false);
      expect(claimReconcileSchedule(minutesAgo(9999), minutesAgo(25 * 60), 2, plan(), NOW).due).toBe(true);

      expect(claimReconcileSchedule(minutesAgo(99999), minutesAgo(71 * 60), 3, plan(), NOW).due).toBe(false);
      expect(claimReconcileSchedule(minutesAgo(99999), minutesAgo(73 * 60), 3, plan(), NOW).due).toBe(true);
    });

    it('问满 4 次 ⇒ 停止，不再到期（时间过去多久都一样）', () => {
      for (const asked of [4, 5, 9]) {
        const s = claimReconcileSchedule(minutesAgo(10 * 24 * 60), minutesAgo(100 * 24 * 60), asked, plan(), NOW);
        expect(s.stopped).toBe(true);
        expect(s.nextDueAt).toBeNull();
        expect(s.due).toBe(false);
      }
    });

    it('claimedAt 不可读 ⇒ 不排期、不判到期（不猜一个时刻）', () => {
      const s = claimReconcileSchedule(new Date('nope'), null, 0, plan(), NOW);
      expect(s.stopped).toBe(false);
      expect(s.nextDueAt).toBeNull();
      expect(s.due).toBe(false);
    });

    it('负数 / 非整数次数按 0 读，不因此少问一轮', () => {
      const s = claimReconcileSchedule(minutesAgo(61), null, -2, plan(), NOW);
      expect(s.attempts).toBe(0);
      expect(s.due).toBe(true);
    });
  });
});
