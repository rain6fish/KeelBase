// SPDX-License-Identifier: Apache-2.0

/**
 * 导航单源守卫（P0）
 *
 * `AiService.detectNavigation` 的「词 → 页面键」表（`NAV_KEYWORDS`）已与 `PAGE_ROUTES` 同文件，
 * 但仍可能写错键：键不存在时 `detectNavigation` 会**静默跳过**（不报错、只是不跳转）——正是本项目
 * 最忌讳的那类失败。本守卫把「键的闭包」钉在 CI 上，键写错即红。
 */

import { NAV_KEYWORDS, PAGE_ROUTES } from './tools/navigate-page.tool';

describe('导航单源守卫（NAV_KEYWORDS ⊆ PAGE_ROUTES）', () => {
  it('关键词表里每个页面键都存在于 PAGE_ROUTES', () => {
    const missing = NAV_KEYWORDS.filter((e) => !(e.page in PAGE_ROUTES)).map((e) => e.page);
    expect(missing).toEqual([]);
  });

  it('页面键唯一——同一页只由一组词指向（重复即顺序敏感的隐歧义）', () => {
    const pages = NAV_KEYWORDS.map((e) => e.page);
    expect(new Set(pages).size).toBe(pages.length);
  });

  it('每组词都非空（空词组 = 永不命中的死配置）', () => {
    const empty = NAV_KEYWORDS.filter((e) => e.keywords.length === 0).map((e) => e.page);
    expect(empty).toEqual([]);
  });
});
