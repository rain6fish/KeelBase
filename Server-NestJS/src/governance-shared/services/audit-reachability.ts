// SPDX-License-Identifier: Apache-2.0

import type { Repository } from 'typeorm';
import type { AiToolSideEffect } from '../entities/ai-tool-side-effect.entity';
import type { AiConfirmationRequest } from '../entities/ai-confirmation-request.entity';
import { forwardWalkFromAuditRow, type ForwardWalkRepos } from './audit-forward-walk';

/**
 * AW-11 criterion #6: a graph-level check whose output is the **list of unreachable row types**.
 *
 * A per-record "every hash verifies and every reference resolves" rate cannot tell a real chain from
 * four rows that all point at one root. The question that can is: starting at the most authoritative
 * row type, which row types cannot be reached? The answer is a list, not a percentage — a percentage
 * invites reading a partially broken graph as a healthy one.
 *
 * The walk goes only forward, through the stored edge `audit.write_claim_id`. It never falls back to
 * pairing by tool name plus time, and never reverses through `claim.audit_row_id`: a row without the
 * forward edge is reported as unreachable, because that is what was recorded.
 *
 * An unreachable claim blocks the path. `effect` and `confirmation` are then reported unreachable too,
 * with the distinct reason `claim_unreachable`; omitting them would read as if those row types were
 * fine. They are not counted as `notApplicable` either, because whether they would have applied cannot
 * be known once the claim is out of reach.
 *
 * `notApplicable` is deliberately separate from `unreachable`. A dry-run claim names no effect and an
 * automatic write names no authorization — those are real answers about the action, not gaps in the
 * record. Collapsing them into "unreachable" would invent failures that do not exist.
 *
 * AW-11 判据 #6：图级检查，输出是**走不到的 row type 清单**。
 *
 * 「每行 hash 有效、每个引用都能解析」的逐记录解析率无法区分真实链与「四行同引一个根」。能区分的是这个问题：
 * 从最权威的行类型出发，哪些行类型走不到？答案是**清单**，不是百分比 —— 百分比会把局部断掉的图读成健康。
 *
 * 走法只向前，且只沿存储边 `audit.write_claim_id`。绝不回落到「按工具名加时间」配对，也绝不反向穿过
 * `claim.audit_row_id`：没有正向边的行就报不可达，因为当时记下的就是这些。
 *
 * 占位行不可达即阻断通路。此时 `effect` 与 `confirmation` 也报不可达，原因单列为 `claim_unreachable`；
 * 省略它们会被读成下游 row type 一切正常。它们也不计入 `notApplicable` —— 占位行一旦够不到，
 * 它们本是否会适用就无法得知。
 *
 * `notApplicable` 刻意与 `unreachable` 分开。dry-run 的占位行本就没有副作用、自动写本就没有授权 ——
 * 那是关于这次动作的**真答案**，不是记录缺口。把它们并进「不可达」会造出不存在的失败。
 */
export interface ReachabilityRepos extends ForwardWalkRepos {
  /** Required here: without the effect table a missing row is indistinguishable from "not looked at". */
  effects: Repository<AiToolSideEffect>;
  /** Required here: without the confirmation table the same ambiguity would apply. */
  confirmations: Repository<AiConfirmationRequest>;
}

export interface ReachabilityGap {
  rowType: 'claim' | 'effect' | 'confirmation';
  count: number;
  /**
   * Distinct reasons, sorted. Each reason is a fact (`no_write_claim_id`, `claim_missing`,
   * `audit_row_missing`, `claim_unreachable`, `effect_missing`, `confirmation_missing`) — never a
   * merged "unknown". `claim_unreachable` means the path is blocked at the claim, not that an effect or
   * confirmation row itself is missing.
   *
   * 去重并排序的原因。每个原因是一个事实（`no_write_claim_id` / `claim_missing` / `audit_row_missing` /
   * `claim_unreachable` / `effect_missing` / `confirmation_missing`），从不合并成一个「未知」。
   * `claim_unreachable` 表示通路断在占位行，而不是副作用或确认行本身缺失。
   */
  reasons: string[];
}

export interface ReachabilityReport {
  /** Number of distinct audit row ids checked. */
  checked: number;
  /** Row types that could not be reached, in `claim` → `effect` → `confirmation` order. Empty = closed. */
  unreachable: ReachabilityGap[];
  /** Row types with nothing to reach for at least one record (dry-run / automatic write). */
  notApplicable: Array<{ rowType: 'effect' | 'confirmation'; count: number }>;
}

/**
 * Check forward reachability for a set of audit row ids.
 *
 * Duplicate ids count once. Every row starts at the audit row; the report aggregates how many records
 * could not reach each row type and why, plus how many had nothing to reach by design.
 *
 * 对一组审计行 id 做正向可达性检查。
 *
 * 重复 id 只计一次。每行都从审计行出发；报告聚合「多少条走不到哪个 row type、为什么」，以及多少条
 * 按设计就没有可走到的目标。
 */
export async function checkAuditReachability(
  auditRowIds: number[],
  repos: ReachabilityRepos,
): Promise<ReachabilityReport> {
  const ids = [...new Set(auditRowIds)];
  const gaps = new Map<ReachabilityGap['rowType'], { count: number; reasons: Set<string> }>();
  let effectNotApplicable = 0;
  let confirmationNotApplicable = 0;

  const markUnreachable = (rowType: ReachabilityGap['rowType'], reason: string): void => {
    const entry = gaps.get(rowType) ?? { count: 0, reasons: new Set<string>() };
    entry.count += 1;
    entry.reasons.add(reason);
    gaps.set(rowType, entry);
  };

  for (const id of ids) {
    const walk = await forwardWalkFromAuditRow(id, repos);

    if (walk.state === 'unlinked') {
      // `audit_row_missing` means the starting row itself is gone; it is still a claim-side gap.
      // The blocked path takes the downstream row types with it: reporting only `claim` would let a
      // reader conclude that effect and confirmation were fine. `claim_unreachable` says the path is
      // blocked here — not that those rows are missing — and `notApplicable` is deliberately not
      // incremented, because whether they would have applied is unknowable.
      // `audit_row_missing` 指起点行本身已不在；它仍归为 claim 侧的缺口。
      // 通路断在这里，下游 row type 一并算不可达：只报 `claim` 会让读者以为副作用与确认都没问题。
      // `claim_unreachable` 表示通路断在占位行，而不是那些行缺失；也**有意不**增加 `notApplicable`——
      // 占位行够不到时，它们本是否会适用无法得知。
      markUnreachable('claim', walk.reason);
      markUnreachable('effect', 'claim_unreachable');
      markUnreachable('confirmation', 'claim_unreachable');
      continue;
    }

    // Effect: null id means "no side effect to record" (dry-run) — not a gap.
    // 副作用：id 为 null 表示「本就没有副作用可记」（dry-run）—— 不是缺口。
    if (walk.claim.effectId == null) {
      effectNotApplicable += 1;
    } else if (!walk.effect) {
      markUnreachable('effect', 'effect_missing');
    }

    // Confirmation: null ref means "no authorization involved" (automatic write) — not a gap.
    // 确认：ref 为 null 表示「没有授权参与」（自动写）—— 不是缺口。
    if (walk.claim.authorizationRef == null) {
      confirmationNotApplicable += 1;
    } else if (!walk.confirmation) {
      markUnreachable('confirmation', 'confirmation_missing');
    }
  }

  const unreachable: ReachabilityGap[] = (['claim', 'effect', 'confirmation'] as const)
    .filter((rowType) => gaps.has(rowType))
    .map((rowType) => {
      const entry = gaps.get(rowType)!;
      return { rowType, count: entry.count, reasons: [...entry.reasons].sort() };
    });

  const notApplicable: ReachabilityReport['notApplicable'] = [];
  if (effectNotApplicable > 0) {
    notApplicable.push({ rowType: 'effect', count: effectNotApplicable });
  }
  if (confirmationNotApplicable > 0) {
    notApplicable.push({ rowType: 'confirmation', count: confirmationNotApplicable });
  }

  return { checked: ids.length, unreachable, notApplicable };
}
