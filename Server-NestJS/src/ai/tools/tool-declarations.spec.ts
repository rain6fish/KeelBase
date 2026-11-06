// SPDX-License-Identifier: Apache-2.0

import { resolveCapabilities } from '../interfaces/tool.interface';

/**
 * AW-19: an undeclared tool has declared **nothing**, and `resolveCapabilities` must say so.
 *
 * The failure this guards against is not a crash but a silent promotion: if `resolveCapabilities`
 * filled a missing field with `yes`, every one of the ~60 tools that declares nothing would start
 * being treated as queryable / cancellable / deduplicated without anyone editing a tool. So the
 * default is `unknown` for every field, and the tests below pin it field by field — a `yes` must be
 * earned by a declaration, never inherited from silence. Abortability (AW-18) is resolved by
 * `resolveAbortability` and pinned in `tool-abortability.spec.ts`; this file owns capabilities only.
 *
 * AW-19：未声明的工具**什么也没声明**，`resolveCapabilities` 必须如实这么说。
 *
 * 要防的失败不是崩溃，而是一次**静默提升**：若 `resolveCapabilities` 把缺失字段填成 `yes`，那约六十
 * 个什么都没声明的工具，会在没人改过任何一个工具的情况下，开始被当作可查询 / 可取消 / 可去重。
 * 故每个字段的默认都是 `unknown`，下面的用例逐字段钉住它 —— 一个 `yes` 必须**由声明挣来**，绝不从
 * 沉默继承。可中止性（AW-18）由 `resolveAbortability` 解析、由 `tool-abortability.spec.ts` 钉住；
 * 本文件只负责能力声明。
 */
describe('工具能力声明解析（AW-19）', () => {
  describe('resolveCapabilities', () => {
    it('完全没有 declarations ⇒ 三项全 unknown', () => {
      expect(resolveCapabilities({})).toEqual({
        statusLookup: 'unknown',
        cancellation: 'unknown',
        dedup: 'unknown',
      });
    });

    it('只声明一项 ⇒ 其余仍是 unknown（声明一项不等于声明三项）', () => {
      expect(resolveCapabilities({ capabilities: { statusLookup: 'yes' } })).toEqual({
        statusLookup: 'yes',
        cancellation: 'unknown',
        dedup: 'unknown',
      });
    });

    it('显式 no 与 unknown 各自保留 —— 两者都不读作 yes', () => {
      const caps = resolveCapabilities({
        capabilities: { statusLookup: 'no', cancellation: 'unknown', dedup: 'yes' },
      });
      expect(caps.statusLookup).toBe('no');
      expect(caps.cancellation).toBe('unknown');
      expect(caps.dedup).toBe('yes');
    });

    it('**反向**：只有字面 yes 才算「有该能力」，no / unknown 一律不算', () => {
      const granted = (state: 'yes' | 'no' | 'unknown') =>
        resolveCapabilities({ capabilities: { statusLookup: state } }).statusLookup === 'yes';
      expect(granted('yes')).toBe(true);
      expect(granted('no')).toBe(false);
      expect(granted('unknown')).toBe(false);
    });
  });
});
