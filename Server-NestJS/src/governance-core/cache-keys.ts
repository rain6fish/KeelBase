// SPDX-License-Identifier: Apache-2.0

import type { DataSource } from 'typeorm';

/**
 * 审计模块的缓存键 —— **单源**。
 *
 * `audit:verify` 原本是 `AuditService` 内部的字面量（写入的 `log()` 失效它、`verifyChain()` 读写它）。
 * 拆出读侧后，失效方与缓存方分属两个模块——这正是「拆分把内部约定变成跨模块契约」的典型情形，
 * 所以把它提出来共享，而不是两边各写一遍字符串（各写一遍 = 改一处忘一处，缓存静默不失效）。
 */
export const AUDIT_VERIFY_CACHE_KEY = 'audit:verify';

/**
 * AW-5: the verify cache key carries the **database identity**.
 *
 * An identity-less `audit:verify` is harmless while there is only one database. The moment a second one
 * exists — e.g. the standalone governance console, which by design keeps its own database
 * (`config/governance-data-source.ts`) — a verification verdict computed against database A is served as
 * the answer for a request about database B. For an audit feature that is a **wrong answer**, not a slow
 * one. The identity is the DataSource's `type` + `database` (a file path for sqlite, a name for postgres)
 * — the dimension on which the two databases actually differ. The prefix stays `audit:verify`, so
 * invalidating by prefix (and the single-source key) still holds; only its scope narrows to one database.
 *
 * AW-5：校验缓存键带**数据库身份**。
 *
 * 只有一个库时，不带身份的 `audit:verify` 无害。一旦出现第二个库——例如独立治理台，它按设计自带治理库
 * （`config/governance-data-source.ts`）——对 A 库算出的校验结论就会被当作对 B 库的答案返回。对审计而言
 * 这是**答错**，不是变慢。身份取 DataSource 的 `type` + `database`（sqlite 是文件路径，postgres 是库名）
 * —— 正是两个库**真正不同**的那个维度。前缀仍是 `audit:verify`，故按前缀失效（与单源键）依旧成立，
 * 只是它的作用域收窄到**一个库**。
 */
export function auditVerifyCacheKey(dataSource?: DataSource | null): string {
  const options = dataSource?.options as { type?: string; database?: unknown } | undefined;
  // 无 DataSource（仅见于手工构造的单测/脚本）→ 回落到共享前缀，与加身份之前的行为一致。
  // No DataSource (only hand-built instances in tests / scripts) → fall back to the shared prefix,
  // i.e. the behaviour from before the identity was added.
  if (!options) return AUDIT_VERIFY_CACHE_KEY;
  return `${AUDIT_VERIFY_CACHE_KEY}:${options.type ?? 'unknown'}:${String(options.database ?? '')}`;
}
