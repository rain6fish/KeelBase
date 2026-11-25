// SPDX-License-Identifier: Apache-2.0

import {
  DEFAULT_CLAIM_DECISION_BOUND_MINUTES,
  claimClocks,
  claimDecisionBoundMinutes,
} from './claim-clocks';

/**
 * R-5: the two clocks, read as pure facts. These cases pin the rule the reader set — an unknown clock
 * never releases — and the key property that makes the queue stable: a re-ask moves freshness only.
 *
 * R-5：两只钟，读成纯粹的事实。这些用例钉住读者定的规则 —— 未知时钟永不释放 —— 以及让队列稳定的那个
 * 关键性质：重问只移动新鲜度。
 */
describe('R-5 claim clocks', () => {
  const claimedAt = new Date('2026-11-01T00:00:00Z');
  // Default in-flight window: the row becomes pending at 01:00.
  const windowMinutes = 60;
  const now = new Date('2026-11-01T04:00:00Z');

  it('不在待裁队列 ⇒ 两只钟都不跑：待裁时刻、年龄、升级全为 null', () => {
    const clocks = claimClocks({
      pendingDecision: false,
      claimedAt,
      windowMinutes,
      freshnessDueAt: new Date('2026-11-01T01:00:00Z'),
      decisionBoundMinutes: DEFAULT_CLAIM_DECISION_BOUND_MINUTES,
      now,
    });

    expect(clocks).toEqual({
      readingStale: false,
      readingStaleSince: null,
      decisionPendingSince: null,
      decisionAgeMinutes: null,
      decisionOverdue: false,
      escalation: null,
    });
  });

  it('决策从窗口关闭那一刻起待裁（claimedAt + window），并给出整分钟年龄', () => {
    const clocks = claimClocks({
      pendingDecision: true,
      claimedAt,
      windowMinutes,
      freshnessDueAt: new Date('2026-11-01T05:00:00Z'),
      decisionBoundMinutes: DEFAULT_CLAIM_DECISION_BOUND_MINUTES,
      now,
    });

    expect(clocks.decisionPendingSince?.toISOString()).toBe('2026-11-01T01:00:00.000Z');
    expect(clocks.decisionAgeMinutes).toBe(180);
    expect(clocks.decisionOverdue).toBe(false);
    expect(clocks.readingStale).toBe(false);
    expect(clocks.escalation).toBeNull();
  });

  it('读数过了新鲜度上限 ⇒ 升级为**重问**，并给出「读数从 X 起陈旧」', () => {
    const clocks = claimClocks({
      pendingDecision: true,
      claimedAt,
      windowMinutes,
      freshnessDueAt: new Date('2026-11-01T02:00:00Z'),
      decisionBoundMinutes: DEFAULT_CLAIM_DECISION_BOUND_MINUTES,
      now,
    });

    expect(clocks.readingStale).toBe(true);
    expect(clocks.readingStaleSince?.toISOString()).toBe('2026-11-01T02:00:00.000Z');
    expect(clocks.escalation).toBe('reask');
    expect(clocks.decisionOverdue).toBe(false);
  });

  it('决策超过决策上限 ⇒ 升级为**人**，即便最新读数刚刚问过', () => {
    const clocks = claimClocks({
      pendingDecision: true,
      claimedAt,
      windowMinutes,
      freshnessDueAt: null,
      decisionBoundMinutes: 120,
      now,
    });

    expect(clocks.readingStale).toBe(false);
    expect(clocks.decisionAgeMinutes).toBe(180);
    expect(clocks.decisionOverdue).toBe(true);
    expect(clocks.escalation).toBe('person');
  });

  it('两只钟都到期 ⇒ 升级为**人**（自动清扫会自己再问，逾期未裁才是要人处理的）', () => {
    const clocks = claimClocks({
      pendingDecision: true,
      claimedAt,
      windowMinutes,
      freshnessDueAt: new Date('2026-11-01T02:00:00Z'),
      decisionBoundMinutes: 120,
      now,
    });

    expect(clocks.readingStale).toBe(true);
    expect(clocks.decisionOverdue).toBe(true);
    expect(clocks.escalation).toBe('person');
  });

  it('**稳定键**：重问刷新新鲜度，决策时刻与年龄一字不动', () => {
    const input = {
      pendingDecision: true,
      claimedAt,
      windowMinutes,
      decisionBoundMinutes: DEFAULT_CLAIM_DECISION_BOUND_MINUTES,
      now,
    };
    const before = claimClocks({ ...input, freshnessDueAt: new Date('2026-11-01T02:00:00Z') });
    // 重问之后，计划的下一次到期被推到未来。
    const after = claimClocks({ ...input, freshnessDueAt: new Date('2026-11-01T08:00:00Z') });

    expect(before.readingStale).toBe(true);
    expect(after.readingStale).toBe(false);
    expect(after.decisionPendingSince).toEqual(before.decisionPendingSince);
    expect(after.decisionAgeMinutes).toBe(before.decisionAgeMinutes);
    expect(after.decisionOverdue).toBe(before.decisionOverdue);
  });

  it('**未知时钟永不释放**：升级取值只有 null / reask / person —— 没有 release', () => {
    const outcomes = [
      claimClocks({ pendingDecision: false, claimedAt, windowMinutes, freshnessDueAt: null, decisionBoundMinutes: 1440, now }),
      claimClocks({ pendingDecision: true, claimedAt, windowMinutes, freshnessDueAt: new Date('2026-11-01T02:00:00Z'), decisionBoundMinutes: 1440, now }),
      claimClocks({ pendingDecision: true, claimedAt, windowMinutes, freshnessDueAt: null, decisionBoundMinutes: 60, now }),
    ].map((c) => c.escalation);

    for (const outcome of outcomes) {
      expect([null, 'reask', 'person']).toContain(outcome);
    }
    expect(outcomes).toEqual([null, 'reask', 'person']);
  });

  it('决策上限的解析：默认值、数字、数字字符串；不可用值回落默认而不是 0', () => {
    expect(claimDecisionBoundMinutes(undefined)).toBe(DEFAULT_CLAIM_DECISION_BOUND_MINUTES);
    expect(claimDecisionBoundMinutes(90)).toBe(90);
    expect(claimDecisionBoundMinutes('90')).toBe(90);
    // 读成 0 会让每条排队行都超期 —— 不可用就是不可用，回落默认。
    expect(claimDecisionBoundMinutes('abc')).toBe(DEFAULT_CLAIM_DECISION_BOUND_MINUTES);
    expect(claimDecisionBoundMinutes(0)).toBe(DEFAULT_CLAIM_DECISION_BOUND_MINUTES);
    expect(claimDecisionBoundMinutes(-5)).toBe(DEFAULT_CLAIM_DECISION_BOUND_MINUTES);
  });
});
