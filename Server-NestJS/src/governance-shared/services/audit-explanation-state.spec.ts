// SPDX-License-Identifier: Apache-2.0

import { EXPLANATION_STATES, explainState } from './audit-explanation-state';

/**
 * The cases below pin two things the derivation could get wrong quietly.
 *
 * <p>First, the ordering. An action waiting for a person has not happened yet, so no later fact may
 * speak for it; and a compensation that ran is a later fact than the execution it undid, so the
 * execution may not speak for it. Each of those is one assertion here, and each is a real state an
 * operator would have read backwards.
 *
 * <p>Second, `result_unknown`. A `compensating` effect whose target never answered is the single most
 * misreadable thing in this vocabulary — REV-2 measures exactly that window (`unacknowledged` /
 * `awaiting_target`), and filing it as "compensating" is the same mistake as showing a requested
 * revoke as a recovered business. The two windows are asserted to land on `result_unknown`, and a
 * `compensating` effect with **no** window asserted to land on `compensating`, so the line between
 * them is pinned rather than assumed.
 *
 * <p>Last, reachability walks `EXPLANATION_STATES` so the vocabulary cannot grow a value nothing can
 * produce, and so a value that stops being reachable is noticed here rather than by an operator
 * finding a chip that never lights up.
 *
 * 下列用例钉住两处会**悄悄错掉**的地方：其一**顺序**——还在等人批准的动作尚未发生、后面的任何事实都
 * 不许代表它；跑过的补偿是**晚于**它所撤销的那次执行的事实，故执行不许代表它。其二 **`result_unknown`**
 * ——目标从未回音的 `compensating` 是本词表里最容易被读错的一处：REV-2 量的正是那个窗口，把它归成
 * 「补偿中」与「把撤销被请求显示成业务已恢复」是同一个错。最后**可达性**遍历 `EXPLANATION_STATES`，
 * 使词表长不出**没有输入能产生**的值，也使得某个值不再可达时**在这里**被发现，而不是由操作者遇见一个
 * 永不亮起的标签。
 */
describe('explainState（单事件解释面的那一个状态）', () => {
  it('等人批准压过一切 —— 它尚未发生', () => {
    expect(
      explainState({ confirmationStatus: 'pending', outcome: 'executed', revokeStatus: null }),
    ).toBe('awaiting_confirmation');
    expect(explainState({ confirmationStatus: 'pending_approval', revokeStatus: 'revoked' })).toBe(
      'awaiting_confirmation',
    );
  });

  it('补偿失败是最后的事实 —— 压过 executed', () => {
    expect(explainState({ outcome: 'executed', revokeStatus: 'revoke_failed' })).toBe(
      'compensation_failed',
    );
  });

  it('补偿成功压过 executed（撤销过的不由"执行过"代表）', () => {
    expect(explainState({ outcome: 'executed', revokeStatus: 'revoked' })).toBe(
      'compensation_succeeded',
    );
  });

  it('⚠ 补偿中且目标未回音 ⇒ **结果未知**，不是"进行中"', () => {
    expect(explainState({ revokeStatus: 'compensating', revokeWindow: 'unacknowledged' })).toBe(
      'result_unknown',
    );
    expect(explainState({ revokeStatus: 'compensating', revokeWindow: 'awaiting_target' })).toBe(
      'result_unknown',
    );
  });

  it('补偿中且无窗口（本地那条）⇒ 补偿中 —— 与上一条之间那条线是钉住的', () => {
    expect(explainState({ revokeStatus: 'compensating', revokeWindow: null })).toBe('compensating');
    expect(explainState({ revokeStatus: 'compensating' })).toBe('compensating');
  });

  it('失败：outcome=failed，或只有 isError（outcome 列之前的行）', () => {
    expect(explainState({ outcome: 'failed' })).toBe('failed');
    expect(explainState({ isError: true })).toBe('failed');
    expect(explainState({ isError: 1 })).toBe('failed');
  });

  it('被拒：blocked / refused / declined 三种都算，且不算作失败', () => {
    for (const outcome of ['blocked', 'refused', 'declined']) {
      expect(explainState({ outcome })).toBe('rejected');
    }
  });

  it('其余即执行成功 —— 空输入也给得出答案，不留 undefined', () => {
    expect(explainState({ outcome: 'executed' })).toBe('executed');
    expect(explainState({})).toBe('executed');
  });

  it('可达性：词表里每个值都有输入能产生它（并列出反例输入）', () => {
    const witness: Record<string, Parameters<typeof explainState>[0]> = {
      awaiting_confirmation: { confirmationStatus: 'pending' },
      compensation_failed: { revokeStatus: 'revoke_failed' },
      compensation_succeeded: { revokeStatus: 'revoked' },
      compensating: { revokeStatus: 'compensating' },
      executed: { outcome: 'executed' },
      failed: { outcome: 'failed' },
      rejected: { outcome: 'refused' },
      result_unknown: { revokeStatus: 'compensating', revokeWindow: 'awaiting_target' },
    };
    for (const state of EXPLANATION_STATES) {
      expect(Object.keys(witness)).toContain(state);
      expect(explainState(witness[state])).toBe(state);
    }
    // 词表里没有 witness 覆盖不到的成员（反之亦然）—— 两处一起改，漏一处即红。
    // Nothing in the list lacks a witness, and nothing witnessed is outside the list.
    expect([...EXPLANATION_STATES].sort()).toEqual(Object.keys(witness).sort());
  });
});
