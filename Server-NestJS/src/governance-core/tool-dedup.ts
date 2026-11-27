// SPDX-License-Identifier: Apache-2.0

/**
 * A tool's `dedup` declaration, resolved — the one fact R-9 consults before a weak target-status
 * reading may release a write hold.
 *
 * The declaration answers **"does the target honour the `Idempotency-Key` it is sent?"**, not "is the
 * effect idempotent?". Three values, each with its own meaning here:
 *
 * - `yes` — the target drops a repeat of the same key, so re-sending the same logical call cannot
 *   duplicate the effect. A weak reading may release.
 * - `no` — the target does not honour the key. A weak reading may not release.
 * - `unknown` — nobody told us (an undeclared tool lands here). Read exactly like `no`: silence
 *   cannot license a retry.
 *
 * It lives in `governance-core` because two layers read it and neither may import the other at
 * runtime: the AI tool interface (resolving an absent declaration) and the governance-shared
 * reconcile path (deciding whether to release). Pure — no imports.
 *
 * 工具 `dedup` 声明的解析结果 —— R-9 在弱目标状态读数能否释放写占位之前要问的那一件事。
 *
 * 这个声明回答的是**「目标是否遵守收到的 `Idempotency-Key`」**，不是「效果是否幂等」。三个取值，
 * 在这里各有含义：
 *
 * - `yes` —— 目标会丢掉同一个键的重复，故重发同一逻辑调用不可能重复效果。弱读数可以释放。
 * - `no` —— 目标不遵守该键。弱读数不得释放。
 * - `unknown` —— 没人告诉过我们（未声明的工具落在这里）。按 `no` 一样读：沉默不能授权重试。
 *
 * 它住在 `governance-core`，因为有两层读它，而这两层在运行时都不能 import 对方：AI 的工具接口
 *（解析缺席声明）与 governance-shared 的对账路径（决定是否释放）。纯函数 —— 没有任何 import。
 */
export type DedupDeclaration = 'yes' | 'no' | 'unknown';

/** Resolve a tool's declaration; an absent field (or tool) is `unknown`, never a weaker `yes`. */
export function declaredDedup(tool?: {
  capabilities?: { dedup?: DedupDeclaration };
}): DedupDeclaration {
  return tool?.capabilities?.dedup ?? 'unknown';
}
