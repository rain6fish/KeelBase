// SPDX-License-Identifier: Apache-2.0

/**
 * 分页响应的**唯一定义**。
 *
 * 为什么要有这个文件：分页响应此前**没有真源**——20 处返回点长出了三种形状（`{items,total}` ·
 * 再加 `page,limit` · 再加 `totalPages`），而 wire 契约里**没有分页对象**，所以没有任何东西拦着它们
 * 继续分叉。每新增一个 list 端点，就多掷一次骰子。
 *
 * 定 `Paginated<T>`（含 `totalPages`）为准：它是三种形状里**唯一的超集**，所以把其余端点收敛过来是
 * **纯加性**的——只补字段、不删字段，消费方一处都不用改就能继续工作。
 *
 * ⚠ **不适用于「封顶列表」**：有些 `{items,total}` 端点其实不是分页（签名没有 `page`/`limit`，内部是
 * 硬编码 `take: N`，如 `crm/pm` 的 `listTasks`）。那种返回里 `total` 是**全量计数**而 `items` 是**截断
 * 后的**，给它补 `page/limit/totalPages` 等于凭空造出一套不存在的分页语义。**只在真有分页的地方用它。**
 *
 * 为什么不在 `specs/protocol`：wire registry 装的是治理/信任/应用契约对象，分页是**通用应用关切**；
 * 把它冻进协议层会把协议撑厚（`docs/module-protocol.md` §5 的薄度纪律）。
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 组装分页响应。调用方须保证 `limit >= 1`（各端点在入口处已钳制），否则 `totalPages` 会是 `Infinity`，
 * 而 `Infinity` 经 JSON 序列化会变成 `null`——那比少一个字段更难查。
 */
export function paginated<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}
