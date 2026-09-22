// SPDX-License-Identifier: Apache-2.0

import { paginated } from './paginated';

/**
 * 分页响应的唯一定义（见 paginated.ts 的说明）。这里钉住 `totalPages` 的算法——它是三种形状里
 * 唯一「算出来的」字段，也最容易在别处被重新手写成另一种口径。
 */
describe('paginated()：分页响应的唯一定义', () => {
  it('按 total / limit 算 totalPages，并原样带上入参', () => {
    expect(paginated(['a', 'b'], 5, 2, 2)).toEqual({
      items: ['a', 'b'],
      total: 5,
      page: 2,
      limit: 2,
      totalPages: 3,
    });
  });

  it('整除时不多算一页', () => {
    expect(paginated([], 40, 1, 20).totalPages).toBe(2);
  });

  it('空结果集 totalPages 为 0', () => {
    expect(paginated([], 0, 1, 20).totalPages).toBe(0);
  });
});
