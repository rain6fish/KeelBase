// SPDX-License-Identifier: Apache-2.0

import { notExecutedReleasesHold } from './target-status';
import { declaredDedup } from './tool-dedup';

/**
 * R-9: the three `dedup` values, and what each licenses. This file pins the vocabulary itself; the
 * reconcile path's cases pin that the service consults it.
 *
 * - `yes` — the target drops a repeat of the same key, so a weak reading may release.
 * - `no` — it does not; a weak reading holds.
 * - `unknown` / no declaration — nobody told us; read like `no`, never like `yes`.
 *
 * A receipt releases on any of them: it answers the release question itself.
 *
 * R-9：`dedup` 的三个取值，各授权什么。本文件钉住词表本身；对账路径的用例钉住服务确实按它行事。
 *
 * - `yes` —— 目标会丢掉同一个键的重复，故弱读数可以释放。
 * - `no` —— 不会；弱读数留滞。
 * - `unknown` / 未声明 —— 没人告诉过我们；按 `no` 读，绝不按 `yes` 读。
 *
 * 收据对三者都释放：它回答的正是释放本身要问的问题。
 */
describe('R-9 dedup declaration', () => {
  it('缺席或未声明 ⇒ unknown（不是更弱的 yes）', () => {
    expect(declaredDedup(undefined)).toBe('unknown');
    expect(declaredDedup({})).toBe('unknown');
    expect(declaredDedup({ capabilities: {} })).toBe('unknown');
    expect(declaredDedup({ capabilities: { dedup: 'yes' } })).toBe('yes');
    expect(declaredDedup({ capabilities: { dedup: 'no' } })).toBe('no');
  });

  it('receipt 对任何声明都释放；弱读数只有 dedup=yes 才释放', () => {
    // A receipt settles the release question itself.
    // 收据本身回答释放要问的问题。
    expect(notExecutedReleasesHold('receipt', 'yes')).toBe(true);
    expect(notExecutedReleasesHold('receipt', 'no')).toBe(true);
    expect(notExecutedReleasesHold('receipt', 'unknown')).toBe(true);

    // A current-state sample says only "not there now".
    // 当前状态采样只说了「现在不在」。
    expect(notExecutedReleasesHold('current_state', 'yes')).toBe(true);
    expect(notExecutedReleasesHold('current_state', 'no')).toBe(false);
    expect(notExecutedReleasesHold('current_state', 'unknown')).toBe(false);

    // An undeclared basis is not stronger than a weak one.
    // 未声明种类不比弱读数更强。
    expect(notExecutedReleasesHold(null, 'yes')).toBe(true);
    expect(notExecutedReleasesHold(null, 'no')).toBe(false);
    expect(notExecutedReleasesHold(null, 'unknown')).toBe(false);
  });
});
