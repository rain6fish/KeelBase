// SPDX-License-Identifier: Apache-2.0

/**
 * What order a read actually applies, declared **on the response that applies it**.
 *
 * Ordering authority is a property of each query, not of the system: one surface walks rows by id, the
 * next lists them by timestamp, and a reader holding a page has no way to tell which. Declaring it in
 * prose somewhere else does not reach the reader; a declaration that travels with the response does.
 *
 * Three facts each declaration has to carry, because each one is a way for "ordered" to mean nothing:
 *
 * - **`controlledBy`** — who sets the field. A producer-supplied field lets the producer choose a
 *   position; a receiver-supplied one does not.
 * - **`tiebreak`** — what happens when the primary key ties. `null` means ties are unordered, which on
 *   a paginated read means page membership is not deterministic: two identical requests may split the
 *   same tie differently and a row can repeat or vanish across pages.
 * - **`attested`** — whether the position is covered by the hash chain. A receiver-controlled field
 *   outside the payload cannot be rewritten *and detected*; `none` says so rather than implying that
 *   receiver control alone is enough.
 *
 * 一次读**实际用的**是什么顺序，就声明在**应用了它的那个响应**上。
 *
 * 排序权是每条查询的属性，不是系统的属性：一个面按 id 走行，下一个面按时间列，而拿着某一页的读者
 * 无从分辨。写在别处的散文到不了读者手里；随响应一起走的声明到得了。
 *
 * 每份声明都要带三件事，因为每一件都是「有序」可以变得毫无意义的方式：
 *
 * - **`controlledBy`** —— 谁设置这个字段。产出方提供的字段让产出方挑位置；接收方提供的不会。
 * - **`tiebreak`** —— 主键并列时怎么办。`null` 表示并列无序，而在分页读上这意味着页成员不确定：
 *   两次相同的请求可以把同一组并列切得不一样，一行可能在页与页之间重复或消失。
 * - **`attested`** —— 位置是否被哈希链覆盖。接收方可控、却不入载荷的字段，改了也**查不出来**；
 *   `none` 就把这一点说出来，而不是暗示「接收方可控」本身就够了。
 */

export type OrderingDirection = 'asc' | 'desc';

/** Who supplies the value the read sorts by. / 排序字段由谁提供。 */
export type OrderingAuthority = 'receiver' | 'producer';

/**
 * Whether the position is covered by evidence.
 * - `chain-order` — the row's relative position is bound by the hash chain (`prevHash` walks ids).
 * - `none` — the position is stored but not covered: changing it would not break the chain.
 *
 * 位置是否被证据覆盖。`chain-order` = 相对位置由哈希链（`prevHash` 按 id 走）绑定；`none` = 位置存着，
 * 但没被覆盖：改了也不会断链。
 */
export type OrderingAttestation = 'chain-order' | 'none';

export interface OrderingDeclaration {
  /** Primary sort field, as the query spells it. / 查询实际使用的首要排序字段。 */
  field: string;
  direction: OrderingDirection;
  controlledBy: OrderingAuthority;
  /** Secondary key when the primary ties; `null` = ties unordered. / 并列时的次序键；`null` = 无序。 */
  tiebreak: { field: string; direction: OrderingDirection } | null;
  attested: OrderingAttestation;
}

/**
 * `GET /audit/logs` — the paginated list. Sorted by `createdAt` (server-generated, so no producer
 * chooses a position), with `id` as the tie-break so that page membership is deterministic.
 * `attested: 'none'` because `createdAt` is outside the hash payload: the order is receiver-controlled
 * but not evidence-backed, and saying only "receiver" would imply more than that.
 *
 * `GET /audit/logs` —— 分页列表。按 `createdAt`（服务端生成，故没有产出方能挑位置），并列时以 `id`
 * 决序，于是页成员确定。`attested: 'none'` 因为 `createdAt` 不在哈希载荷内：顺序由接收方控制，
 * 却没有证据背书，只说「接收方可控」会暗示出比事实更多的东西。
 */
export const AUDIT_LOG_LIST_ORDERING: OrderingDeclaration = {
  field: 'createdAt',
  direction: 'desc',
  controlledBy: 'receiver',
  tiebreak: { field: 'id', direction: 'desc' },
  attested: 'none',
};

/**
 * `GET /audit/verify` and the export's chain manifest — the chain walk. `id` ascending is what
 * `prevHash` binds, so this order **is** the attested one.
 *
 * `GET /audit/verify` 与导出包的链清单 —— 链的遍历。`id` 升序正是 `prevHash` 绑定的东西，故这个顺序
 * **就是**被证明的那个。
 */
export const CHAIN_WALK_ORDERING: OrderingDeclaration = {
  field: 'id',
  direction: 'asc',
  controlledBy: 'receiver',
  tiebreak: null,
  attested: 'chain-order',
};

/**
 * `GET /audit/action-report` — the report's row read. Same field as the list, but with **no**
 * tie-break today: the query orders by `createdAt` alone, so rows sharing a timestamp come back in
 * whatever order the engine gives. The declaration says `null` rather than claiming the tie-break the
 * list has, because a declaration that describes an order the query does not apply is worse than no
 * declaration — it makes the reader stop looking.
 *
 * `GET /audit/action-report` —— 报表的行读取。字段与列表相同，但**今天没有** tie-break：查询只按
 * `createdAt` 排，时间戳相同的行按引擎给什么顺序就什么顺序。声明写 `null`，而不是声称列表有的那个
 * tie-break —— 一份描述了查询并不执行的顺序的声明，比没有声明更糟：它让读者不再去看。
 */
export const REPORT_ROWS_ORDERING: OrderingDeclaration = {
  field: 'createdAt',
  direction: 'desc',
  controlledBy: 'receiver',
  tiebreak: null,
  attested: 'none',
};

/**
 * `GET /ai/tool-effects/claims` — the in-flight claim read. Oldest claim first, so a stuck execution
 * rises to the top of the page. `claimedAt` is set by the service at claim time (receiver-supplied),
 * and `id` breaks ties so the page boundary is deterministic. The position is not hash-covered —
 * claims are not part of the audit chain — so `attested` says `none` rather than implying evidence.
 *
 * `GET /ai/tool-effects/claims` —— 在途占位查询。最老的占位在前，卡住的执行因此浮到首页。
 * `claimedAt` 由服务在占位时写入（接收方提供），并列以 `id` 决序，故页边界确定。位置不受哈希链覆盖 ——
 * 占位行不在审计链内 —— 故 `attested` 写 `none`，而不是暗示有证据。
 */
export const IN_FLIGHT_CLAIMS_ORDERING: OrderingDeclaration = {
  field: 'claimedAt',
  direction: 'asc',
  controlledBy: 'receiver',
  tiebreak: { field: 'id', direction: 'asc' },
  attested: 'none',
};

