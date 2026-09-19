// SPDX-License-Identifier: Apache-2.0

/**
 * 审计模块的缓存键 —— **单源**。
 *
 * `audit:verify` 原本是 `AuditService` 内部的字面量（写入的 `log()` 失效它、`verifyChain()` 读写它）。
 * 拆出读侧后，失效方与缓存方分属两个模块——这正是「拆分把内部约定变成跨模块契约」的典型情形，
 * 所以把它提出来共享，而不是两边各写一遍字符串（各写一遍 = 改一处忘一处，缓存静默不失效）。
 */
export const AUDIT_VERIFY_CACHE_KEY = 'audit:verify';
