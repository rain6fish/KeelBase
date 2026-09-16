// SPDX-License-Identifier: Apache-2.0

/**
 * 复合写工具声明解析（docs/cascade-compensation.spec.md §3）。
 *
 * 一次 `execute` 跨表写多行的写工具，在 `ToolResult.data.effects` 里声明它写了什么；
 * 登记层据此落**同组多行**副作用（组 = 该次调用的幂等基键），撤销任一条即级联补偿整组。
 *
 * fail-closed：形状非法一律返回 null，调用方回落既有单目标路径（读 `data.id`）。
 * 「不猜」是这层的全部价值——猜错就是登记了错的撤销目标。
 */

/** 单个已声明的副作用目标（根成员恒为数组第 0 条） */
export interface DeclaredSideEffect {
  resultType: string;
  resultId: number;
}

/**
 * 从工具返回的 `data` 读复合声明 `effects[]`。
 * 返回 null = 非复合声明（未声明 / 形状非法）→ 调用方走单目标路径。
 */
export function declaredEffects(data: unknown): DeclaredSideEffect[] | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const raw = (data as { effects?: unknown }).effects;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: DeclaredSideEffect[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const { resultType, resultId } = item as Record<string, unknown>;
    if (typeof resultType !== 'string' || resultType.length === 0) return null;
    if (typeof resultId !== 'number' || !Number.isFinite(resultId)) return null;
    out.push({ resultType, resultId });
  }
  return out;
}
