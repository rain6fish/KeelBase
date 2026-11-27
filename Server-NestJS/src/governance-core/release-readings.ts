// SPDX-License-Identifier: Apache-2.0

import {
  targetStatusBasisView,
  type TargetStatusLookupBasisView,
} from './target-status';

/**
 * The off-chain `releaseLookups` column, parsed as data.
 *
 * <p><b>Why a shared parser.</b> The column is written in one place (`_writeReleaseRow`'s evidence)
 * and read in several: the six-answer export, the action report, and the evidence package. Parsing
 * `detail` prose is forbidden, so the column's JSON is the only source for a release's reading kind —
 * and one parser means the same row cannot be read as `receipt` on one surface and `current_state` on
 * another. A token this vocabulary does not know becomes `unknown` rather than being echoed.
 *
 * <p><b>`latest` is kept separate from `readings`.</b> `latest` follows the six-answer export's rule
 * exactly: `null` when no item was copied, `unknown` when the newest raw item is an object without a
 * declared kind, and the declared kind otherwise. `readings` is the structured list a report can
 * carry; a malformed item is skipped there rather than fabricated. The two are allowed to disagree
 * only for malformed data, which the writer never produces.
 *
 * 链外 `releaseLookups` 列按数据解析。
 *
 * <p><b>为什么共用一个解析器。</b> 这一列只在一处写入（`_writeReleaseRow` 的证据），却有多处读：六问
 * 导出、Action Report、证据包。解析 `detail` 散文是被禁止的，故该列的 JSON 是释放读数种类的唯一来源 ——
 * 一个解析器意味着同一行不会在一个读面上是 `receipt`、在另一个读面上是 `current_state`。本词表不认识的
 * 令牌变成 `unknown`，绝不回显。
 *
 * <p><b>`latest` 与 `readings` 分开保留。</b> `latest` 与六问导出的规则逐字一致：没有拷贝条目时为
 * `null`；最新原始条目是对象但没有声明种类时为 `unknown`；否则是声明的种类。`readings` 是报表可携带的
 * 结构化清单；畸形条目在那里被跳过，而不是被编造。两者只在畸形数据上才可能不一致，而写入方从不产出
 * 畸形数据。
 */
export interface ReleaseReading {
  /** The source row's id (`ai_target_status_lookups.id`) — the copied values' way back. */
  id: number | null;
  /** When the target was asked (ISO 8601). / 目标被问的时刻（ISO 8601）。 */
  at: string | null;
  /** `executed` | `not_executed` | `unknown`, as the target answered. / 目标答的结论。 */
  conclusion: string | null;
  /** Why the conclusion is `unknown`; `null` for a real answer. / 结论为 `unknown` 的成因。 */
  reason: string | null;
  /** What the answer is based on, in the read face's vocabulary. / 答案基于什么（读面词表）。 */
  basis: TargetStatusLookupBasisView;
  /** Who asked. / 谁问的。 */
  lookedUpBy: string | null;
}

export interface ReleaseReadings {
  /**
   * The total number of asks recorded for this write; the column copies only the newest few, so this
   * can exceed `readings.length`. `null` when the column did not carry a number.
   *
   * 这次写记录的询问总次数；该列只拷贝最近几次，故它可能大于 `readings.length`。列里没有数字时为
   * `null`。
   */
  count: number | null;
  /** Whether the target can be asked at all (deployment fact). / 目标是否可问（部署事实）。 */
  askable: boolean | null;
  /**
   * R-6b: this release's own ask left no row, so the copied items are earlier asks — no kind
   * describes this one.
   *
   * R-6b：这一次释放自己的询问没留下读数行，故拷贝条目是更早的问次 —— 没有种类能描述这一次。
   */
  askUnrecorded: boolean;
  /** The newest copied reading's kind, under the six-answer export's rule. / 最新拷贝读数的种类。 */
  latest: TargetStatusLookupBasisView | null;
  /** The copied readings, newest first (the column's own order). / 拷贝读数，最近在前。 */
  readings: ReleaseReading[];
}

/**
 * Parse the column; `null` when it is absent or unreadable. An absent column means «not a release»
 * (a refusal or a non-release action), never «a release with no readings» — the latter is written as
 * `{count: 0, askable: …, items: []}`.
 *
 * 解析该列；缺席或读不出时为 `null`。列缺席意味着「不是一次释放」（拒绝行或非释放动作），绝不是
 * 「一次没有读数的释放」—— 后者写成 `{count: 0, askable: …, items: []}`。
 */
export function parseReleaseReadings(
  raw: string | null | undefined,
): ReleaseReadings | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const column = parsed as Record<string, unknown>;
  const items = Array.isArray(column.items) ? column.items : [];
  // The six-answer export has always judged the **raw** first item: an object without a declared
  // kind is `unknown`; anything that is not an object is as good as no item (`null`). Keep that
  // rule here so the CSV and the reports cannot disagree about the same row.
  // 六问导出一直判的是**原始**首个条目：对象但没有声明种类为 `unknown`；不是对象的当作没有条目
  // （`null`）。这里沿用，于是 CSV 与报表不会对同一行各说各的。
  const first = items[0] as unknown;
  const latest =
    first !== null && typeof first === 'object'
      ? targetStatusBasisView((first as { basis?: unknown }).basis)
      : null;
  const readings: ReleaseReading[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    readings.push({
      id: typeof r.id === 'number' ? r.id : null,
      at: typeof r.at === 'string' ? r.at : null,
      conclusion: typeof r.conclusion === 'string' ? r.conclusion : null,
      reason: typeof r.reason === 'string' ? r.reason : null,
      // A kind is one of the two declared words or `unknown`; a future word is not echoed here.
      // 种类只能是两个已声明的词或 `unknown`；未来的词不会在这里回显。
      basis: targetStatusBasisView(r.basis),
      lookedUpBy: typeof r.lookedUpBy === 'string' ? r.lookedUpBy : null,
    });
  }
  return {
    count: typeof column.count === 'number' ? column.count : null,
    askable: typeof column.askable === 'boolean' ? column.askable : null,
    askUnrecorded: column.recorded === false,
    latest,
    readings,
  };
}
