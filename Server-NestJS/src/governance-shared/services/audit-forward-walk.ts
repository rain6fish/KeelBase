// SPDX-License-Identifier: Apache-2.0

import type { Repository } from 'typeorm';
import { AiAuditLog } from '../entities/ai-audit-log.entity';
import { AiWriteClaim } from '../entities/ai-write-claim.entity';
import { AiToolSideEffect } from '../entities/ai-tool-side-effect.entity';
import { AiConfirmationRequest } from '../entities/ai-confirmation-request.entity';

/**
 * AW-11: one forward walk from the most authoritative row type.
 *
 * The evidence root walked backwards (`claim.audit_row_id`), which answers "what audit row triggered
 * this effect" but not "what did this audit row cause". `audit.write_claim_id` (AW-11) adds the other
 * direction, so the same walk now works from the audit row outward: audit → claim → effect and
 * confirmation.
 *
 * The walk is deliberately literal. If the forward edge is absent it says `unlinked`; it never falls
 * back to pairing by tool name plus time, and never re-derives the edge from `claim.audit_row_id` —
 * a historical row without the edge is a fact about what was recorded, not a puzzle to solve.
 *
 * AW-11：从最权威行类型出发的一次正向走。
 *
 * 证据根此前是反着走的（`claim.audit_row_id`），它能回答「这条副作用由哪条审计行触发」，却回答不了
 * 「这条审计行引起了什么」。`audit.write_claim_id`（AW-11）补上另一个方向，于是同一条走法现在可以从
 * 审计行往外走：审计 → 占位 → 副作用与确认。
 *
 * 走法是刻意字面的。正向边缺席就报 `unlinked`；它绝不回落到「按工具名加时间」去配对，也绝不拿
 * `claim.audit_row_id` 反推这条边 —— 没有边的历史行是关于「当时记下了什么」的事实，不是一道要猜的题。
 */
export interface ForwardWalkRepos {
  auditLogs: Repository<AiAuditLog>;
  claims: Repository<AiWriteClaim>;
  /** Optional: absent, the walk stops at the claim and reports `effect: null`. */
  effects?: Repository<AiToolSideEffect>;
  /** Optional: absent, the walk reports `confirmation: null` (the claim still names the token). */
  confirmations?: Repository<AiConfirmationRequest>;
}

export type ForwardWalk =
  | {
      state: 'unlinked';
      auditRowId: number;
      /** Why there is no reachable claim — each is a distinct fact, never merged into one "unknown". */
      reason: 'audit_row_missing' | 'no_write_claim_id' | 'claim_missing';
    }
  | {
      state: 'linked';
      auditRowId: number;
      claim: AiWriteClaim;
      effect: AiToolSideEffect | null;
      confirmation: AiConfirmationRequest | null;
    };

/**
 * Walk audit row → claim → effect / confirmation, reporting `unlinked` where the chain stops.
 *
 * `effect: null` and `confirmation: null` are real answers inside a `linked` walk: the claim may name
 * no side effect (dry-run), no authorization (an automatic write), or the corresponding repository may
 * not have been supplied.
 *
 * 走 审计行 → 占位行 → 副作用 / 确认行，链断在哪里就报 `unlinked` 到哪里。
 *
 * `linked` 里的 `effect: null` 与 `confirmation: null` 都是**真答案**：占位行可能没有副作用（dry-run）、
 * 没有授权（自动写），或者调用方没有提供对应仓库。
 */
export async function forwardWalkFromAuditRow(
  auditRowId: number,
  repos: ForwardWalkRepos,
): Promise<ForwardWalk> {
  const audit = await repos.auditLogs.findOne({ where: { id: auditRowId } });
  if (!audit) return { state: 'unlinked', auditRowId, reason: 'audit_row_missing' };
  if (!audit.writeClaimId) return { state: 'unlinked', auditRowId, reason: 'no_write_claim_id' };

  const claim = await repos.claims.findOne({ where: { id: audit.writeClaimId } });
  if (!claim) return { state: 'unlinked', auditRowId, reason: 'claim_missing' };

  const effect =
    claim.effectId != null && repos.effects
      ? ((await repos.effects.findOne({ where: { id: claim.effectId } })) ?? null)
      : null;
  const confirmation =
    claim.authorizationRef && repos.confirmations
      ? ((await repos.confirmations.findOne({ where: { token: claim.authorizationRef } })) ?? null)
      : null;

  return { state: 'linked', auditRowId, claim, effect, confirmation };
}
