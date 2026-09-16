// SPDX-License-Identifier: Apache-2.0

/**
 * 确认卡影响预览（§22.17 ④「级联撤销 / 业务补偿」的影响预览切片；spec docs/impact-preview.spec.md）。
 *
 * 写工具执行前告知「将执行几个写动作 / 涉及哪些对象类型」。**纯推导、不查库不试跑**——
 * 由工具名确定性推出，绝不为了预览去触达真实系统（那正是确认门控要防的）。
 *
 * 对象类型**复用副作用登记同一单源**（writeEffectTypeFor / proxy → proxy_call），不另建映射表：
 * 预览里说会动的对象，与事后登记、可撤销、审计对得上的必须是同一个。
 *
 * 无法解析对象类型的工具不计入（fail-closed）——它们本就不登记可撤副作用（如
 * review_approval_request 状态变更、create_module 干跑），编一个数字比不说更糟。
 */
import { writeEffectTypeFor } from './write-effect-type';
import type { ConfirmationImpact, ConfirmationImpactTarget } from '../interfaces/tool.interface';

/** 待预览的写动作 */
export interface WriteActionRef {
  toolName: string;
  /** 外部系统代理写（AI Bridge B 路径）→ 对象类型 proxy_call，与副作用登记同判据 */
  isProxyWrite: boolean;
}

/**
 * 推导影响预览。无可解析对象时返回 null（调用方据此**省略** impact 字段，而非发 0）。
 */
export function deriveWriteImpact(actions: WriteActionRef[]): ConfirmationImpact | null {
  const tally = new Map<string, number>();
  for (const action of actions) {
    const resultType = action.isProxyWrite ? 'proxy_call' : writeEffectTypeFor(action.toolName);
    if (!resultType) continue;
    tally.set(resultType, (tally.get(resultType) ?? 0) + 1);
  }
  if (tally.size === 0) return null;

  const targets: ConfirmationImpactTarget[] = [...tally.entries()].map(([resultType, count]) => ({
    resultType,
    count,
  }));
  return { actions: targets.reduce((sum, t) => sum + t.count, 0), targets };
}
