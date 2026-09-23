// SPDX-License-Identifier: Apache-2.0

import {
  EXECUTION_LEASE_MS,
  ExecutionAxisRow,
  deriveExecutionState,
  isExecutionClaimable,
} from './execution-state';

/**
 * P2 审批执行轴的纯推导。这里是「批准 ≠ 执行成功」的判据单源：治理端审批列表与本人视图都调它，
 * 所以边界（非 approved / 租约内外 / 崩溃无结果）必须逐条钉住。
 */
describe('deriveExecutionState（P2 审批执行轴）', () => {
  const NOW = 1_700_000_000_000;
  const row = (o: Partial<ExecutionAxisRow>): ExecutionAxisRow => ({ status: 'approved', ...o });

  it('非 approved → null（未批准 / 已拒绝 / 已超时的确认不存在执行维度）', () => {
    for (const status of ['pending', 'declined', 'timeout']) {
      expect(deriveExecutionState(row({ status }), NOW)).toBeNull();
      expect(isExecutionClaimable(row({ status }), NOW)).toBe(false);
    }
  });

  it('executedAt 有值 → succeeded（哪怕曾有失败记录，成功即终局）', () => {
    expect(
      deriveExecutionState(row({ executedAt: new Date(NOW - 1000), executionError: 'old' }), NOW),
    ).toBe('succeeded');
    expect(isExecutionClaimable(row({ executedAt: new Date(NOW - 1000) }), NOW)).toBe(false);
  });

  it('从未认领 → not_started，且可执行 / 可重试', () => {
    expect(deriveExecutionState(row({}), NOW)).toBe('not_started');
    expect(isExecutionClaimable(row({}), NOW)).toBe(true);
  });

  it('认领在租约内 → running；超过租约 → failed（**崩溃/挂起无结果也如实报 failed**）', () => {
    const fresh = row({ executionClaimedAt: new Date(NOW - 1000) });
    expect(deriveExecutionState(fresh, NOW)).toBe('running');
    expect(isExecutionClaimable(fresh, NOW)).toBe(false); // 可能正在执行 → 不许重试撞车

    // 无错误记录（进程被杀 / 挂起）—— 我们并不知道结果，只能用租约过期表达「未完成」
    const stale = row({ executionClaimedAt: new Date(NOW - EXECUTION_LEASE_MS - 1) });
    expect(deriveExecutionState(stale, NOW)).toBe('failed');
    expect(isExecutionClaimable(stale, NOW)).toBe(true);

    // 有错误记录：与无记录同报 failed，区别在 executionError 是否有值（UI 据此措辞）
    const errored = row({
      executionClaimedAt: new Date(NOW - EXECUTION_LEASE_MS - 1),
      executionError: '目标系统不可达',
    });
    expect(deriveExecutionState(errored, NOW)).toBe('failed');
    expect(isExecutionClaimable(errored, NOW)).toBe(true);
  });

  it('租约边界：恰好到期即算「未完成」（可重试）；严格小于租约才算 running', () => {
    // 判据是 `now - claimed < LEASE`：恰好等于租约时租约已完整走完，按 failed 对待（于是可重试）。
    expect(
      deriveExecutionState(row({ executionClaimedAt: new Date(NOW - EXECUTION_LEASE_MS) }), NOW),
    ).toBe('failed');
    expect(
      deriveExecutionState(row({ executionClaimedAt: new Date(NOW - EXECUTION_LEASE_MS + 1) }), NOW),
    ).toBe('running');
  });
});
