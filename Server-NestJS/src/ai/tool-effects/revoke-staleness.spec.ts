// SPDX-License-Identifier: Apache-2.0

import { revokeAge, revokeWindow, DEFAULT_REVOKE_STALE_MINUTES } from './revoke-staleness';

/**
 * REV-2 判据的边界情况。三处「不知道就说不知道」是重点：
 * 非 compensating 不给年龄、旧行（无请求时刻）不凭猜测判陈旧、时钟回拨不给负数年龄。
 */
describe('revokeAge（REV-2 compensating 的年龄与陈旧度）', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);

  it('非 compensating：不给年龄、不判陈旧（revoked 之后没有「挂了多久」可言）', () => {
    for (const status of ['revoked', 'revoke_failed', null, undefined]) {
      expect(revokeAge(status, minutesAgo(999), now)).toEqual({
        pending: false,
        ageMinutes: null,
        stale: false,
      });
    }
  });

  it('compensating + 超过阈值 → 陈旧，并给出年龄', () => {
    const age = revokeAge('compensating', minutesAgo(121), now, 60);
    expect(age.pending).toBe(true);
    expect(age.ageMinutes).toBe(121);
    expect(age.stale).toBe(true);
  });

  it('compensating + 阈值内 → 未陈旧', () => {
    const age = revokeAge('compensating', minutesAgo(59), now, 60);
    expect(age).toMatchObject({ pending: true, ageMinutes: 59, stale: false });
  });

  it('恰好等于阈值即算陈旧（>= 而非 >）', () => {
    expect(revokeAge('compensating', minutesAgo(60), now, 60).stale).toBe(true);
  });

  it('引入本列之前的行（请求时刻缺失/非法）→ pending 但年龄未知，不凭猜测判陈旧', () => {
    for (const requestedAt of [null, undefined, '', 'not-a-date']) {
      expect(revokeAge('compensating', requestedAt, now, 1)).toEqual({
        pending: true,
        ageMinutes: null,
        stale: false,
      });
    }
  });

  it('时钟回拨（请求时刻在未来）→ 年龄取 0，不给负数', () => {
    expect(revokeAge('compensating', minutesAgo(-30), now, 60)).toMatchObject({
      ageMinutes: 0,
      stale: false,
    });
  });

  it('阈值非法（0 / 负 / NaN）→ 回落到默认阈值，而不是「全都算陈旧」', () => {
    for (const bad of [0, -5, Number.NaN]) {
      const age = revokeAge('compensating', minutesAgo(10), now, bad);
      expect(age.ageMinutes).toBe(10);
      expect(age.stale).toBe(10 >= DEFAULT_REVOKE_STALE_MINUTES);
    }
  });

  it('接受 ISO 字符串形式的时间戳（服务端从列读出后可能已是字符串）', () => {
    expect(revokeAge('compensating', minutesAgo(90).toISOString(), now, 60)).toMatchObject({
      ageMinutes: 90,
      stale: true,
    });
  });
});

/**
 * REV-2 细化：同一条 `compensating` 的两个窗口 —— 「可能根本没到达」（无确认）与「确实到达了但没回音」（有确认）。
 * 此前两者读数完全相同，聚合视图因此分不出「进程死在外呼中途」与「对方还没给终态」。
 */
describe('revokeWindow（REV-2 细化：compensating 的两个窗口）', () => {
  const ack = new Date('2026-09-24T11:00:00Z');

  it('非 compensating → 没有窗口可言（还没请求，或已了结）', () => {
    for (const status of ['revoked', 'revoke_failed', null, undefined]) {
      expect(revokeWindow(status, ack)).toBeNull();
    }
  });

  it('compensating + 无确认 → unacknowledged（可能根本没到达外部系统）', () => {
    for (const absent of [null, undefined, '']) {
      expect(revokeWindow('compensating', absent)).toBe('unacknowledged');
    }
  });

  it('compensating + 有确认 → awaiting_target（确实到达了，只是没给终态）', () => {
    expect(revokeWindow('compensating', ack)).toBe('awaiting_target');
    expect(revokeWindow('compensating', ack.toISOString())).toBe('awaiting_target');
  });

  it('确认时刻非法 → 视作**无到达凭据**，不把坏输入读成「确实到达了」', () => {
    for (const bad of ['not-a-date', 'NaN']) {
      expect(revokeWindow('compensating', bad)).toBe('unacknowledged');
    }
  });
});
