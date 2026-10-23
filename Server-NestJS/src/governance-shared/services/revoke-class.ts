// SPDX-License-Identifier: Apache-2.0

/**
 * Revoke class resolution — the KB-6 single source, kept here so the shared side never has to import
 * a **value** from `src/ai/**`.
 *
 * The parameter is structural on purpose: the AI tool interface satisfies it, and this file neither
 * needs nor should depend on that interface.
 *
 * 撤销档位解析 —— KB-6 的单源，放在这里使共享侧不必从 `src/ai/**` 取一个**值**。
 *
 * 参数刻意写成结构类型：AI 工具接口天然满足它，本文件因此不必、也不应依赖那个接口。
 */
export type RevokeClass =
  | 'none'
  | 'local_compensate'
  | 'governed_external'
  | 'transactional';

/**
 * Resolve a tool's revoke class: an explicit declaration wins; otherwise it is derived from the
 * existing semantics — a confirmation write tool defaults to `local_compensate`, everything else to
 * `none` (no reversible effect, or never executed).
 *
 * 解析工具的撤销档位：显式声明优先；否则按既有语义派生 —— 确认写工具默认 `local_compensate`，其余为
 * `none`（不产生可撤副作用，或永不执行）。
 */
export function resolveRevokeClass(tool: {
  revokeClass?: RevokeClass;
  requiresConfirmation?: boolean;
}): RevokeClass {
  if (tool.revokeClass) return tool.revokeClass;
  return tool.requiresConfirmation ? 'local_compensate' : 'none';
}
