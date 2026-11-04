// SPDX-License-Identifier: Apache-2.0

import {
  AUDIT_LOG_LIST_ORDERING,
  CHAIN_WALK_ORDERING,
  REPORT_ROWS_ORDERING,
} from './ordering';

/**
 * These pin what each read actually applies. If a query's `ORDER BY` changes without the declaration
 * changing with it, the response starts telling readers something false — which is worse than saying
 * nothing, because a reader who is told the order stops checking it.
 *
 * 这些钉住每个读**实际**用的是什么顺序。查询的 `ORDER BY` 改了而声明没跟着改，响应就开始对读者说
 * 假话 —— 那比什么都不说更糟，因为被告知了顺序的读者，就不再去看它了。
 */
describe('ordering：读面的排序声明', () => {
  it('列表：createdAt DESC、接收方可控、以 id 决序、位置**未**被链覆盖', () => {
    expect(AUDIT_LOG_LIST_ORDERING).toEqual({
      field: 'createdAt',
      direction: 'desc',
      controlledBy: 'receiver',
      tiebreak: { field: 'id', direction: 'desc' },
      attested: 'none',
    });
  });

  it('链遍历：id ASC —— 这正是 prevHash 绑定的顺序，故位置被链覆盖', () => {
    expect(CHAIN_WALK_ORDERING).toEqual({
      field: 'id',
      direction: 'asc',
      controlledBy: 'receiver',
      tiebreak: null,
      attested: 'chain-order',
    });
  });

  // 报表的查询只按 createdAt 排，并列无序。声明写 null 而不是抄列表的 tiebreak ——
  // 声明必须描述查询真正执行的东西，否则它是在替一个不存在的保证背书。
  it('报表：createdAt DESC、并列**无序**（查询没有 tie-break，声明也不许有）', () => {
    expect(REPORT_ROWS_ORDERING).toEqual({
      field: 'createdAt',
      direction: 'desc',
      controlledBy: 'receiver',
      tiebreak: null,
      attested: 'none',
    });
  });

  it('每个声明都必须回答「谁控制这个字段」，不许留空', () => {
    for (const d of [AUDIT_LOG_LIST_ORDERING, CHAIN_WALK_ORDERING, REPORT_ROWS_ORDERING]) {
      expect(['receiver', 'producer']).toContain(d.controlledBy);
      expect(['chain-order', 'none']).toContain(d.attested);
    }
  });
});
