// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { DROP_ID_CAP, capIds, idsMissingFrom, summarizeIds } from './id-set';

/**
 * The digest is a **published** formula: a third party recomputes it over what they can enumerate.
 * These cases pin the formula itself, so changing it cannot pass silently — a changed formula would
 * make every honest comparison disagree.
 *
 * 摘要是**公开的**算法：第三方会用它对自己枚举到的结果重算。下面几条钉的是算法本身，于是改动它
 * 不会悄悄通过 —— 换了算法，每一次诚实的比对都会不一致。
 */
describe('id-set：成员性指纹', () => {
  const digestOf = (ids: number[]) =>
    createHash('sha256').update([...ids].sort((a, b) => a - b).join(',')).digest('hex').slice(0, 16);

  it('空集的摘要是空串的 sha256 前缀（文档里写死的那一个）', () => {
    expect(summarizeIds([]).digest).toBe('e3b0c44298fc1c14');
    expect(summarizeIds([])).toEqual({ min: null, max: null, count: 0, digest: 'e3b0c44298fc1c14' });
  });

  it('摘要与顺序无关（按 id 升序连接后取哈希）', () => {
    expect(summarizeIds([3, 1, 2]).digest).toBe(summarizeIds([1, 2, 3]).digest);
    expect(summarizeIds([1, 2, 3]).digest).toBe(digestOf([1, 2, 3]));
  });

  it('min/max/count 取自集合本身', () => {
    expect(summarizeIds([9, 4, 12])).toMatchObject({ min: 4, max: 12, count: 3 });
  });

  it('两个成员不同的集合指纹不同 —— 这正是它能当判据的原因', () => {
    expect(summarizeIds([1, 2, 3]).digest).not.toBe(summarizeIds([1, 2]).digest);
  });

  it('差额清单封顶在 200，而 count/digest 仍精确', () => {
    const ids = Array.from({ length: DROP_ID_CAP + 5 }, (_, i) => i + 1);
    const listed = capIds(ids);
    expect(listed.ids).toHaveLength(DROP_ID_CAP);
    expect(listed.truncated).toBe(true);
    expect(summarizeIds(ids).count).toBe(DROP_ID_CAP + 5);
    expect(summarizeIds(ids).digest).toBe(digestOf(ids));
  });

  it('未超上限时不报 truncated', () => {
    expect(capIds([1, 2])).toEqual({ ids: [1, 2], truncated: false });
  });

  it('idsMissingFrom 保留 all 的顺序，只剔除 exclude 里有的', () => {
    expect(idsMissingFrom([5, 1, 9, 2], new Set([1, 9]))).toEqual([5, 2]);
  });
});
