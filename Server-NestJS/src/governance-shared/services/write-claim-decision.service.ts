// SPDX-License-Identifier: Apache-2.0

import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import {
  AiWriteClaim,
  WRITE_CLAIM_DECISION_STATE,
  WRITE_CLAIM_STATUS,
} from '../entities/ai-write-claim.entity';
import { staleThresholdMinutes } from '../../governance-core/revoke-staleness';
import { TargetStatusLookupRow } from '../entities/target-status-lookup.entity';
import { AuditService } from './audit.service';

/**
 * AW-16 F-63/F-64: the write side of the governance workflow around a stuck hold.
 *
 * The read side (`WriteClaimQueryService`) states what the table says and never changes it. This
 * service is the only place that moves `decision_state`, and it moves it in exactly two ways:
 *
 * 1. **Expiry** (`sweepOverdue`) — the in-flight window ended. The row enters the pending-decision
 *    queue. `status` is untouched, so the row is still `claimed` and the truth is still unknown. No
 *    audit row: an automatic age transition is not a decision, and writing one hourly would say more
 *    than happened. This is also why expiry can never be read as a release: `released` means
 *    "confirmed not stored", and nothing here has that evidence.
 *
 * 2. **Release** (`release`) — a human closes the handling. The row becomes `closed_unknown`,
 *    `status` stays `claimed`, and the claim's key stays occupied. That is what "release is not
 *    permission to silently retry" means at the arbitration point: `claimWrite` sees `claimed` and
 *    refuses. Evidence (a written note, optionally an external reference) is required, and the act
 *    itself is one chained AI-audit row — no parallel ledger.
 *
 * Both paths are **conditional updates**: a concurrent settle, reconcile or release wins and this
 * service reports the current state instead of overwriting a real result.
 *
 * Beside those two state moves sits one recorder: `recordTargetRelease` writes the `claim_release` row
 * for a release the **target's answer** caused (the ledger was already moved by
 * `WriteClaimStore.reconcileClaim`). It changes no state. It exists because the hold row does not keep
 * this decision: a later re-claim reuses that row and clears its release columns, so the chained row is
 * the only place the decision survives.
 *
 * AW-16 F-63/F-64：滞留占位治理流程的**写侧**。
 *
 * 读侧（`WriteClaimQueryService`）只陈述表里写着什么、从不改它。本服务是唯一移动 `decision_state`
 * 的地方，且只以两种方式移动：
 *
 * 1. **到期**（`sweepOverdue`）—— 在途窗口结束，行进入待裁队列。`status` 一字不动，故行仍是
 *    `claimed`、真相仍未知。**不写审计行**：按年龄自动转换不是一次决定，每小时写一条会说得比发生的多。
 *    这也是到期永远不能被读成释放的原因：`released` 意为「确认未落库」，而这里没有任何这种证据。
 *
 * 2. **释放**（`release`）—— 人关闭处理。行转为 `closed_unknown`，`status` 仍是 `claimed`，占位的键
 *    仍被占住。这就是「释放不等于允许静默重试」在仲裁点的含义：`claimWrite` 看到 `claimed` 就拒绝。
 *    释放须附证据（书面说明，可选外部引用），动作本身写**一条**带链的 AI 审计行 —— 不新造平行账本。
 *
 * 两条路径都是**条件更新**：并发的落定 / 对账 / 释放占先时，本服务如实报当前状态，而不覆盖真实结果。
 *
 * 与那两次状态搬迁并列的还有一个记录器：`recordTargetRelease` 为**目标回答**引起的释放写 `claim_release`
 * 行（账已由 `WriteClaimStore.reconcileClaim` 移过）。它不改任何状态。它存在的理由是占位行留不住这份决定：
 * 后续重占位会复用那一行并清掉它的释放列，故带链的这一行是决定唯一留得住的地方。
 */
@Injectable()
export class WriteClaimDecisionService {
  /**
   * F-85b: how many of the most recent readings the release row carries. Three because the question a
   * reviewer asks of a released hold is "did we ask, and what did it say" — the latest few answer it
   * without turning one audit row into a copy of the whole history (`/lookups` still serves that).
   *
   * F-85b：释放行里带最近几次读数，取三。审阅者对一条已释放占位要问的是「问过没有、它怎么答的」——
   * 最近几次足以回答，又不至于把一条审计行变成整份历史的副本（整份历史仍由 `/lookups` 提供）。
   */
  private static readonly RELEASE_DETAIL_LOOKUPS = 3;

  constructor(
    @InjectRepository(AiWriteClaim) private readonly claimsRepo: Repository<AiWriteClaim>,
    /**
     * AW-17 / F-85b: the lookup evidence trail. **Not optional**, for the same reason the read side
     * made it required: an absent store would make every release row say "never queried", which is a
     * claim about the record rather than about the wiring. A missing repository is a wiring bug.
     *
     * AW-17 / F-85b：查询证据历史。**不是可选的**，理由与读侧相同：仓储缺席会让每条释放行都说
     * 「未查询」—— 那是关于记录的一句话，而不是关于接线的。缺仓储是接线缺陷。
     */
    @InjectRepository(TargetStatusLookupRow)
    private readonly lookupsRepo: Repository<TargetStatusLookupRow>,
    private readonly auditService: AuditService,
    // Optional like every other threshold reader: a hand-built assembly falls back to the Joi default.
    // 与其他阈值读取处一样是可选的：手工装配的场合回落到 Joi 默认值。
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /**
   * F-64: move every `claimed` + `open` row whose window has ended into the pending-decision queue.
   *
   * `claimed_at < cut` uses the same threshold as `stale` / `listStaleClaims` — one ruler for the
   * whole screen. A row already in the queue, already closed, or no longer `claimed` is left alone.
   *
   * F-64：把每一行「仍 claimed + open 且窗口已结束」的占位移入待裁队列。
   *
   * `claimed_at < cut` 与 `stale` / `listStaleClaims` 用同一阈值 —— 整块屏只用一把尺子。已在队列、
   * 已关闭、或不再是 `claimed` 的行不动。
   */
  async sweepOverdue(
    thresholdMinutesOverride?: number,
  ): Promise<{ moved: number; thresholdMinutes: number }> {
    const thresholdMinutes =
      thresholdMinutesOverride ??
      staleThresholdMinutes(this.configService?.get<number>('REVOKE_STALE_MINUTES'));
    const cut = new Date(Date.now() - thresholdMinutes * 60_000);
    const res = await this.claimsRepo
      .createQueryBuilder()
      .update(AiWriteClaim)
      .set({ decisionState: WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION })
      .where('status = :status', { status: WRITE_CLAIM_STATUS.CLAIMED })
      .andWhere('decision_state = :open', { open: WRITE_CLAIM_DECISION_STATE.OPEN })
      .andWhere('claimed_at < :cut', { cut })
      .execute();
    return { moved: res.affected ?? 0, thresholdMinutes };
  }

  /**
   * F-63: release a stuck hold, with evidence, and record the act once.
   *
   * Refusals are reported by kind rather than as one `false`, because they mean different things to
   * the person working the queue: `not_found` (no such row), `not_claimable` (already settled or
   * released by the execution path), `not_stale` (still inside its window — nothing to release yet),
   * `already_closed` (a previous release already closed it; no second audit row is written).
   *
   * F-63：释放滞留占位，附证据，并把这次动作记录一次。
   *
   * 拒绝按种类报出，而不是一个 `false` —— 对处理队列的人而言它们含义不同：`not_found`（没有这一行）、
   * `not_claimable`（执行路径已落定或已释放）、`not_stale`（仍在窗口内，还谈不上释放）、
   * `already_closed`（此前已释放；不再写第二条审计行）。
   */
  async release(
    claimId: number,
    actor: { userId: string; username?: string },
    input: ReleaseClaimInput,
  ): Promise<ReleaseClaimResult> {
    const claim = await this.claimsRepo.findOne({ where: { id: claimId } });
    if (!claim) {
      return { outcome: 'not_found', claimId, toolName: null, status: null, decisionState: null, auditRowId: null };
    }

    const thresholdMinutes = staleThresholdMinutes(
      this.configService?.get<number>('REVOKE_STALE_MINUTES'),
    );
    const cutoff = Date.now() - thresholdMinutes * 60_000;

    if (claim.status !== WRITE_CLAIM_STATUS.CLAIMED) {
      return this.refusal('not_claimable', claim);
    }
    if (claim.decisionState === WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN) {
      return this.refusal('already_closed', claim);
    }
    if (claim.claimedAt.getTime() > cutoff) {
      return this.refusal('not_stale', claim);
    }

    // F-85b: what was asked of the target, and what it answered, belongs on the decision row itself.
    // Read **before** the conditional update: if this read fails, the path leaves nothing half-done —
    // the claim keeps its state and no audit row is missing. Read after the update it would, and the
    // ledger would claim a decision whose record does not exist.
    //
    // F-85b：问过目标什么、它怎么答的，要落在决定行本身。在条件更新**之前**读取：读失败时这条路径
    // 什么都没留下 —— 占位保持原状、也没有「缺了记录的决定」。放到更新之后，就会留下一条有决定、无记录的账。
    const evidence = await this._releaseEvidence(claim);

    // Conditional on both the status and the handling state: a concurrent settle/reconcile wins this
    // write, and we report what actually happened rather than stamping over it.
    // 同时以状态与处置状态为条件：并发的落定 / 对账赢下这次写，我们如实报出实际发生的事，而不是盖掉它。
    const res = await this.claimsRepo.update(
      {
        id: claim.id,
        status: WRITE_CLAIM_STATUS.CLAIMED,
        decisionState: In([
          WRITE_CLAIM_DECISION_STATE.OPEN,
          WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION,
        ]),
      },
      {
        decisionState: WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN,
        releaseReason: 'manual_release_unknown',
      },
    );
    if ((res.affected ?? 0) === 0) {
      const after = await this.claimsRepo.findOne({ where: { id: claim.id } });
      return after
        ? this.refusal(
            after.decisionState === WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN
              ? 'already_closed'
              : 'not_claimable',
            after,
          )
        : this.refusal('not_found', claim);
    }

    // The act itself is the record. Awaited, and a failure is reported rather than swallowed: the
    // state change already happened, and pretending it was silent would be the worse lie.
    // 动作本身即记录。await 且不吞失败：状态已经改了，假装它没发生过是更糟的谎言。
    const auditRowId = await this._writeReleaseRow(
      claim,
      actor,
      this._detail(claim, input, evidence.lookupCount),
      evidence,
    );

    return {
      outcome: 'released_unknown',
      claimId: claim.id,
      toolName: claim.toolName,
      status: WRITE_CLAIM_STATUS.CLAIMED,
      decisionState: WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN,
      auditRowId,
    };
  }

  /**
   * R-3: record the release a **target's answer** caused. The ledger was already moved
   * (`reconcileClaim` → `released`); this writes the same `claim_release` row a manual release
   * writes, through the same builder, with a `detail` that says who initiated it, what the target
   * answered, and that the hold is released and re-claimable while the effect stays unknown.
   *
   * Why a row at all: a re-claim reuses the hold row and clears `status` / `releaseReason` /
   * `claimedAt`, so without a chained row the decision would vanish with the hold. The row is written
   * **after** the conditional update succeeded — writing it first could record a release that lost a
   * race, and a failure here is loud for the same reason as the manual path.
   *
   * The row's `userId` is the initiator: `system:sweep` for the automatic pass, the administrator's id
   * for a manual reconcile. Whose identity the write itself carried is the original writer, named in
   * the `detail` — the two facts are separate everywhere else in this feature and stay separate here.
   *
   * R-3：记录一次由**目标回答**引起的释放。账已经移过（`reconcileClaim` → `released`）；这里用与人工
   * 释放**同一个构造器**写同一种 `claim_release` 行，`detail` 写明谁发起、目标答了什么、占位已释放且
   * 可重占位、效果仍未知。
   *
   * 为什么非要一行：重占位会复用占位行并清掉 `status` / `releaseReason` / `claimedAt`，没有带链的行，
   * 这份决定就随占位一起消失。这一行写在条件更新**成功之后** —— 先写可能记下一次输掉竞争的释放；这里
   * 失败要大声，理由与人工路径相同。
   *
   * 行的 `userId` 是发起方：自动清扫记 `system:sweep`，人工对账记管理员 id。这次写本身携带的是原写入者的
   * 身份，名字写在 `detail` 里 —— 本特性别处也把这两件事分开，这里同样分开。
   */
  async recordTargetRelease(
    claim: ReleaseClaimRef,
    trigger: TargetReleaseTrigger,
  ): Promise<number> {
    const evidence = await this._releaseEvidence(claim);
    return this._writeReleaseRow(claim, { userId: trigger.byUserId }, this._targetDetail(claim, trigger, evidence.lookupCount), evidence);
  }

  /**
   * F-85b: the evidence a release row carries — how many asks, and the newest three readings, as data
   * for the off-chain column. The prose names the count; the column says which. A reviewer closing the
   * case needs the evidence in the same place as the decision — otherwise "asked and got nothing" and
   * "never asked" read alike from the audit trail. This is a reading, not a gate: a hold is releasable
   * after zero asks (a target without a status endpoint would otherwise never be releasable).
   *
   * F-85b：释放行携带的证据 —— 问过几次、最近三次读数是什么，以数据形式进链外列。散文说次数，这一列说
   * 是哪几次。收案的人需要证据与决定在同一处 —— 否则从审计轨迹上看，「问过没答案」与「从没问过」长得一样。
   * 这是读数、不是门槛：一次没问也照样可释放（否则没有状态端点的目标将永远无法释放）。
   */
  private async _releaseEvidence(
    claim: Pick<AiWriteClaim, 'idempotencyKey'>,
  ): Promise<{ lookupCount: number; releaseLookups: string }> {
    const key = { idempotencyKey: claim.idempotencyKey };
    // Sequential, not `Promise.all`: a synchronous throw from the second call would leave the first
    // promise unhandled. One extra round trip on a rare path is cheaper than that failure mode.
    // 顺序读取，不用 `Promise.all`：第二个调用若同步抛出，第一个 promise 会变成未处理的拒绝。这条
    // 稀有路径上多一次往返，比那种失败形态便宜。
    const lookupCount = await this.lookupsRepo.count({ where: key });
    const recentLookups = await this.lookupsRepo.find({
      where: key,
      order: { at: 'DESC', id: 'DESC' },
      take: WriteClaimDecisionService.RELEASE_DETAIL_LOOKUPS,
    });
    return {
      lookupCount,
      releaseLookups: JSON.stringify({
        count: lookupCount,
        items: recentLookups.map((l) => ({
          at: l.at.toISOString(),
          conclusion: l.conclusion,
          reason: l.reason ?? null,
          lookedUpBy: l.lookedUpBy,
        })),
      }),
    };
  }

  /**
   * The one write point for a `claim_release` row, manual or target-driven. The shape lives here once
   * (R-3): two release paths must not grow two spellings of the same record.
   *
   * `claim_release` 行的唯一写入点，人工与目标驱动共用。形状只在这里写一遍（R-3）：两条释放路径不得
   * 长出同一份记录的两种写法。
   */
  private async _writeReleaseRow(
    claim: ReleaseClaimRef,
    actor: { userId: string; username?: string },
    detail: string,
    evidence: { releaseLookups: string },
  ): Promise<number> {
    const audit = await this.auditService.log({
      userId: actor.userId,
      username: actor.username,
      action: 'claim_release',
      // The tool this hold belongs to — so the row can be filtered by tool without parsing `detail`.
      // 这份占位所属的工具 —— 于是按工具筛选不必解析 `detail`。
      tool: claim.toolName,
      // No `outcome`: this row is not a tool verdict, and the conclusion deliberately stays unknown.
      // 不传 `outcome`：这一行不是工具结局，而结论有意保持未知。
      detail,
      // F-85b: the readings as data, off-chain — the prose says how many, this says which.
      // F-85b：读数以数据形式落库、且在链外 —— 散文说几次，这里说哪几次。
      releaseLookups: evidence.releaseLookups,
      source: 'claim_release',
    });
    return audit.id;
  }

  private refusal(
    outcome: Exclude<ReleaseClaimOutcome, 'released_unknown'>,
    claim: AiWriteClaim,
  ): ReleaseClaimResult {
    return {
      outcome,
      claimId: claim.id,
      toolName: claim.toolName,
      status: claim.status,
      decisionState: claim.decisionState ?? null,
      auditRowId: null,
    };
  }

  /**
   * F-85b: the decision row carries the readings that justify it — how often the target was asked and
   * what the latest asks said. "Never asked" is written out in words, so an absent history cannot be
   * read as a silent default; every reading names its conclusion, its cause when `unknown`, and who
   * asked, so the row answers "who found out, and how" without a join.
   *
   * F-85b：决定行带上支撑它的读数 —— 目标被问过几次、最近几次怎么答的。「从未问过」**明写**出来，
   * 于是空历史不会被当默认值读过去；每条读数都点名结论、`unknown` 时的成因、以及谁问的，于是这一行
   * 不必联接就能回答「谁查清楚、怎么查的」。
   */
  private _detail(
    claim: ReleaseClaimRef,
    input: ReleaseClaimInput,
    lookupCount: number,
  ): string {
    const evidence = input.evidenceRef ? `; evidence: ${input.evidenceRef}` : '';
    return `release write claim #${claim.id} (${claim.toolName}, as user ${claim.userId}) → closed_unknown; note: ${input.note}${evidence}; ${this._lookupPhrase(lookupCount)}`;
  }

  /**
   * R-3: the target-driven release row. It must answer, without a join and without parsing the
   * evidence column: **who initiated** (the automatic sweep or a person), **what the target
   * answered**, that the hold is **released and re-claimable**, and that the **effect stays unknown** —
   * while ruling out the one wrong reading, "nothing was ever attempted". The readings' times are in
   * `releaseLookups` (`at`), the count is in this prose.
   *
   * R-3：目标驱动的释放行。它必须无需联接、无需解析证据列就能回答：**谁发起**（自动清扫还是人）、
   * **目标答了什么**、占位**已释放且可重占位**、**效果仍未知** —— 同时排除唯一一种误读「什么都没试过」。
   * 读数的时间在 `releaseLookups`（`at`）里，次数在这段散文里。
   */
  private _targetDetail(
    claim: ReleaseClaimRef,
    trigger: TargetReleaseTrigger,
    lookupCount: number,
  ): string {
    // Who initiated and whose identity the write carried are two facts; the detail keeps them apart.
    // 谁发起与这次写携带的是谁的身份是两件事；detail 把它们分开写。
    const initiator = trigger.automatic
      ? `${trigger.byUserId} (automatic sweep)`
      : `user ${trigger.byUserId} (manual reconcile)`;
    return (
      `release write claim #${claim.id} (${claim.toolName}, as user ${claim.userId}) → released; ` +
      `origin: target answered ${trigger.conclusion} (${trigger.queryMethod} ${trigger.queryPath} at ${trigger.queriedAt}); ` +
      `initiated by: ${initiator}; ${this._lookupPhrase(lookupCount)}; ` +
      `released for re-claim, effect unknown — the write was attempted; this is a release of the hold, not a finding that nothing happened`
    );
  }

  /**
   * F-85b: the count stays in prose (a person reading the row needs it), the readings themselves go
   * to the structured column — one place, not two spellings of the same list.
   *
   * F-85b：次数留在散文里（读行的人要先知道问过几次），读数本身进结构化列 —— 一份数据，不写两遍。
   */
  private _lookupPhrase(lookupCount: number): string {
    return lookupCount === 0
      ? 'lookups: none (never queried)'
      : `lookups: ${lookupCount} asked (see releaseLookups)`;
  }
}

/** The hold fields a release row names. Every release path already holds a full `AiWriteClaim`. */
type ReleaseClaimRef = Pick<AiWriteClaim, 'id' | 'idempotencyKey' | 'toolName' | 'userId'>;

/**
 * R-3: the facts a target-driven release row is built from — who initiated, and what the one-shot
 * query answered. `automatic` is decided by the caller that owns the scheduler's identity, so this
 * service never has to know that `system:sweep` means "not a person".
 *
 * R-3：目标驱动释放行所依据的事实 —— 谁发起、那次一次性查询答了什么。`automatic` 由持有调度器身份的
 * 调用方判定，故本服务不必知道 `system:sweep` 意味着「不是人」。
 */
export interface TargetReleaseTrigger {
  /** `system:sweep` for the automatic pass; the administrator's id for a manual reconcile. */
  byUserId: string;
  /** True when the hourly sweep asked. / 每小时清扫发起时为 true。 */
  automatic: boolean;
  /** The answer that converged the ledger — only `not_executed` reaches here. / 让账收敛的答案。 */
  conclusion: 'not_executed';
  /** The query actually sent. / 真正发出的查询。 */
  queryMethod: string;
  queryPath: string;
  /** ISO 8601, from the lookup itself. / 查询自身的时刻（ISO 8601）。 */
  queriedAt: string;
}

export interface ReleaseClaimInput {
  /** Why the hold is being released — required, recorded verbatim on the audit row. / 为何释放，必填，原样记入审计行。 */
  note: string;
  /** Optional external reference (ticket, lookup id, log URL). / 可选外部引用（工单、对账 id、日志地址）。 */
  evidenceRef?: string;
}

export type ReleaseClaimOutcome =
  | 'released_unknown'
  | 'not_found'
  | 'not_claimable'
  | 'not_stale'
  | 'already_closed';

export interface ReleaseClaimResult {
  outcome: ReleaseClaimOutcome;
  claimId: number;
  toolName: string | null;
  /** The claim's execution status **after** the call — `claimed` for a release (the truth is unknown). */
  status: string | null;
  decisionState: string | null;
  /** The AI-audit row that records the act; `null` when the call was refused. / 记录本次动作的 AI 审计行；被拒时为 null。 */
  auditRowId: number | null;
}
