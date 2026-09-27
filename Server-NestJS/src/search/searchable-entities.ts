// SPDX-License-Identifier: Apache-2.0

import type { DataSource, EntityMetadata } from 'typeorm';
import { pickOwnerColumn } from '../common/utils/entity-metadata';

/**
 * Which generated modules global search may look into, and which of their columns it may match.
 *
 * The declarations arrive from `.keelbase/manifest.json` (`searchableModules`), written there by the
 * generator from each module's spec — so a module generated tomorrow is searchable **by
 * construction**, with no hand-maintained registry and no generator insertion into hand-written
 * source.
 *
 * The columns are **declared, not derived**, and that is the load-bearing choice here. The obvious
 * alternative — ask the entity's column metadata what type each column is, and match the text ones —
 * does not work on this repo's driver: a plain `@Column({ length: 200 })` reports *no type at all*,
 * so a search built that way matches nothing while its mocked tests stay green. A declaration cannot
 * drift that way, because the generator wrote it from the same spec that wrote the entity.
 *
 * 全局搜索可以看向哪些生成模块、以及可以匹配它们的哪些列。
 *
 * 声明来自 `.keelbase/manifest.json`（`searchableModules`），由生成器按各模块的 spec 写入 —— 故
 * **明天生成的模块由构造就可搜**，不需要手工维护的注册表，也不需要生成器往手写源码里插行。
 *
 * 列是**由声明来、不是推导来**，而这是承重的选择。那个显然的替代 —— 问实体的列元数据「你是什么类型」、
 * 匹配其中的文本列 —— 在本仓的驱动上**根本行不通**：一个普通的 `@Column({ length: 200 })` **不报任何
 * 类型**，照它做出来的搜索什么也匹配不到，而 mock 掉的测试照样全绿。声明不会这样漂，因为它是生成器从
 * 「写实体用的同一份 spec」里写出来的。
 */

/** One module's declaration: its plural name and the columns search may match. */
/* 一个模块的声明：它的复数名，以及搜索可以匹配的列。 */
export interface SearchableDeclaration {
  module: string;
  fields: string[];
}

/** A module global search can query, with the columns it is allowed to touch. */
/* 全局搜索可以查询的模块，以及它被允许触碰的列。 */
export interface SearchableTarget {
  /** The module's plural name, as the manifest calls it and the table is named. */
  /* 模块的复数名 —— 清单这么叫它，表也叫这个名字。 */
  module: string;
  /** The entity class, so a repository can be obtained without guessing a table name. */
  /* 实体类，以便不必靠猜表名就能取到仓储。 */
  entity: EntityMetadata;
  /** The column that ties a row to its owner; search never runs without one. */
  /* 把行绑到其归属者的列；没有它搜索根本不跑。 */
  ownerColumn: string;
  /** Declared columns matched by the keyword, in declaration order. Never empty. */
  /* 参与关键词匹配的声明列，按声明顺序。绝不为空。 */
  textColumns: string[];
  /**
   * The primary key, used to order results.
   *
   * Ordered by the entity's own primary key rather than a hardcoded `id`: paging needs a **stable**
   * order, and a query that names a column the table does not have fails the whole request — for
   * every module, since the buckets are awaited together.
   *
   * 主键，用来给结果排序。
   *
   * 按实体自己的主键排，而不是写死 `id`：翻页需要**稳定**顺序，而查询点名一个表里没有的列会让整个
   * 请求失败 —— 而且是每一个模块，因为这些桶是一起等的。
   */
  orderColumn: string;
}

/**
 * Resolve declarations into queryable targets, dropping any that cannot be searched safely.
 *
 * A module is dropped when the running process has no entity for it (deleted, or not registered in
 * this build), when it has no ownership column, when it has no primary key to order by, or when
 * **none** of its declared columns exist on the entity. Every one of those is an ordinary outcome for
 * a file that a hand edit can reach, and none is an error — but each of them would otherwise become a
 * failed query, so dropping is the only fail-closed option that also keeps the rest of the search
 * working.
 *
 * 把声明解析成可查询的目标，丢掉任何无法安全搜索的。
 *
 * 当运行进程里没有该模块的实体（已删除、或这次构建没注册它）、它没有归属列、没有可用于排序的主键、
 * 或它声明的列在实体上**一个都不存在**时，模块被丢弃。对一份手改得着的文件来说，每一种都是寻常结果、
 * 都不是错误 —— 但每一种若不处理都会变成一次失败的查询，故丢弃是唯一既 fail-closed、又能让搜索其余
 * 部分照常工作的选择。
 */
export function resolveSearchableTargets(
  dataSource: DataSource,
  declarations: SearchableDeclaration[],
): SearchableTarget[] {
  const byTable = new Map(dataSource.entityMetadatas.map((m) => [m.tableName, m]));
  const targets: SearchableTarget[] = [];

  for (const { module, fields } of declarations) {
    const entity = byTable.get(module);
    if (!entity) continue;

    const ownerColumn = pickOwnerColumn(entity);
    if (!ownerColumn) continue;

    const orderColumn = entity.primaryColumns[0]?.propertyName;
    if (!orderColumn) continue;

    const columns = new Set(entity.columns.map((c) => c.propertyName));
    const textColumns = fields.filter((f) => columns.has(f));
    if (textColumns.length === 0) continue;

    targets.push({ module, entity, ownerColumn, textColumns, orderColumn });
  }

  return targets;
}
