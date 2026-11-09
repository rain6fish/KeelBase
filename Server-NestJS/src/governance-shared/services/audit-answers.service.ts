// SPDX-License-Identifier: Apache-2.0

import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiConfirmationRequest } from '../entities/ai-confirmation-request.entity';
import { AiToolSideEffect } from '../entities/ai-tool-side-effect.entity';
import { AiWriteClaim } from '../entities/ai-write-claim.entity';
import { revokeWindow } from '../../governance-core/revoke-staleness';
import {
  AuditQueryService,
  type AiAuditLogWithUser,
  type AuditReaderContext,
} from './audit-query.service';
import { explainState } from './audit-explanation-state';
import {
  ANSWER_HEADERS,
  productActionLabel,
  productAuthorizationLabel,
  productInitiatorLabel,
  productObjectCell,
  productObjectLabel,
  productResultLabel,
} from './audit-export-vocabulary';

export interface AnswerExportOptions {
  objectType?: string;
  objectId?: number;
  since?: Date;
  until?: Date;
  limit?: number;
}

/**
 * What a reader asks the export for: the six column headers, one row of six product words per
 * record, and one plain sentence about whether anything matched.
 *
 * 读者向导出要的东西：六个列头、每条记录一行六个产品词，以及一句白话说明有没有匹配。
 */
export interface AnswerMatrix {
  headers: string[];
  rows: string[][];
  match: {
    objectType: string | null;
    objectId: number | null;
    since: string | null;
    until: string | null;
    count: number;
    found: boolean;
    truncated: boolean;
    statement: string;
  };
}

/**
 * The six answers, derived from structured columns only.
 *
 * <p>Each cell reads a column, not prose: the audit row's `createdAt`, `tool`, `outcome` and
 * `username` snapshot; the effect reached through the claim; the confirmation reached through the
 * claim's `authorizationRef`. `detail` / `errorMessage` are never parsed — that parsing is what the
 * answer set exists to remove. The result cell reuses `explainState`, the same derivation the
 * single-event explanation shows, so the two views cannot disagree.
 *
 * <p><b>Bulk by construction.</b> The single-event explanation resolves one row at a time. This
 * export resolves claims, effects and confirmations in three `IN` queries for the whole page, so a
 * 500-row export is five queries rather than 500 × 4.
 *
 * 六问，只从结构化列推出。
 *
 * <p>每一格读的是一列，不是散文：审计行的 `createdAt` / `tool` / `outcome` / `username` 快照；经占位行
 * 到达的副作用行；经占位行 `authorizationRef` 到达的确认行。`detail` / `errorMessage` **从不解析**
 * —— 那正是本题集要消掉的解析。结果列复用 `explainState`，与单事件解释面同一处推导，故两个视图不会
 * 各说各的。
 *
 * <p><b>按批装配。</b> 单事件解释一行一行地解析；本导出对整页用三条 `IN` 查询取回占位行、副作用行与
 * 确认行，故 500 行导出是五次查询，而不是 500 × 4 次。
 */
@Injectable()
export class AuditAnswersService {
  constructor(
    private readonly auditQuery: AuditQueryService,
    @Optional()
    @InjectRepository(AiWriteClaim)
    private readonly claimsRepo?: Repository<AiWriteClaim>,
    @Optional()
    @InjectRepository(AiToolSideEffect)
    private readonly effectsRepo?: Repository<AiToolSideEffect>,
    @Optional()
    @InjectRepository(AiConfirmationRequest)
    private readonly confirmationsRepo?: Repository<AiConfirmationRequest>,
  ) {}

  /**
   * Build the matrix. `ids` is the object index's answer and is applied **before** paging, so a
   * page never contains a record the object filter did not select.
   *
   * 组装矩阵。`ids` 是对象索引给出的答案，在**分页之前**施加，故一页里不会有对象筛选没选中的记录。
   */
  async export(
    options: AnswerExportOptions,
    ids: number[] | undefined,
    reader?: AuditReaderContext,
  ): Promise<AnswerMatrix> {
    const limit = options.limit ?? 500;
    // One extra row tells us whether the page was cut short without a second count query.
    // 多取一行即可判断这一页有没有被截断，不必再发一条计数查询。
    const fetched = await this.auditQuery.getLogs(
      {
        ids,
        since: options.since,
        until: options.until,
        limit: limit + 1,
      },
      reader,
    );
    const truncated = fetched.length > limit;
    const rows = truncated ? fetched.slice(0, limit) : fetched;

    const evidence = await this._loadEvidence(rows);
    const answers = rows.map((row) => this._answer(row, evidence));

    return {
      headers: [...ANSWER_HEADERS],
      rows: answers,
      match: {
        objectType: options.objectType ?? null,
        objectId: options.objectId ?? null,
        since: options.since ? options.since.toISOString() : null,
        until: options.until ? options.until.toISOString() : null,
        count: answers.length,
        found: answers.length > 0,
        truncated,
        statement: this._statement(options, answers.length, truncated),
      },
    };
  }

  private async _loadEvidence(rows: AiAuditLogWithUser[]): Promise<{
    claims: Map<number, AiWriteClaim>;
    effects: Map<number, AiToolSideEffect>;
    confirmations: Map<string, AiConfirmationRequest>;
  }> {
    const claims = new Map<number, AiWriteClaim>();
    const effects = new Map<number, AiToolSideEffect>();
    const confirmations = new Map<string, AiConfirmationRequest>();
    if (rows.length === 0) return { claims, effects, confirmations };

    const claimRows = this.claimsRepo
      ? await this.claimsRepo.find({ where: { auditRowId: In(rows.map((r) => r.id)) } })
      : [];
    for (const claim of claimRows) {
      if (claim.auditRowId != null && !claims.has(claim.auditRowId)) {
        claims.set(claim.auditRowId, claim);
      }
    }

    const effectIds = [...new Set(claimRows.map((c) => c.effectId).filter((v): v is number => v != null))];
    if (effectIds.length && this.effectsRepo) {
      for (const effect of await this.effectsRepo.find({ where: { id: In(effectIds) } })) {
        effects.set(effect.id, effect);
      }
    }

    const tokens = [
      ...new Set(claimRows.map((c) => c.authorizationRef).filter((v): v is string => Boolean(v))),
    ];
    if (tokens.length && this.confirmationsRepo) {
      for (const confirmation of await this.confirmationsRepo.find({
        where: { token: In(tokens) },
      })) {
        confirmations.set(confirmation.token, confirmation);
      }
    }

    return { claims, effects, confirmations };
  }

  private _answer(
    row: AiAuditLogWithUser,
    evidence: {
      claims: Map<number, AiWriteClaim>;
      effects: Map<number, AiToolSideEffect>;
      confirmations: Map<string, AiConfirmationRequest>;
    },
  ): string[] {
    const claim = evidence.claims.get(row.id);
    const effect = claim?.effectId != null ? evidence.effects.get(claim.effectId) : undefined;
    const confirmation =
      claim?.authorizationRef != null
        ? evidence.confirmations.get(claim.authorizationRef)
        : undefined;

    const state = explainState({
      outcome: row.outcome,
      isError: row.isError,
      confirmationStatus: confirmation?.status ?? null,
      revokeStatus: effect?.revokeStatus ?? null,
      revokeWindow: effect ? revokeWindow(effect.revokeStatus, effect.revokeAcknowledgedAt) : null,
    });

    const authorizationShape = parseAuthorizationShape(row.authorization);

    return [
      formatUtc(row.createdAt),
      productActionLabel(row.tool, row.action),
      productResultLabel(state),
      productObjectCell(effect ? { resultType: effect.resultType, resultId: effect.resultId } : null),
      productAuthorizationLabel({
        confirmation: confirmation
          ? { status: confirmation.status, approverId: confirmation.approverId ?? null }
          : null,
        operatorName: row.username ?? null,
        denied: authorizationShape === 'denied',
        allowed: authorizationShape === 'allowed',
      }),
      productInitiatorLabel({ username: row.username, action: row.action, agentId: row.agentId }),
    ];
  }

  /**
   * The sentence a reader sees instead of an empty file. "No match" is an answer, so it is said in
   * words; a truncated page says so rather than looking complete.
   *
   * 读者看到的那句话 —— 代替一个空文件。「无匹配」是**答案**，所以用话说出来；被截断的一页也说出来，
   * 不让它看起来像完整的一页。
   */
  private _statement(
    options: AnswerExportOptions,
    count: number,
    truncated: boolean,
  ): string {
    const period = options.since || options.until ? ' in the selected period' : '';
    const subject =
      options.objectType && options.objectId != null
        ? ` for ${productObjectLabel(options.objectType)} #${options.objectId}`
        : '';
    const plural = (n: number) => (n === 1 ? 'record' : 'records');
    const head =
      count === 0
        ? `No matching records${subject}${period}.`
        : `${count} matching ${plural(count)}${subject}${period}.`;
    return truncated
      ? `${head} Showing the first ${options.limit ?? 500}; narrow the period or add an object.`
      : head;
  }
}

/**
 * `authorization` has two shapes and they mean opposite things: a JSON **array** is the deny
 * reasons (refused), a JSON **object** is the allow snapshot. Judged by shape, not by "non-empty"
 * — the same rule the `denied` list filter uses, so the two surfaces cannot disagree.
 *
 * `authorization` 有两种形状，意思相反：JSON **数组**是拒绝理由（被拒），JSON **对象**是放行快照。
 * 按**形状**判，不按「非空」判 —— 与列表 `denied` 滤器同一条规则，故两面不会各说各的。
 */
function parseAuthorizationShape(raw: string | null | undefined): 'denied' | 'allowed' | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return 'denied';
    if (parsed && typeof parsed === 'object') return 'allowed';
    return null;
  } catch {
    return null;
  }
}

/**
 * A stored instant, read without guessing its zone.
 *
 * <p>SQLite raw reads hand back TypeORM's own storage form — a UTC wall clock with **no** zone
 * marker (`2026-11-05 10:30:00`). `new Date(...)` parses that as *local* time, so on a +08 machine
 * every exported time came out eight hours early (observed in the e2e, not theorised). The stored
 * convention is UTC, so a zone-less value is read as UTC; a value that carries a zone is left to
 * the runtime.
 *
 * 一个已存下的时刻，不去猜它的时区。
 *
 * <p>SQLite 的裸读交回的是 TypeORM 自己的存储形式 —— 一个**没有**时区标记的 UTC 墙钟
 * （`2026-11-05 10:30:00`）。`new Date(...)` 会把它当**本地时间**解析，于是在 +08 的机器上，每个导出
 * 时间都早了八小时（e2e 里实测到，不是推想）。存储约定是 UTC，故无时区的值按 UTC 读；自带时区的值
 * 交给运行时。
 */
function parseAuditInstant(value: string | Date): Date {
  if (value instanceof Date) return value;
  const text = String(value).trim();
  const zoneLess = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/.exec(text);
  return zoneLess ? new Date(`${zoneLess[1]}T${zoneLess[2]}${zoneLess[3] ?? ''}Z`) : new Date(text);
}

/** `YYYY-MM-DD HH:MM:SS UTC` — readable, and unambiguous about which clock it is. */
function formatUtc(value: string | Date): string {
  const date = parseAuditInstant(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  );
}
