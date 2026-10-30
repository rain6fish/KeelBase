// SPDX-License-Identifier: Apache-2.0

/**
 * What a historical audit row's `outcome` and `tool` were, derived from the three values such a row
 * already carries.
 *
 * These live in a module of their own, and **not in the migration that uses them**, for a reason
 * worth writing down: TypeORM loads migrations by importing every file matching its migration glob
 * and instantiating the exported functions it finds. A helper exported from a migration file is
 * therefore `new`-ed as though it were a migration — this file exists because that happened, and it
 * failed loudly (`Cannot read properties of undefined (reading 'action')` at `new deriveOutcome`)
 * rather than quietly.
 *
 * They are also shared with the specs, which build fixture rows through them, so a fixture cannot
 * state a shape no writer could produce.
 *
 * Home is this module rather than `src/ai/audit`: three domains need the rules (the backfill migration,
 * the report and the statistics), and `check:governance-imports` (S4-H4-C) forbids a governance module
 * from reaching into `src/ai` at runtime. Moving the helper is what that gate asks for; importing it
 * across the boundary would have been recorded as a new coupling.
 *
 * 一行**历史**审计行的 `outcome` 与 `tool` 本会是什么，从这样一行已经带着的三个值推出来。
 *
 * 它们住在自己这个模块里、而**不在用它们的那个迁移文件里**，理由值得写下来：TypeORM 按迁移 glob
 * 把每个文件 import 进来，然后**实例化**它找到的导出函数。于是从迁移文件里导出的助手会被当作迁移
 * `new` 一次——本文件的存在就是因为这件事真的发生了，而它**响亮地**失败（`new deriveOutcome` 上的
 * `Cannot read properties of undefined (reading 'action')`），没有安静地过去。
 *
 * 它们也与 spec 共用：夹具行经它们构造，故夹具**说不出**写入方写不出的形状。
 *
 * 归属是本模块而不是 `src/ai/audit`：三处都要用这两条规则（回填迁移、报表域、统计域），而
 * `check:governance-imports`（S4-H4-C）禁止治理模块在运行时伸进 `src/ai`。闸要的就是把助手搬过来；
 * 跨边界去 import 它，会被记成一条新增耦合。
 */

/**
 * The row shape the two rules read. Only what they actually look at, and every field the entity
 * types as optional stays optional here — the read path hands over `AiAuditLog` rows, and a rule
 * that demands `null` where a column may be `undefined` cannot accept its own writer's output.
 *
 * 两条规则所读的行形状。只列它们真看的字段，且**实体里可选的字段在这里也可选** —— 读侧递给它们的是
 * `AiAuditLog` 行，而一条要求 `null`、实际列可能 `undefined` 的规则，接受不了自己写入方的产出。
 */
export interface BackfillRow {
  action: string;
  detail?: string | null;
  isError?: boolean | number | null;
  authorization?: string | null;
}

/** `name(args)`, `name(args) → outcome`, or `Tool: name` — the shapes `detail` can take. */
const TOOL_NAME = '[A-Za-z0-9_]+';

/** The outcome word at the end of a confirmation row, at either shape's anchor. */
const CONFIRMATION_OUTCOME = /→\s*(\w+)\s*(?:\(trusted\))?\s*$/s;

/**
 * The result code a historical row would have carried, or `null` when it cannot be derived.
 *
 * `null` is a real answer here, not a failure: a `tool_call` row that failed and one held for a
 * second person's approval store the same three values and cannot be told apart after the fact, so
 * neither is guessed into being the other. The old reader left those same rows out of every bucket.
 *
 * 这一行本来会带的**结果码**；推不出来时为 `null`。
 *
 * `null` 在这里是一个**真答案**、不是失败：一次失败的工具调用与一次被扣下等人复核的，存下来的三个值
 * 完全一样，事后分辨不了，故谁也不被猜成另一个。旧读取方对同样这些行**本来也是一桶都不计**。
 */
export function deriveOutcome(row: BackfillRow): string | null {
  if (row.action === 'tool_call') {
    if (!row.isError) return 'executed';
    // A denial is the only refusal that stores its reasons; a risk-policy one never reached a
    // decision. Without them the row is a failure or a pending approval, and those two are identical
    // on disk.
    // 拒绝是唯一会把理由存下来的那种拒绝；点名风险策略的那种**从没到过裁决**。没有理由，这行就是
    // 一次失败或一次待批——而这两者在盘上完全一样。
    if (!row.authorization) return null;
    return row.authorization.includes('risk_policy') ? 'blocked' : 'refused';
  }

  if (row.action === 'tool_confirmation') {
    const word = CONFIRMATION_OUTCOME.exec(row.detail ?? '')?.[1];
    if (!word) return null;
    return { approve: 'approved', decline: 'declined', pending_approval: 'pending' }[word] ?? 'timeout';
  }

  // `effect_revoke` is the revoke path's own row; every other action is not a tool outcome at all.
  // `effect_revoke` 是撤销那条路自己的行；其余 action 压根不是一次工具结局。
  if (row.action === 'effect_revoke') return 'revoked';

  return null;
}

/**
 * The outcome a row **has**: the column when it was written, and the derived word for rows that
 * predate it. Every counter that reads an outcome goes through this, so a report cannot count the
 * present one way and the history another — the two halves of one payload disagreeing about the same
 * row is exactly what this exists to prevent.
 *
 * 一行**实际带着**的结局：写了列就用列，早于该列的行用推导出来的词。凡是读结局的计数都经过这里，
 * 于是同一份报表不会对当下用一套口径、对历史用另一套 —— 同一份载荷的两半对同一行给出不同的答案，
 * 正是这个函数要防的那件事。
 */
export function resolveOutcome(row: BackfillRow & { outcome?: string | null }): string | null {
  return row.outcome ?? deriveOutcome(row);
}

/**
 * The tool a historical row would have named, or `null` for a row that is not about one tool.
 *
 * A run-level confirmation covers several tools and the writer leaves `tool` empty for it, so the
 * `run(<token>)` shape answers `null` here too — matching the writer rather than the old reader,
 * which took the first token and called `run` a tool name.
 *
 * 这一行本来会点名的工具；**不是关于某一个工具的行**为 `null`。
 *
 * run 级确认覆盖多个工具、写入方也把 `tool` 留空，故 `run(<token>)` 这个形状在这里同样答 `null`
 * ——对齐**写入方**而不是旧读取方：后者会把第一个 token 取出来、把 `run` 当成工具名。
 */
export function deriveTool(row: BackfillRow): string | null {
  const detail = row.detail;
  if (!detail) return null;
  if (row.action !== 'tool_call' && row.action !== 'tool_confirmation') return null;
  if (/^run\(/.test(detail)) return null;
  return new RegExp('^(' + TOOL_NAME + ')\\(').exec(detail)?.[1] ?? null;
}
