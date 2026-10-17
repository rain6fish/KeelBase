// SPDX-License-Identifier: Apache-2.0

/**
 * 纯函数助手：无依赖、被多个簇共用。**从 `ai-tool-effects.service.ts` 原样搬来**（2026-10-11 拆分第一批），
 * 搬动时一字未改 —— `targetKey` / `declarationDiff` 判的是**目标身份集合**（不是声明下标），`sortKeys` 是
 * 幂等键与 args 摘要的共用口径，`isUniqueViolation` 是「只有唯一冲突才可按幂等 skip」那一条。
 *
 * Dependency-free helpers shared by more than one cluster, moved verbatim out of the service. Their wording
 * carries meaning: the target-identity comparison, the stable serialization behind the idempotency key, and the
 * predicate deciding which database errors may be treated as an idempotent skip.
 */
import { createHash } from 'crypto';
import type { DeclaredSideEffect } from './effect-composition';
import type { WriteToolContext } from './tool-effects.types';

/**
 * Revoke ownership predicate: **only the side effect's owner** may use the user-facing revoke path.
 *
 * There is exactly one implementation of this rule. `revokeOwned` gates the real path with it, and the
 * trust showcase's revoke scenario replays it. The showcase is a replay of the criterion, not a second
 * rule: if it copied the comparison, a later change here would leave the demo silently asserting the old
 * rule — a demo that lies about the product. Both sites import this function.
 *
 * 撤销属主判据：**只有副作用属主本人**可走用户侧撤销。
 *
 * 这条规则只有这一份实现：`revokeOwned` 用它把守真实路径，信任沙盘的撤销场景用它做判据重放。
 * 沙盘是重放**判据**，不是第二套规则 —— 若各抄一份比较式，这里以后一改，演示页就会继续断言旧规则，
 * 成为「说假话的演示」。两侧都 import 这一个函数。
 */
export function isEffectOwner(effect: { userId: string }, userId: string): boolean {
  return effect.userId === userId;
}

/** 唯一约束冲突判定（postgres 23505 / sqlite SQLITE_CONSTRAINT / UNIQUE constraint message）——仅此类错误才可按幂等 skip（KB-4 FP-4） */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string }).code ?? '';
  const msg = (err as Error).message ?? '';
  return (
    code === '23505' ||
    code.includes('SQLITE_CONSTRAINT') ||
    msg.includes('SQLITE_CONSTRAINT') ||
    /UNIQUE constraint failed/i.test(msg)
  );
}

/** REV-1：成员比对用的**目标身份**（正是 `memberKey` 消费的业务载荷）。不含声明下标。 */
export function targetKey(e: { resultType: string; resultId: number }): string {
  return `${e.resultType}:${e.resultId}`;
}

/**
 * REV-1：比对「被拒声明」与「已持有组」的成员集合，**双向**求差 —— 两侧都算出来、都留成证据。
 *
 * ARC-6 动的是**裁决**，不是**记录**：一次「重试声明更少」（`onlyStored` 非空）仍然是一次真实的漂移，
 * 照样留证；但**它不单独触发「未完成」**——那几条**已被登记、会被补偿**，报未完成是假警报。危害模型里
 * 只有「**声明了却从未登记**」（`onlyDeclared` 非空）才让撤销够不到东西。裁决在哪一刀见 `_hasOpenDispute`。
 *
 * 按目标身份比集合、**不按声明下标比位置**：问题在于覆盖（哪几条补偿不到），下标只决定根成员与幂等键。
 */
export function declarationDiff(
  declared: DeclaredSideEffect[],
  stored: DeclaredSideEffect[],
): { onlyDeclared: DeclaredSideEffect[]; onlyStored: DeclaredSideEffect[] } | null {
  const storedKeys = new Set(stored.map(targetKey));
  const declaredKeys = new Set(declared.map(targetKey));
  const onlyDeclared = declared.filter((e) => !storedKeys.has(targetKey(e)));
  const onlyStored = stored.filter((e) => !declaredKeys.has(targetKey(e)));
  if (onlyDeclared.length === 0 && onlyStored.length === 0) return null;
  return { onlyDeclared, onlyStored };
}

/** 递归按 key 排序对象，保证同一 args 稳定序列化 —— 幂等键、args 摘要与代理身份共用同一口径 */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      obj[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return obj;
  }
  return value;
}

/** 参数 hash（幂等键与追溯共用同一摘要口径）—— 登记与 claims 两簇共用，故与其余助手同处。 */
export function argsHash(ctx: WriteToolContext): string {
  return createHash('sha256')
    .update(JSON.stringify(sortKeys(ctx.args)))
    .digest('hex')
    .slice(0, 16);
}

/**
 * 幂等键：sha256(userId:conversationId:toolName:stableArgsJson)。
 *
 * 与 `argsHash` 一样是**契约**（键怎么算决定幂等怎么成立），故放在这里；服务上保留同名静态方法作为委托，
 * 仓内既有的 `AiToolEffectsService.buildKey(...)` 调用点一字不用改。
 */
export function buildKey(ctx: WriteToolContext): string {
  const stable = JSON.stringify(sortKeys(ctx.args));
  const seed = `${ctx.userId}:${ctx.conversationId ?? ''}:${ctx.toolName}:${stable}`;
  return createHash('sha256').update(seed).digest('hex');
}

/**
 * 复合写工具组内成员幂等键（docs/cascade-compensation.spec.md §4）：基键 + 区分度。
 * 同组多行若共用基键，`idempotency_key` 唯一约束会把整组塌成一行——区分度是必需的，不是优化。
 * 用**声明下标**而非登记顺序：重试时同一成员映射到同一键（幂等语义才成立）。
 */
export function memberKey(baseKey: string, index: number, resultType: string, resultId: number): string {
  return createHash('sha256').update(`${baseKey}:${index}:${resultType}:${resultId}`).digest('hex');
}
