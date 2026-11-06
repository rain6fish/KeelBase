// SPDX-License-Identifier: Apache-2.0

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAuditLog } from '../entities/ai-audit-log.entity';
import { AuditService } from './audit.service';
import { sortKeys } from '../../common/canonical-json';
import { OrgService } from '../../org/org.service';
import {
  auditScopeSql,
  resolveAuditReaderScope,
  type AuditReaderContext,
} from './audit-reader-scope';

/**
 * AW-12 — record-level review: who is responsible for reading audit records, how often, and whether
 * that reading actually happened.
 *
 * The receipt is **an audit row** (`action: 'audit_review'`), not a side table: a receipt outside the
 * chain can be added later, so «reviewed» would be a claim with no protection. On the same chain it is
 * covered by the same HMAC chain — deleting it breaks the following row's `prevHash`, and forging one
 * fails the row hash — and the unreviewed windows are computed by walking the chain.
 *
 * Which rows are covered is a **claim inside the row**, written into `detail` as canonical JSON, so the
 * claim itself is inside the hash payload. No second copy is stored in a column: a column out of the
 * payload could be rewritten without breaking the signature, which is exactly what this feature exists
 * to prevent. A receipt whose `detail` cannot be parsed is treated as **no receipt** (fail-closed) —
 * a malformed claim must not be read as «everything reviewed».
 *
 * The reviewer and the cadence are **configuration** (`AUDIT_REVIEW_OWNER`, `AUDIT_REVIEW_CADENCE_DAYS`),
 * never an oral convention: when an owner is configured, only that account may sign, and the coverage
 * statement reports an unassigned deployment as `unknown`.
 *
 * AW-12 —— 记录级复核：审计记录由谁负责读、多久读一次、这次读到底发生没有。
 *
 * 回执是**一条审计行**（`action: 'audit_review'`），不是旁表：链外的回执可以事后补写，于是「已复核」会是一个
 * 没有任何保护的说法。在同一条链上，它被同一条 HMAC 链覆盖 —— 删掉它会破掉下一行的 `prevHash`，伪造它会
 * 校验不过 —— 而未复核区间靠走这条链算出来。
 *
 * 「覆盖了哪些行」是**行内的声明**，以规范 JSON 写进 `detail`，故这条声明本身在 hash 载荷里。**不再存第二份
 * 列**：载荷之外的列可以被改写而不断签，而那正是本特性要防的事。`detail` 解析不出来的回执一律当**没有回执**
 * （fail-closed）—— 坏掉的声明绝不能被读成「全都复核过了」。
 *
 * 复核人与频度是**配置**（`AUDIT_REVIEW_OWNER`、`AUDIT_REVIEW_CADENCE_DAYS`），不是口头约定：配置了 owner
 * 时只有该账号能签，而未配置的部署会在覆盖声明里被报成 `unknown`。
 */

export const AUDIT_REVIEW_ACTION = 'audit_review';

export interface AuditReviewConfig {
  /** Both an owner and a cadence are present — the deployment actually assigned the reading. */
  configured: boolean;
  owner: string | null;
  cadenceDays: number | null;
}

export interface AuditReviewScopeClaim {
  fromId: number;
  throughId: number;
  cadenceDays: number | null;
}

export interface AuditReviewReceipt extends AuditReviewScopeClaim {
  id: number;
  reviewerId: string;
  reviewerName: string | null;
  signedAt: string;
}

export interface ReviewedRange {
  fromId: number;
  throughId: number;
}

export interface UnreviewedRange extends ReviewedRange {
  rows: number;
  firstRowAt: string | null;
}

export interface AuditReviewStatus {
  config: AuditReviewConfig;
  maxAuditId: number | null;
  totalRows: number;
  /** Rows a receipt can speak about — every audit row except the receipts themselves. */
  reviewableRows: number;
  reviewedRows: number;
  unreviewedRows: number;
  reviewedRanges: ReviewedRange[];
  unreviewedRanges: UnreviewedRange[];
  /** Most recent receipts, newest first. */
  receipts: AuditReviewReceipt[];
  /** Receipts whose claim could not be read; they cover nothing (fail-closed). */
  malformedReceipts: number;
  /** Set when `unreviewedRanges` was cut at `MAX_UNREVIEWED_RANGES`. */
  truncated: boolean;
}

const MAX_RECEIPTS_RETURNED = 50;
const MAX_UNREVIEWED_RANGES = 50;

function parseClaim(detail: string | null | undefined): AuditReviewScopeClaim | null {
  if (!detail) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as Record<string, unknown>;
  if (raw.kind !== AUDIT_REVIEW_ACTION) return null;
  const { fromId, throughId } = raw;
  if (!Number.isInteger(fromId) || !Number.isInteger(throughId)) return null;
  const from = fromId as number;
  const through = throughId as number;
  if (from < 1 || through < from) return null;
  const cadence = raw.cadenceDays;
  return {
    fromId: from,
    throughId: through,
    cadenceDays: typeof cadence === 'number' && Number.isFinite(cadence) ? cadence : null,
  };
}

/** Merge overlapping or adjacent ranges; input order does not matter. */
export function mergeRanges(ranges: ReviewedRange[]): ReviewedRange[] {
  const sorted = [...ranges].sort((a, b) => a.fromId - b.fromId || a.throughId - b.throughId);
  const merged: ReviewedRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.fromId <= last.throughId + 1) {
      last.throughId = Math.max(last.throughId, range.throughId);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** The parts of [1, maxId] not covered by `covered`. */
export function uncoveredRanges(covered: ReviewedRange[], maxId: number): ReviewedRange[] {
  const gaps: ReviewedRange[] = [];
  let next = 1;
  for (const range of covered) {
    if (range.fromId > next) gaps.push({ fromId: next, throughId: range.fromId - 1 });
    next = Math.max(next, range.throughId + 1);
    if (next > maxId) break;
  }
  if (next <= maxId) gaps.push({ fromId: next, throughId: maxId });
  return gaps;
}

@Injectable()
export class AuditReviewService {
  constructor(
    @InjectRepository(AiAuditLog) private readonly logRepo: Repository<AiAuditLog>,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    // Same optional dependency and the same tightening rule as the rest of the audit read side: an
    // auditor's window counts only their account's rows; an absent org module falls back to own rows.
    // 与审计读侧其余部分同一个可选依赖、同一条「只收紧」规则：读者的窗口只数本账号的行；没有组织模块时
    // 退回本人行。
    @Optional() private readonly orgService?: OrgService,
  ) {}

  reviewConfig(): AuditReviewConfig {
    const owner = (this.configService.get<string>('AUDIT_REVIEW_OWNER') ?? '').trim();
    const rawCadence = (this.configService.get<string>('AUDIT_REVIEW_CADENCE_DAYS') ?? '').trim();
    const cadence = rawCadence ? Number(rawCadence) : NaN;
    const cadenceDays = Number.isInteger(cadence) && cadence > 0 ? cadence : null;
    return {
      configured: Boolean(owner && cadenceDays),
      owner: owner || null,
      cadenceDays,
    };
  }

  /**
   * Sign a receipt for rows `[fromId, throughId]`. The range must already exist: a receipt that
   * claims to have read rows nobody wrote yet is not a review, it is a prediction.
   *
   * 为 `[fromId, throughId]` 签一张回执。区间必须在库里已经存在：一张声称读过「还没写下的行」的回执不是
   * 复核，是预言。
   */
  async record(
    reviewer: { id: number; username: string },
    claim: { fromId: number; throughId: number },
  ): Promise<AuditReviewReceipt> {
    const config = this.reviewConfig();
    if (config.owner && reviewer.username !== config.owner) {
      throw new ForbiddenException(
        `记录复核由 ${config.owner} 负责（AUDIT_REVIEW_OWNER）；/ record review is assigned to ${config.owner}`,
      );
    }
    const { fromId, throughId } = claim;
    if (!Number.isInteger(fromId) || !Number.isInteger(throughId) || fromId < 1 || throughId < fromId) {
      throw new BadRequestException('复核区间非法：需要 1 ≤ fromId ≤ throughId / invalid review range');
    }
    const maxId = await this.maxAuditId();
    if (maxId == null || throughId > maxId) {
      throw new BadRequestException(
        `复核区间越过链尾：throughId=${throughId}，当前最大 id=${maxId ?? 'none'} / review range is ahead of the chain`,
      );
    }

    const scope: Record<string, unknown> = {
      kind: AUDIT_REVIEW_ACTION,
      fromId,
      throughId,
      cadenceDays: config.cadenceDays,
    };
    const saved = await this.auditService.log({
      userId: String(reviewer.id),
      username: reviewer.username,
      action: AUDIT_REVIEW_ACTION,
      detail: JSON.stringify(sortKeys(scope)),
    });
    return {
      id: saved.id,
      reviewerId: String(reviewer.id),
      reviewerName: reviewer.username,
      signedAt: new Date(saved.createdAt).toISOString(),
      fromId,
      throughId,
      cadenceDays: config.cadenceDays,
    };
  }

  /**
   * The review state of the whole chain. Global on purpose, like `GET /audit/verify`: a receipt is an
   * attestation about chain positions and carries no personal data beyond the reviewer's own name.
   *
   * 整条链的复核状态。**有意取全局**，与 `GET /audit/verify` 同理：回执是对链位的事实陈述，除复核人自己的
   * 名字外不含个人数据。
   */
  async status(): Promise<AuditReviewStatus> {
    const config = this.reviewConfig();
    const receiptRows = await this.logRepo.find({
      where: { action: AUDIT_REVIEW_ACTION },
      order: { id: 'ASC' },
      take: 2000,
    });
    const receipts: AuditReviewReceipt[] = [];
    const covered: ReviewedRange[] = [];
    let malformed = 0;
    for (const row of receiptRows) {
      const claim = parseClaim(row.detail);
      if (!claim) {
        malformed++;
        continue;
      }
      covered.push({ fromId: claim.fromId, throughId: claim.throughId });
      receipts.push({
        id: row.id,
        reviewerId: row.userId,
        reviewerName: row.username ?? null,
        signedAt: new Date(row.createdAt).toISOString(),
        ...claim,
      });
    }
    const reviewedRanges = mergeRanges(covered);
    const maxAuditId = await this.maxAuditId();
    const totalRows = maxAuditId == null ? 0 : await this.logRepo.count();
    const receiptRowsCount = await this.logRepo.count({ where: { action: AUDIT_REVIEW_ACTION } });
    const reviewableRows = Math.max(0, totalRows - receiptRowsCount);

    const unreviewedRanges = await this.describeRanges(
      maxAuditId == null ? [] : uncoveredRanges(reviewedRanges, maxAuditId),
    );
    const reviewedRows = await this.countInRanges(reviewedRanges);

    return {
      config,
      maxAuditId,
      totalRows,
      reviewableRows,
      reviewedRows,
      unreviewedRows: Math.max(0, reviewableRows - reviewedRows),
      reviewedRanges,
      unreviewedRanges: unreviewedRanges.ranges,
      receipts: receipts.slice(-MAX_RECEIPTS_RETURNED).reverse(),
      malformedReceipts: malformed,
      truncated: unreviewedRanges.truncated,
    };
  }

  /**
   * How many rows **in this window** have no receipt covering them. The coverage statement reads this
   * one — the number is scoped like the rows the statement describes (AW-2).
   *
   * 这个窗口里有多少行**没有被任何回执覆盖**。覆盖声明读的就是它 —— 计数与声明所描述的行同一范围（AW-2）。
   */
  async unreviewedRowsInWindow(
    window: { since: Date; until: Date },
    reader?: AuditReaderContext,
  ): Promise<number> {
    const covered = mergeRanges(await this.coveredRanges());
    const scope = auditScopeSql(await resolveAuditReaderScope(reader, this.orgService));
    const total = await this.countWindow(window, scope);
    if (total === 0) return 0;
    let coveredInWindow = 0;
    for (const range of covered) {
      coveredInWindow += await this.countWindow(window, scope, range);
    }
    return Math.max(0, total - coveredInWindow);
  }

  /**
   * Whether a receipt covers this row. Used by the evidence root, whose package is about **one**
   * action — there the question is that row, not a window.
   *
   * 这一行有没有回执覆盖。证据根用它 —— 那个包只讲**一条**动作，问的是那一行，不是一个窗口。
   */
  async isRowCovered(rowId: number): Promise<boolean> {
    const ranges = mergeRanges(await this.coveredRanges());
    return ranges.some((range) => rowId >= range.fromId && rowId <= range.throughId);
  }

  private async coveredRanges(): Promise<ReviewedRange[]> {
    const rows = await this.logRepo.find({
      select: { detail: true },
      where: { action: AUDIT_REVIEW_ACTION },
      order: { id: 'ASC' },
      take: 2000,
    });
    const ranges: ReviewedRange[] = [];
    for (const row of rows) {
      const claim = parseClaim(row.detail);
      if (claim) ranges.push({ fromId: claim.fromId, throughId: claim.throughId });
    }
    return ranges;
  }

  private async countWindow(
    window: { since: Date; until: Date },
    scope: { sql: string; params: Record<string, unknown> } | null,
    range?: ReviewedRange,
  ): Promise<number> {
    const qb = this.logRepo
      .createQueryBuilder('log')
      .where('log.action != :reviewAction', { reviewAction: AUDIT_REVIEW_ACTION })
      .andWhere('log.createdAt >= :since', { since: window.since })
      .andWhere('log.createdAt <= :until', { until: window.until });
    if (range) qb.andWhere('log.id BETWEEN :rangeFrom AND :rangeThrough', {
      rangeFrom: range.fromId,
      rangeThrough: range.throughId,
    });
    if (scope) qb.andWhere(scope.sql, scope.params);
    return qb.getCount();
  }

  private async countInRanges(ranges: ReviewedRange[]): Promise<number> {
    let total = 0;
    for (const range of ranges) {
      total += await this.logRepo
        .createQueryBuilder('log')
        .where('log.action != :reviewAction', { reviewAction: AUDIT_REVIEW_ACTION })
        .andWhere('log.id BETWEEN :from AND :through', { from: range.fromId, through: range.throughId })
        .getCount();
    }
    return total;
  }

  private async describeRanges(
    ranges: ReviewedRange[],
  ): Promise<{ ranges: UnreviewedRange[]; truncated: boolean }> {
    const limited = ranges.slice(0, MAX_UNREVIEWED_RANGES);
    const out: UnreviewedRange[] = [];
    for (const range of limited) {
      // The chain gap may open on a receipt row (a receipt occupies a position but is not a record
      // to review). Report the span of the **records** inside the gap, not of the positions.
      // 链上的空隙可能从一条回执行开始（回执占一个链位，但它不是待复核的记录）。报空隙里**记录**的
      // 跨距，而不是链位的跨距。
      const qb = this.logRepo
        .createQueryBuilder('log')
        .select('COUNT(*)', 'rows')
        .addSelect('MIN(log.id)', 'minId')
        .addSelect('MAX(log.id)', 'maxId')
        .addSelect('MIN(log.createdAt)', 'firstRowAt')
        .where('log.action != :reviewAction', { reviewAction: AUDIT_REVIEW_ACTION })
        .andWhere('log.id BETWEEN :from AND :through', { from: range.fromId, through: range.throughId });
      const raw = await qb.getRawOne<{
        rows: string | number;
        minId: string | number | null;
        maxId: string | number | null;
        firstRowAt: string | null;
      }>();
      const rows = Number(raw?.rows ?? 0);
      if (rows === 0) continue;
      out.push({
        fromId: Number(raw?.minId),
        throughId: Number(raw?.maxId),
        rows,
        firstRowAt: raw?.firstRowAt ? new Date(raw.firstRowAt).toISOString() : null,
      });
    }
    return { ranges: out, truncated: ranges.length > MAX_UNREVIEWED_RANGES };
  }

  private async maxAuditId(): Promise<number | null> {
    const raw = await this.logRepo
      .createQueryBuilder('log')
      .select('MAX(log.id)', 'maxId')
      .getRawOne<{ maxId: string | number | null }>();
    const value = raw?.maxId;
    return value == null ? null : Number(value);
  }
}
