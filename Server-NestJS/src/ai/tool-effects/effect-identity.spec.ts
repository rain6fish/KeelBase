// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'crypto';
import { judgeEffectIdentity } from './effect-identity';

/**
 * REV-6 — the identity verdict must have a **third state**, and it must carry the reason.
 *
 * Today the only identity reading is the boolean `identity_incomplete`, so a member nobody captured
 * reads exactly like a member whose change was captured and matched. The roadmap's criterion is not
 * "make the identity whole" — it is "carry the capture status into the verdict": beside `complete`
 * and `disputed` there must be `incomparable`, and an incomparable member must never default to
 * `complete`.
 *
 * The forbidden shortcut is backfilling a placeholder (`''`, `'null'`, `hash('')`, a constant): every
 * uncaptured row would then share one indexable identity, every reverse index would collide, and the
 * gate would eventually be switched off as noise. `null` is the one value a reader can *explicitly*
 * exclude; a placeholder cannot be excluded because it looks like data.
 *
 * These assertions are red against the code before this slice: the module did not exist.
 *
 * REV-6 —— 判定必须有**第三态**，且要携带理由。
 *
 * 今天唯一的身份读数是布尔 `identity_incomplete`，于是「没人捕获过的成员」与「捕获到且一致的成员」
 * 读起来一模一样。roadmap 的判据不是「把身份补全」，而是「让判定携带捕获状态」：`complete` / `disputed`
 * 之外必须有 `incomparable`，且不可比成员**不得**默认落进 `complete`。
 *
 * 被禁止的捷径是占位回填（`''`、`'null'`、`hash('')`、常量）：所有未捕获行会共享一个身份、反向索引
 * 全部碰撞，闸门最终被当噪音关掉。`null` 是读者唯一能**显式排除**的值；占位值看着像数据，排不掉。
 *
 * 这些断言对本切片之前的代码为红：模块并不存在。
 */
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('REV-6 effect identity: a third state, carried with its reason', () => {
  it('uncaptured ⇒ incomparable (never complete), with an explicit reason', () => {
    const verdict = judgeEffectIdentity([{ id: 1 }, { id: 2 }]);

    expect(verdict.state).toBe('incomparable');
    expect(verdict.members.map((m) => m.reason)).toEqual(['not_captured', 'not_captured']);
  });

  it('captured on both sides and identical ⇒ complete', () => {
    const verdict = judgeEffectIdentity([
      { id: 1, beforeSnapshot: null, afterSnapshot: '{"id":7,"title":"P"}' },
      { id: 2, beforeSnapshot: null, afterSnapshot: '{"title":"P","id":7}' },
    ]);

    expect(verdict.state).toBe('complete');
    expect(verdict.members.map((m) => m.reason)).toEqual([undefined, undefined]);
  });

  it('captured on both sides and different ⇒ disputed, naming the differing field', () => {
    const verdict = judgeEffectIdentity([
      { id: 1, beforeSnapshot: null, afterSnapshot: '{"id":7,"title":"P"}' },
      { id: 2, beforeSnapshot: null, afterSnapshot: '{"id":7,"title":"Q"}' },
    ]);

    expect(verdict.state).toBe('disputed');
    if (verdict.state !== 'disputed') throw new Error(`expected disputed, got ${verdict.state}`);
    expect(verdict.differences).toEqual(['after.title']);
  });

  it('only one side captured ⇒ incomparable with `after_missing`, not complete', () => {
    const verdict = judgeEffectIdentity([
      { id: 1, beforeSnapshot: '{"id":7,"title":"old"}', afterSnapshot: null },
    ]);

    expect(verdict.state).toBe('incomparable');
    expect(verdict.members[0].reason).toBe('after_missing');
  });

  it('a snapshot that carries nothing ⇒ `empty_snapshot`, not a comparable identity', () => {
    const verdict = judgeEffectIdentity([
      { id: 1, beforeSnapshot: null, afterSnapshot: '{}' },
      { id: 2, beforeSnapshot: null, afterSnapshot: '   ' },
    ]);

    expect(verdict.state).toBe('incomparable');
    expect(verdict.members.map((m) => m.reason)).toEqual(['empty_snapshot', 'empty_snapshot']);
  });

  it('a snapshot that cannot be parsed ⇒ `unparsable` (a fault, not silent content)', () => {
    const verdict = judgeEffectIdentity([
      { id: 1, beforeSnapshot: null, afterSnapshot: '{not json' },
    ]);

    expect(verdict.state).toBe('incomparable');
    expect(verdict.members[0].reason).toBe('unparsable');
  });

  it('one comparable member among incomparable ones ⇒ the whole verdict is incomparable', () => {
    const verdict = judgeEffectIdentity([
      { id: 1, beforeSnapshot: null, afterSnapshot: '{"id":7,"title":"P"}' },
      { id: 2 },
    ]);

    expect(verdict.state).toBe('incomparable');
    expect(verdict.members.map((m) => m.reason)).toEqual([undefined, 'not_captured']);
  });

  it('a lone comparable member ⇒ complete (nothing to disagree with)', () => {
    const verdict = judgeEffectIdentity([
      { id: 1, beforeSnapshot: null, afterSnapshot: '{"id":7,"title":"P"}' },
    ]);

    expect(verdict.state).toBe('complete');
  });

  it('**no placeholder backfill**: uncaptured members carry `null`, never a shared constant', () => {
    const verdict = judgeEffectIdentity([{ id: 1 }, { id: 2 }]);

    expect(verdict.members.map((m) => m.change)).toEqual([null, null]);
    // The dangerous shapes: a value that looks like data, so no reader can exclude it.
    for (const placeholder of ['', 'null', '{}', 'unknown', 'n/a', sha256('')]) {
      expect(verdict.members.map((m) => m.change)).not.toContain(placeholder);
    }
    // Two uncaptured rows must not become one shared *identity*. `null` is the sentinel a reader
    // excludes explicitly; that is exactly why it is allowed and a constant is not.
    expect(new Set(verdict.members.map((m) => m.change))).toEqual(new Set([null]));
  });
});
