// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';

/**
 * Membership, not counts.
 *
 * Two numbers read off the same table can agree while a reader can still only reach part of it: a
 * total and a per-day sum both come from the writer's side, so their equality is free and says nothing
 * about whether the public read surface hands the rows out. What a reader can check is a **set** —
 * enumerate what you can see, fingerprint it the same way, compare. A digest over the ids is that
 * fingerprint, and the named difference is what makes a mismatch diagnosable instead of merely red.
 *
 * 成员性，而不是计数。
 *
 * 同一张表上读出的两个数可以一致，而读者仍然只能够到其中一部分：总数与按日合计都出自写入方，
 * 两者相等是免费的，对「公开读面是否把行交了出来」一个字也说明不了。读者能核的是一个**集合** ——
 * 把看得到的行枚举出来，用同一方式取指纹，再比对。id 的摘要是那个指纹；把差额**点名**出来，
 * 才让一次不符可诊断，而不只是变红。
 *
 * The digest is a fingerprint, not a security boundary: it detects a different membership, and an
 * adversary who can rewrite the table can also rewrite the digest. Formula, so a third party can
 * recompute it: `sha256(ids sorted ascending, joined by ",", no spaces)` → first 16 hex.
 *
 * 摘要是**指纹、不是安全边界**：它检出的是「成员不同」；能改表的人同样能改摘要。算法公开，
 * 第三方可自算：`sha256(升序 id 以 "," 连接、无空格)` → 前 16 位十六进制。
 */

export interface IdSetSummary {
  /** Lowest id in the set, or `null` when it is empty. / 集合内最小 id；空集为 `null`。 */
  min: number | null;
  /** Highest id in the set, or `null` when it is empty. / 集合内最大 id；空集为 `null`。 */
  max: number | null;
  count: number;
  digest: string;
}

/** A capped listing of ids, for the gaps a reader has to be able to name. */
export interface IdListing {
  ids: number[];
  /** True when `ids` is only the first {@link DROP_ID_CAP} of `count`. / `ids` 只是前 200 条时为 true。 */
  truncated: boolean;
}

/**
 * How many ids a gap listing carries. The list is for diagnosis — naming one row is enough to fetch
 * it and see whether it answers — so it is capped while `count` and `digest` stay exact. A cap that
 * silently shortened `count` would repeat the very failure this module exists to fix.
 *
 * 差额清单带多少条 id。清单是给**诊断**用的 —— 点名一行就够去取它、看它答不答 —— 故带上限，而
 * `count` 与 `digest` 保持精确。一个会悄悄缩短 `count` 的上限，正是本模块要修的那类失效。
 */
export const DROP_ID_CAP = 200;

function hashIds(ids: readonly number[]): string {
  const sorted = [...ids].sort((a, b) => a - b);
  return createHash('sha256').update(sorted.join(',')).digest('hex').slice(0, 16);
}

export function summarizeIds(ids: readonly number[]): IdSetSummary {
  if (ids.length === 0) return { min: null, max: null, count: 0, digest: hashIds([]) };
  let min = ids[0];
  let max = ids[0];
  for (const id of ids) {
    if (id < min) min = id;
    if (id > max) max = id;
  }
  return { min, max, count: ids.length, digest: hashIds(ids) };
}

/** Ids present in `all` and absent from `exclude`. Order follows `all`. / 在 `all` 里、不在 `exclude` 里的 id。 */
export function idsMissingFrom(all: readonly number[], exclude: ReadonlySet<number>): number[] {
  return all.filter((id) => !exclude.has(id));
}

export function capIds(ids: readonly number[]): IdListing {
  const capped = ids.slice(0, DROP_ID_CAP);
  return { ids: capped, truncated: ids.length > capped.length };
}
