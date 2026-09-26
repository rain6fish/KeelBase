// SPDX-License-Identifier: Apache-2.0

import type { DataSource, EntityMetadata } from 'typeorm';
import { pickOwnerColumn } from '../common/utils/entity-metadata';

/**
 * Which generated modules global search may look into, and how far into each.
 *
 * The list of modules arrives from `.keelbase/manifest.json` (`searchableModules`), so a module
 * generated tomorrow is searchable **by construction** — no hand-maintained registry, and no
 * generator insertion into hand-written source. Everything else is derived from the entity itself,
 * which is the only place that cannot drift from what is really in the table.
 *
 * Two things are deliberately *not* derived:
 *
 *   - **Which modules are searchable.** That is a property of the module's spec, so it comes from
 *     the manifest and nowhere else. A module whose spec never said `searchable` is absent from the
 *     file, and absence is not something this code second-guesses.
 *   - **Whether a module qualifies at all.** An entity with no ownership column cannot be narrowed
 *     to the caller, so it is **skipped, not searched**. That is the fail-closed direction: the cost
 *     of a missed hit is a search that returns less, the cost of the other choice is one user
 *     reading another user's rows.
 *
 * 全局搜索可以看向哪些生成模块、以及每个模块里能看多深。
 *
 * 模块清单来自 `.keelbase/manifest.json`（`searchableModules`），故**明天生成的模块由构造就可搜** ——
 * 不需要手工维护的注册表，也不需要生成器往手写源码里插行。其余一切都从实体本身推导，因为那是
 * 唯一不会与表里真实内容漂开的地方。
 *
 * 有两件事是刻意**不**推导的：
 *
 *   - **哪些模块可搜。** 那是模块 spec 的属性，故只从清单来、不从别处来。spec 没声明过 `searchable`
 *     的模块就不在文件里，而「不在」不是这段代码该去二次猜测的东西。
 *   - **模块是否够格。** 没有归属列的实体无法收窄到调用方，故**跳过、不搜**。这是 fail-closed 的方向：
 *     漏掉一次命中的代价是搜索少返回一点，另一种选择的代价是一个用户读到另一个用户的行。
 */

/**
 * Normalised column types a `LIKE` search can run against.
 *
 * These are driver type names, not protocol types: `driver.normalizeType()` is what turns an
 * entity column into the name the database actually uses, and it legitimately differs per driver
 * (`String` is `varchar` on SQLite, `character varying` on Postgres). A column type outside this
 * set is treated as unsearchable rather than coerced — matching an integer or a date with a text
 * pattern is not a feature, it is a silent miss.
 *
 * This set was written against observed output, not assumption: on this codebase's SQLite driver a
 * plain `@Column({ length: 200 })` normalises to `varchar`, while the column metadata's own `type`
 * field is **undefined** for exactly those columns — so reading `type` off the metadata would have
 * produced a search that silently matched nothing.
 *
 * 能跑 `LIKE` 搜索的**归一化**列类型。
 *
 * 这些是驱动类型名、不是协议类型：`driver.normalizeType()` 才把实体列变成数据库真正用的名字，
 * 而它在不同驱动下本就不同（`String` 在 SQLite 是 `varchar`、在 Postgres 是 `character varying`）。
 * 不在此集合内的列类型按**不可搜**处理、不做强转 —— 拿文本模式去匹配整数或日期不是功能，是静默漏掉。
 *
 * 这个集合是对着**实测输出**写的、不是照假设写的：在本仓的 SQLite 驱动下，一个普通的
 * `@Column({ length: 200 })` 归一化为 `varchar`，而这些列的元数据 `type` 字段恰恰是 **undefined** ——
 * 若从元数据上读 `type`，做出来的搜索会静默地什么都匹配不到。
 */
export const TEXT_COLUMN_TYPES = new Set([
  'varchar',
  'character varying',
  'nvarchar',
  'nvarchar2',
  'text',
  'clob',
  'mediumtext',
  'longtext',
  'tinytext',
  'string',
]);

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
  /** Text columns matched by the keyword. Never empty. */
  /* 参与关键词匹配的文本列，绝不为空。 */
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
 * Resolve manifest module names to queryable targets, dropping any that cannot be searched safely.
 *
 * A module is dropped when the running process has no entity for it (deleted, or not registered in
 * this build) or when it has no ownership column. Both are ordinary outcomes — the manifest is a
 * file, and the process is whatever it was built as — so neither is an error.
 *
 * 把清单里的模块名解析成可查询的目标，丢掉任何无法安全搜索的。
 *
 * 当运行进程里没有该模块的实体（已删除、或这次构建没注册它）或它没有归属列时，模块被丢弃。
 * 两者都是寻常结果 —— 清单是个文件、进程是它被构建成的样子 —— 故都不是错误。
 */
export function resolveSearchableTargets(
  dataSource: DataSource,
  modules: string[],
): SearchableTarget[] {
  const byTable = new Map(dataSource.entityMetadatas.map((m) => [m.tableName, m]));
  const targets: SearchableTarget[] = [];

  for (const module of modules) {
    const entity = byTable.get(module);
    if (!entity) continue;

    const ownerColumn = pickOwnerColumn(entity);
    if (!ownerColumn) continue;

    const textColumns = entity.columns
      .filter((c) => TEXT_COLUMN_TYPES.has(dataSource.driver.normalizeType(c)))
      .map((c) => c.propertyName);
    if (textColumns.length === 0) continue;

    const orderColumn = entity.primaryColumns[0]?.propertyName;
    if (!orderColumn) continue;

    targets.push({ module, entity, ownerColumn, textColumns, orderColumn });
  }

  return targets;
}
