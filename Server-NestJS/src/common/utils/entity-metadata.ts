// SPDX-License-Identifier: Apache-2.0

/**
 * Small, pure readers over TypeORM entity metadata.
 *
 * They exist because two callers need the same answers about an entity they only know by
 * name: the AI side-effect revoker (which derives what to soft-delete) and the admin trash
 * (which enumerates everything soft-deletable). Keeping the column-naming rule in one place
 * is the point — a second copy is a second authority for what a record is "called", and the
 * two would drift apart silently.
 *
 * 对 TypeORM 实体元数据的小型纯读取器。
 *
 * 它们存在，是因为两个调用方需要对「只知其名」的实体拿到同样的答案：AI 副作用撤销器
 * （推导该软删谁）与管理端回收站（枚举所有可软删的）。把「列命名规则」只留一处正是重点 ——
 * 第二份副本就是第二个权威，两者会无声地漂开。
 */

/** The property names we treat as "what this record is called". */
/* 我们视作「这条记录叫什么」的属性名。 */
export const DISPLAY_COLUMN_NAMES = ['title', 'name', 'subject', 'label'] as const;

/** Just enough of TypeORM's column metadata for these readers. */
/* 这些读取器所需的 TypeORM 列元数据，仅此而已。 */
export interface ColumnLike {
  propertyName: string;
}

/**
 * The column to show a user for this entity, or `null` when it has none.
 *
 * The rule is "the first column, **in metadata order**, whose name is in the set above" — not
 * "the highest-priority name". That distinction is deliberate: this picker is shared with the
 * AI revocation path, where it has been in service since the beginning, and changing the rule
 * would silently move which column that path reads. Keep the shared rule; if the two names
 * ever collide on one entity, they collide the way they always have.
 *
 * `null` is a real answer, not a failure: some entities are identified by their state or by an
 * id alone, and callers must cope rather than assume a `title` exists. Hardcoding one is how a
 * listing ends up querying a column that isn't there.
 *
 * 该实体给用户看的列；没有则为 `null`。
 *
 * 规则是「**按元数据顺序**，第一个名字落在上面集合里的列」，而**不是**「优先名次最高的那个」。
 * 这个区别是有意的：本函数与 AI 撤销路径共用，而它自始就在那条路径上服役，改规则会无声地
 * 挪动那条路径读的是哪一列。共用规则保持不动；两个名字真在同一实体上撞了，也照它们一直以来的
 * 方式撞。
 *
 * `null` 是**真实答案**而不是失败：有些实体只靠状态或 id 识别，调用方必须应对、而不是假定
 * 存在 `title`。硬编码一个，就是列表去查一个并不存在的列的由来。
 */
export function pickDisplayColumn(md: { columns?: ColumnLike[] }): string | null {
  const col = (md.columns ?? []).find((c) =>
    (DISPLAY_COLUMN_NAMES as readonly string[]).includes(c.propertyName),
  );
  return col ? col.propertyName : null;
}

/** The property names we treat as "who owns this record", **in priority order**. */
/* 我们视作「这条记录归谁」的属性名，**按优先次序**。 */
export const OWNER_COLUMN_NAMES = ['userId', 'requesterId', 'initiatorId'] as const;

/**
 * The column naming the owning user, or `null` when the entity has no such column.
 *
 * Unlike the display picker this one **is** priority-ordered, because it has no legacy path to
 * preserve: it was written for the trash, and the intent ("a `userId` if there is one") is
 * clearer stated as precedence than as declaration order. The three names are not guesses —
 * they are exactly what the soft-deletable entities in this codebase use today. An entity
 * owned by nobody legitimately answers `null`.
 *
 * 与展示列不同，这个 picker **是**按优先次序的 —— 因为它没有历史路径要保：它是为回收站写的，
 * 而「有 `userId` 就用它」这个意图写成优先级比写成声明顺序更清楚。三个名字不是猜的：它们正是
 * 本仓软删实体今天实际在用的。无主的实体如实答 `null`。
 */
export function pickOwnerColumn(md: { columns?: ColumnLike[] }): string | null {
  const names = new Set((md.columns ?? []).map((c) => c.propertyName));
  return OWNER_COLUMN_NAMES.find((n) => names.has(n)) ?? null;
}

/**
 * An entity class name as a wire-friendly identifier: `CrmCustomer` → `crm_customer`.
 *
 * Snake case rather than a squashed lowercase, because the identifier is *read* by humans — in an
 * API response and, when nobody has a translation for it yet, in a UI cell. `crmcustomer` loses
 * where the words were; `crm_customer` keeps them.
 *
 * 实体类名转成适合上线的标识：`CrmCustomer` → `crm_customer`。
 *
 * 用下划线而不是压平的小写，因为这个标识是**给人读**的 —— 在接口响应里读，也在「还没人给它配译名」
 * 时的界面单元格里读。`crmcustomer` 丢掉了词边界，`crm_customer` 留着。
 */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}
