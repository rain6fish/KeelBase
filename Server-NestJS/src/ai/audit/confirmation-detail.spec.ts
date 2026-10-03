// SPDX-License-Identifier: Apache-2.0

import { parseConfirmation } from './confirmation-detail';

/**
 * 两种形状都由 `ai.service.ts` 写出、都带 `action: 'tool_confirmation'`：单条（`:1259`）与
 * run 级（`:1103`）。合并前两个消费方各带一份正则，**两份都匹配不上 run 形状**。
 *
 * Both shapes are written by `ai.service.ts` under `action: 'tool_confirmation'`. Before this module
 * existed each consumer carried its own regex and neither matched the run shape.
 */
describe('parseConfirmation（确认决策 detail 的唯一解析）', () => {
  it('单条：拆出工具名 / 参数 / 结果 / trusted', () => {
    expect(parseConfirmation('create_event({"title":"m"}) → approve (trusted)')).toEqual({
      kind: 'tool',
      toolName: 'create_event',
      args: '{"title":"m"}',
      outcome: 'approve',
      trusted: true,
    });
    expect(parseConfirmation('create_todo({"text":"x"}) → decline')).toMatchObject({
      kind: 'tool',
      toolName: 'create_todo',
      outcome: 'decline',
      trusted: false,
    });
  });

  // run 级确认的形状由 `ai.service.ts:1103` 写死为 `run(<token>) <N> items → <outcome>`，token 是
  // `randomUUID()`（含连字符）。旧的两份正则都要求 `)` 紧跟 `→`，故这里一律落进各自的兜底 ⇒ 一次**用户
  // 确实批准**的 run 被报成 `timeout`（合规叙述说「确认超时」、轨迹成 timeout 步）。
  //
  // The run shape carries a UUID token, so the token class must admit hyphens. Both old regexes
  // required `)` immediately followed by `→`, so every run row fell through to a `timeout` fallback.
  it('run 级：认出 `run(<token>) N items → 结果`（旧实现一律答 timeout）', () => {
    expect(parseConfirmation('run(3f2a1c8e-0b7d-4a11-9c3e-2f5b6a7d8e9f) 3 items → approve')).toEqual({
      kind: 'run',
      runId: '3f2a1c8e-0b7d-4a11-9c3e-2f5b6a7d8e9f',
      items: 3,
      outcome: 'approve',
    });
    expect(parseConfirmation('run(abc) 0 items → decline')).toMatchObject({ kind: 'run', items: 0, outcome: 'decline' });
    expect(parseConfirmation('run(abc) 12 items → timeout')).toMatchObject({ kind: 'run', outcome: 'timeout' });
  });

  // R4 高影响动作不走内联确认，而是被**转人工审批**（`ai.service.ts:1187`），该行也在 `tool_confirmation` 下。
  // 它既非批准也非拒绝、更不是超时 —— 旧读法把它塌成 `timeout`，于是合规叙述说「确认超时」而真相是「已转人工审批」。
  //
  // An R4 action is routed to human approval; that row carries the same action, and the old reading
  // collapsed it into `timeout`.
  it('R4 转人工审批：`→ pending_approval` 有它自己的读数，不是 `timeout`', () => {
    expect(parseConfirmation('create_event({"a":1}) → pending_approval')).toEqual({
      kind: 'tool',
      toolName: 'create_event',
      args: '{"a":1}',
      outcome: 'pending_approval',
      trusted: false,
    });
  });

  it('认不出 → null（**不**在这里兜底成 timeout）', () => {
    expect(parseConfirmation('analyze_customer_risk({"id":7})')).toBeNull();
    expect(parseConfirmation('create_event({}) → approve 多了尾巴')).toBeNull();
    expect(parseConfirmation('')).toBeNull();
    expect(parseConfirmation(null)).toBeNull();
    expect(parseConfirmation(undefined)).toBeNull();
  });
});
