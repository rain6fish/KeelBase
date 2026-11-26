// SPDX-License-Identifier: Apache-2.0

import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  AiWriteClaim,
  WRITE_CLAIM_DECISION_STATE,
  WRITE_CLAIM_STATUS,
} from '../entities/ai-write-claim.entity';
import { staleThresholdMinutes } from '../../governance-core/revoke-staleness';
import { TargetStatusLookupRow } from '../entities/target-status-lookup.entity';
import { AuditService } from './audit.service';
import { TARGET_STATUS_PROBE } from './tool-effects.types';
import type { TargetStatusProbe } from './tool-effects.types';

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
 * R-4: a release is bound to the **view** the reviewer acted on — the governance disposition and the
 * newest reading the screen showed. If the ledger has moved since, the release is refused with
 * `stale_view` **and the refusal is itself a row**, so the screen and the ledger cannot disagree
 * silently. Where that row lives, and why: the **same chain and the same `claim_release` action** as
 * the release it refused — one act, the opposite ending. Another chain would put one act's two endings
 * on two ledgers; a new action would change the contract's closed enum. `outcome` stays absent (the
 * frozen vocabulary defines no word for this action), so the ending is stated in `detail`, which opens
 * with `release refused (stale_view)`. Filtering by ending from the audit row alone is therefore not
 * offered — a deferred structured change under the same rule the release kinds follow (structure only
 * once a consumer must act on the audit row alone).
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
 *
 * R-4：释放绑定在审阅者当时看到的**视图**上 —— 治理处置与屏幕显示的最近一次读数。若账本此后已变动，
 * 释放以 `stale_view` 拒绝，**且拒绝本身就是一行**，于是屏幕与账本不会静默地各说各话。这一行落在哪里、
 * 为什么：与它拒绝的那次释放**同一条链、同一个 `claim_release` 动作** —— 一次动作、相反的结局。换一条链
 * 会把一次动作的两个结局分到两本账上；新增动作则要改契约的闭合枚举。`outcome` 保持不写（冻结词表没有为
 * 这个动作定义任何词），故结局写在 `detail` 里，开头就是 `release refused (stale_view)`。因此「只读审计行
 * 就按结局筛选」这件事没有提供 —— 那是推迟到有消费者时的结构化改动，与释放种类遵循同一条规则。
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
    /**
     * R-6: "can this tool be asked at all?" — the same question the in-flight read surface answers as
     * `reconcilable`. Optional for the same reason it is there: the governance process has no outbound
     * targets, so "cannot ask" is its true reading. A hand-built assembly that leaves it out records
     * the count and leaves askability `null`; it never invents either answer.
     *
     * R-6：「这个工具到底能不能问」—— 与在途读面 `reconcilable` 回答的是同一个问题。可选的理由同读面：
     * 治理进程没有出站目标，那里「问不了」就是真实读数。手工装配若不带它，则照记次数、把可问性留作
     * `null`，绝不臆断任一答案。
     */
    @Optional()
    @Inject(TARGET_STATUS_PROBE)
    private readonly statusProbe?: TargetStatusProbe,
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
   * `already_closed` (a previous release already closed it; no second release row is written), and
   * `stale_view` (R-4: the ledger moved after the reviewer's screen was read — the **refusal itself**
   * is recorded as a row).
   *
   * F-63：释放滞留占位，附证据，并把这次动作记录一次。
   *
   * 拒绝按种类报出，而不是一个 `false` —— 对处理队列的人而言它们含义不同：`not_found`（没有这一行）、
   * `not_claimable`（执行路径已落定或已释放）、`not_stale`（仍在窗口内，还谈不上释放）、
   * `already_closed`（此前已释放；不再写第二条释放行），以及 `stale_view`（R-4：审阅者的屏幕读完之后
   * 账本变动了 —— **拒绝本身**也会记成一行）。
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

    // F-85b: what was asked of the target, and what it answered, belongs on the decision row itself.
    // Read **before** anything is written: if this read fails, the path leaves nothing half-done —
    // the claim keeps its state and no audit row is missing. Read after the write it would, and the
    // ledger would claim a decision whose record does not exist. R-4 also takes the newest reading's
    // id from here: the view the reviewer froze names that reading, so it is the comparison key.
    //
    // F-85b：问过目标什么、它怎么答的，要落在决定行本身。在任何写入**之前**读取：读失败时这条路径
    // 什么都没留下 —— 占位保持原状、也没有「缺了记录的决定」。放到写入之后，就会留下一条有决定、无记录的账。
    // R-4 也从这里取最近一次读数的 id：审阅者冻结的视图点名了那条读数，故它就是比对键。
    const evidence = await this._releaseEvidence(claim);

    // R-4: the release must still match the view the reviewer acted on. Checked first — once the view
    // no longer describes the row, every later answer would be about a row nobody looked at.
    // R-4：释放必须仍与审阅者当时看到的视图一致。先查这一条 —— 视图一旦不再描述这一行，后面任何答案
    // 说的都是没人看过的那一行。
    const moved = this._movedSinceView(input.view, claim, evidence.latestLookupId);
    if (moved) {
      const auditRowId = await this._writeReleaseRow(
        claim,
        actor,
        this._refusalDetail(claim, input, evidence, moved),
        null,
      );
      return this.refusal('stale_view', claim, auditRowId);
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

    // Conditional on the status **and on the disposition the reviewer saw**: a concurrent settle,
    // reconcile or sweep wins this write, and we report what actually happened rather than stamping
    // over it. R-4 narrowed this condition — accepting both `open` and `awaiting_decision` is what let
    // a sweep move the row underneath the screen without the release noticing.
    // 同时以状态与**审阅者看到的处置**为条件：并发的落定 / 对账 / 清扫赢下这次写，我们如实报出实际发生
    // 的事，而不是盖掉它。R-4 收窄了这个条件 —— 原来同时接受 `open` 与 `awaiting_decision`，正是清扫把行
    // 在屏幕下面移走、释放却毫无察觉的原因。
    const res = await this.claimsRepo.update(
      {
        id: claim.id,
        status: WRITE_CLAIM_STATUS.CLAIMED,
        decisionState: input.view.decisionState,
      },
      {
        decisionState: WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN,
        releaseReason: 'manual_release_unknown',
      },
    );
    if ((res.affected ?? 0) === 0) {
      const after = await this.claimsRepo.findOne({ where: { id: claim.id } });
      if (!after) return this.refusal('not_found', claim);
      if (after.decisionState !== input.view.decisionState) {
        // The row moved between the check above and this write. Same meaning as a stale view, so it
        // gets the same answer and the same row — with the readings read **again**, because the
        // earlier read predates the move and the row must state what the ledger holds now.
        // 行在上面的检查与这次写之间动了。含义与陈旧视图相同，故同一个答案、同一行记录 —— 读数**重新**
        // 读一次，因为先前那次读早于这次移动，行里必须写账本现在的事实。
        const now = await this._releaseEvidence(after);
        const auditRowId = await this._writeReleaseRow(
          after,
          actor,
          this._refusalDetail(after, input, now, 'decisionState'),
          null,
        );
        return this.refusal('stale_view', after, auditRowId);
      }
      return this.refusal(
        after.decisionState === WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN
          ? 'already_closed'
          : 'not_claimable',
        after,
      );
    }

    // The act itself is the record. Awaited, and a failure is reported rather than swallowed: the
    // state change already happened, and pretending it was silent would be the worse lie.
    // 动作本身即记录。await 且不吞失败：状态已经改了，假装它没发生过是更糟的谎言。
    const auditRowId = await this._writeReleaseRow(
      claim,
      actor,
      this._detail(claim, input, evidence),
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
    // The target answered, so a zero lookup count here is a **missing record**, not "never asked".
    // The target answered ⇒ 这里读数为零意味着**记录缺失**，不是「从未问过」。
    const evidence = await this._releaseEvidence(claim, { targetAnswered: true });
    return this._writeReleaseRow(claim, { userId: trigger.byUserId }, this._targetDetail(claim, trigger, evidence), evidence);
  }

  /**
   * F-85b: the evidence a release row carries — how many asks, and the newest three readings, as data
   * for the off-chain column. The prose names the count; the column says which. A reviewer closing the
   * case needs the evidence in the same place as the decision — otherwise "asked and got nothing" and
   * "never asked" read alike from the audit trail. This is a reading, not a gate: a hold is releasable
   * after zero asks (a target without a status endpoint would otherwise never be releasable).
   *
   * R-6: zero asks is **two** facts, not one — "we could have asked and did not" versus "there is no
   * usable status query to ask with". The column carries `askable` beside `count`, so the three cases
   * (asked N / askable but never asked / not askable) are readable and countable without parsing the
   * prose. It is `null` when no probe is wired here: unknown askability is not "not askable".
   *
   * R-3 follow-up (F-123–F-127): the copy is the **boundary** of the history, not the history. Every
   * copied entry carries the reading row's own `id`, so a decision row resolves back to the rows it
   * names; without it the copy restates their values with no way home, and a review-time query would
   * answer what the readings say *now*, not what the decider saw (F-121). Each entry holds only
   * observed fields — no derived value, no grade — so a copy can never compete with its source for
   * authority (F-125). The newest entry's id is the **watermark**: any larger id was written after the
   * decision (F-127). The count and the newest three are read in **one statement** (`COUNT(*) OVER ()`
   * with a `LIMIT`, a single SQL snapshot), because two reads let a concurrent automatic ask land
   * between them and leave the row disagreeing with itself by one.
   *
   * This copy stays honest only while the lookup table is **append-only** — one insert path, no
   * update, delete or retention path (F-126). If pruning is ever added, the rows an audit row names
   * must be retained, or the copied id dangles: a decision row would then point at a reading no one
   * can produce.
   *
   * R-6b: a target-driven row whose lookup row is missing adds `recorded: false` to the column — the
   * target answered but its reading was not recorded, which is neither "never asked" nor "not askable".
   *
   * R-6b：目标驱动的行若读数行缺失，列里多带 `recorded: false` —— 目标答过、但这次读数没记下；
   * 既不是「从未问过」，也不是「问不了」。
   *
   * F-85b：释放行携带的证据 —— 问过几次、最近三次读数是什么，以数据形式进链外列。散文说次数，这一列说
   * 是哪几次。收案的人需要证据与决定在同一处 —— 否则从审计轨迹上看，「问过没答案」与「从没问过」长得一样。
   * 这是读数、不是门槛：一次没问也照样可释放（否则没有状态端点的目标将永远无法释放）。
   *
   * R-6：次数为零是**两件**事，不是一件 ——「本来能问、没去问」与「根本没有可用的状态查询可问」。这一列
   * 在 `count` 旁带 `askable`，于是三态（问过 N 次 / 可问但没问 / 问不了）无需解析散文即可读出与计数。
   * 本进程没接探针时记 `null`：可问性未知不等于「问不了」。
   *
   * R-3 后续（F-123–F-127）：拷贝记的是历史的**边界**，不是历史本身。每条拷贝带上读数行自己的 `id`，
   * 于是决定行能解析回它点名的那些行；没有它，拷贝复述了值却回不去，而审阅时现查答的是读数**现在**说
   * 什么，不是裁决者当时看到的（F-121）。每条拷贝只装观测到的字段 —— 不带派生值、不带等级 —— 于是拷贝
   * 永远无法与它的源争权威（F-125）。最新一条的 id 是**水位**：更大的 id 即决定之后写入（F-127）。次数与
   * 最近三条用**一条语句**读（`COUNT(*) OVER ()` 配 `LIMIT`，单次 SQL 快照）—— 分两次读，并发的自动询问
   * 会落在两者之间，让行与自己差一。
   *
   * 这份拷贝只有在读数表**仅追加**时才保持诚实 —— 一条插入路径、没有 update / delete / 保留期（F-126）。
   * 若日后加了保留期，审计行点名的行必须保留，否则拷贝的 id 悬空：决定行会指向一条没人能拿出来的读数。
   */
  private async _releaseEvidence(
    claim: Pick<AiWriteClaim, 'idempotencyKey' | 'toolName'>,
    options?: { targetAnswered?: boolean },
  ): Promise<ReleaseEvidence> {
    // F-127: one statement, not two. `count(...)` followed by `find({ take })` reads the table twice;
    // a concurrent automatic ask in between makes the row say "asked N" while listing N+1 readings.
    // A window count with a LIMIT reads both from one result set — the window is evaluated before the
    // LIMIT, so `total` covers the whole set and the rows are its newest tail. No retry loop.
    //
    // F-127：一条语句，不是两条。`count(...)` 后再 `find({ take })` 是两次读表；中间落进一次并发的
    // 自动询问，行就会写着「问过 N 次」却列出 N+1 条读数。窗口计数配 LIMIT 让两者读自同一结果集 ——
    // 窗口在 LIMIT 之前求值，故 `total` 覆盖全集、取回的行是它的最新尾部。不靠重试。
    const { entities: recentLookups, raw } = await this.lookupsRepo
      .createQueryBuilder('lookup')
      .select('lookup.id')
      .addSelect('lookup.at')
      .addSelect('lookup.conclusion')
      .addSelect('lookup.reason')
      // R-1 (merged here): the reading's kind must be selected too — hydration fills only the selected
      // columns, so an unselected `basis` would read as absent and every copy would say `unknown`.
      // R-1（并入）：读数的种类也必须选出来 —— 实体只填被选中的列，漏选 `basis` 会读成「未记录」，
      // 于是每条拷贝都写成 `unknown`。
      .addSelect('lookup.basis')
      .addSelect('lookup.lookedUpBy')
      .addSelect('COUNT(*) OVER ()', 'total')
      .where('lookup.idempotencyKey = :key', { key: claim.idempotencyKey })
      .orderBy('lookup.at', 'DESC')
      .addOrderBy('lookup.id', 'DESC')
      .limit(WriteClaimDecisionService.RELEASE_DETAIL_LOOKUPS)
      .getRawAndEntities();
    // One reading, two drivers: SQLite returns the count as a number, Postgres as a bigint string.
    // 同一读数、两种驱动：SQLite 给数字，Postgres 给 bigint 的字符串。
    const lookupCount = recentLookups.length ? Number(raw[0].total) : 0;
    const askable = this._askable(claim.toolName);
    const targetAnswered = options?.targetAnswered ?? false;
    return {
      lookupCount,
      askable,
      targetAnswered,
      releaseLookups: JSON.stringify({
        count: lookupCount,
        askable,
        // Only a target-driven row can tell "asked but not recorded" apart from "never asked": the
        // target answered, so a zero count is a missing row. Written only when the row is missing —
        // `recorded: true` would also vouch for an answer that older readings could hide. Manual
        // releases stay without this flag: there, zero really is "never queried".
        // 只有目标驱动的行能分清「问过但没记录」与「从未问」：目标答过，计数为零即缺行。只在缺行时写
        // 这个标志 —— `recorded: true` 还会替被旧读数遮住的答案背书。人工释放不带这个标志：那里零次
        // 就是「从未问过」。
        ...(targetAnswered && lookupCount === 0 ? { recorded: false } : {}),
        items: recentLookups.map((l) => ({
          // F-123/F-124: the reading row's own id — the copied values' way back to their source.
          // F-123/F-124：读数行自己的 id —— 所复制的值回到其源头的路。
          id: l.id,
          at: l.at.toISOString(),
          conclusion: l.conclusion,
          reason: l.reason ?? null,
          // R-1: same three values as the lookups read face; `unknown` when not recorded.
          // R-1：与查询读面同三个取值；未记录时为 `unknown`。
          basis: l.basis ?? 'unknown',
          lookedUpBy: l.lookedUpBy,
        })),
      }),
      // R-4: the newest reading, by the same order the read surface uses for `lastLookup` — the id the
      // reviewer's frozen view names. `null` = nobody has asked, which the view must also say.
      // R-3 follow-up: it is also the watermark the copied items record — a larger id came after.
      // R-4：最近一次读数，排序与读面取 `lastLookup` 相同 —— 也就是审阅者冻结视图点名的那个 id。
      // `null` = 没人问过，视图也必须这么说。
      // R-3 后续：它也是拷贝条目记下的水位 —— 更大的 id 出现在其后。
      latestLookupId: recentLookups[0]?.id ?? null,
    };
  }

  /**
   * R-6: whether the tool has a usable status query — a property of its declaration, answered without
   * contacting anything. `null`, not `false`, when this process has no probe: the reading is about the
   * assembly, and a tool is not made unaskable by our wiring.
   *
   * R-6：工具是否有可用的状态查询 —— 这是它声明的性质，回答时不接触任何外部系统。本进程没有探针时记
   * `null` 而不是 `false`：那是关于装配的读数，工具不会因为我们的接线而变得问不了。
   */
  private _askable(toolName: string): boolean | null {
    return this.statusProbe ? this.statusProbe.canAsk(toolName) : null;
  }

  /**
   * The one write point for a `claim_release` row: manual, target-driven, or a refused attempt (R-4).
   * The shape lives here once (R-3): paths of the same act must not grow several spellings of the same
   * record.
   *
   * `evidence` is `null` for a refusal: the contract's `releaseLookups` column is the evidence behind a
   * release decision, and it is absent on rows that are not releases. A refusal's `detail` carries the
   * facts instead (what the screen said versus what the ledger says).
   *
   * `claim_release` 行的唯一写入点：人工、目标驱动、以及被拒的尝试（R-4）。形状只在这里写一遍（R-3）：
   * 同一动作的各条路径不得长出同一份记录的多种写法。
   *
   * 拒绝时 `evidence` 为 `null`：契约里的 `releaseLookups` 是释放决定背后的证据，非释放行为空。拒绝行的
   * 事实写在 `detail` 里（屏幕说的与账本说的各是什么）。
   */
  private async _writeReleaseRow(
    claim: ReleaseClaimRef,
    actor: { userId: string; username?: string },
    detail: string,
    evidence: { releaseLookups: string } | null,
  ): Promise<number> {
    const audit = await this.auditService.log({
      userId: actor.userId,
      username: actor.username,
      action: 'claim_release',
      // The tool this hold belongs to — so the row can be filtered by tool without parsing `detail`.
      // 这份占位所属的工具 —— 于是按工具筛选不必解析 `detail`。
      tool: claim.toolName,
      // No `outcome`: this row is not a tool verdict, and the conclusion deliberately stays unknown.
      // R-4: that includes a refusal — the frozen vocabulary defines no word for this action, so the
      // ending lives in `detail`, never in a made-up outcome.
      // 不传 `outcome`：这一行不是工具结局，而结论有意保持未知。R-4：拒绝时同样如此 —— 冻结词表没有为
      // 这个动作定义任何词，故结局写在 `detail` 里，绝不编一个 outcome。
      detail,
      // F-85b: the readings as data, off-chain — the prose says how many, this says which.
      // F-85b：读数以数据形式落库、且在链外 —— 散文说几次，这里说哪几次。
      ...(evidence ? { releaseLookups: evidence.releaseLookups } : {}),
      source: 'claim_release',
    });
    return audit.id;
  }

  private refusal(
    outcome: Exclude<ReleaseClaimOutcome, 'released_unknown'>,
    claim: AiWriteClaim,
    auditRowId: number | null = null,
  ): ReleaseClaimResult {
    return {
      outcome,
      claimId: claim.id,
      toolName: claim.toolName,
      status: claim.status,
      decisionState: claim.decisionState ?? null,
      auditRowId,
    };
  }

  /**
   * R-4: which facts the reviewer's frozen view no longer agrees with — `null` when it still does.
   *
   * Only the two facts the screen actually shows are compared: the governance disposition and the
   * newest reading's id. `status` is deliberately absent — a settle or a reconcile that changes it is
   * answered more precisely by `not_claimable` / `already_closed` once the view itself still matches.
   *
   * R-4：审阅者冻结的视图已与哪些事实不符 —— 仍相符时为 `null`。
   *
   * 只比屏幕真正显示的两件事：治理处置、最近一次读数的 id。`status` **有意**不在其中 —— 落定或对账改了它
   * 时，只要视图本身还对得上，`not_claimable` / `already_closed` 的回答更准确。
   */
  private _movedSinceView(
    view: ReleaseClaimView,
    claim: Pick<AiWriteClaim, 'decisionState'>,
    latestLookupId: number | null,
  ): string | null {
    const moved: string[] = [];
    if (view.decisionState !== claim.decisionState) moved.push('decisionState');
    if ((view.lastLookupId ?? null) !== (latestLookupId ?? null)) moved.push('lastLookup');
    return moved.length ? moved.join('+') : null;
  }

  /**
   * R-4: the refusal row's prose. It must answer, without a join: **what was refused and why**, what
   * the screen said, what the ledger says now, and how many readings are on record — so a reader can
   * tell "the reviewer acted on a screen that had gone stale" from "the reviewer acted and something
   * else happened". The note is copied verbatim, as on a release row.
   *
   * R-4：拒绝行的散文。它必须无需联接就回答：**拒绝了什么、为什么**，屏幕说的是什么、账本现在说的是
   * 什么、记录在案的读数有几条 —— 于是读者能分清「审阅者据一个已经陈旧的屏幕行事」与「审阅者行了事、
   * 之后发生了别的」。说明原样抄录，与释放行一致。
   */
  private _refusalDetail(
    claim: ReleaseClaimRef & Pick<AiWriteClaim, 'status' | 'decisionState'>,
    input: ReleaseClaimInput,
    evidence: { lookupCount: number; latestLookupId: number | null },
    moved: string,
  ): string {
    const reference = input.evidenceRef ? `; evidence: ${input.evidenceRef}` : '';
    const id = (v: number | null) => (v == null ? 'none' : `#${v}`);
    return (
      `release refused (stale_view): write claim #${claim.id} (${claim.toolName}, as user ${claim.userId}) was not released — ` +
      `the hold moved after this review view was taken; changed: ${moved}; ` +
      `view: decisionState=${input.view.decisionState}, lastLookup=${id(input.view.lastLookupId)}; ` +
      `ledger now: decisionState=${claim.decisionState}, status=${claim.status}, lastLookup=${id(evidence.latestLookupId)}; ` +
      `lookups on record: ${evidence.lookupCount}; note: ${input.note}${reference}`
    );
  }

  /**
   * F-85b: the decision row carries the readings that justify it — how often the target was asked and
   * what the latest asks said. "Never asked" is written out in words, so an absent history cannot be
   * read as a silent default; every reading names its conclusion, its cause when `unknown`, and who
   * asked, so the row answers "who found out, and how" without a join.
   *
   * R-6: when nothing was asked, the row says **why** nothing was asked — a tool with no usable
   * status query reads "not askable", not "never queried".
   *
   * F-85b：决定行带上支撑它的读数 —— 目标被问过几次、最近几次怎么答的。「从未问过」**明写**出来，
   * 于是空历史不会被当默认值读过去；每条读数都点名结论、`unknown` 时的成因、以及谁问的，于是这一行
   * 不必联接就能回答「谁查清楚、怎么查的」。
   *
   * R-6：一次也没问时，这一行说明**为什么**没问 —— 没有可用状态查询的工具读作「问不了」，而不是
   * 「从未问过」。
   */
  private _detail(
    claim: ReleaseClaimRef,
    input: ReleaseClaimInput,
    evidence: ReleaseEvidence,
  ): string {
    const ref = input.evidenceRef ? `; evidence: ${input.evidenceRef}` : '';
    return `release write claim #${claim.id} (${claim.toolName}, as user ${claim.userId}) → closed_unknown; note: ${input.note}${ref}; ${this._lookupPhrase(evidence)}`;
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
    evidence: ReleaseEvidence,
  ): string {
    // Who initiated and whose identity the write carried are two facts; the detail keeps them apart.
    // 谁发起与这次写携带的是谁的身份是两件事；detail 把它们分开写。
    const initiator = trigger.automatic
      ? `${trigger.byUserId} (automatic sweep)`
      : `user ${trigger.byUserId} (manual reconcile)`;
    return (
      `release write claim #${claim.id} (${claim.toolName}, as user ${claim.userId}) → released; ` +
      `origin: target answered ${trigger.conclusion} (${trigger.queryMethod} ${trigger.queryPath} at ${trigger.queriedAt}); ` +
      `initiated by: ${initiator}; ${this._lookupPhrase(evidence)}; ` +
      `released for re-claim, effect unknown — the write was attempted; this is a release of the hold, not a finding that nothing happened`
    );
  }

  /**
   * F-85b: the count stays in prose (a person reading the row needs it), the readings themselves go
   * to the structured column — one place, not two spellings of the same list.
   *
   * R-6: "none" is spelled three ways, not two. Asked-N stays a count; zero asks splits on whether the
   * tool even has a query channel to ask with. `askable === null` (no probe here) falls back to the
   * count-only wording — it does not claim the tool is unaskable.
   *
   * R-6b: on a target-driven row, zero counts mean the target answered but its lookup row is missing.
   * "Never queried" would contradict the same row's `origin: target answered …`; it gets its own
   * wording, while the manual path — where zero really is "never asked" — keeps the old one.
   *
   * F-85b：次数留在散文里（读行的人要先知道问过几次），读数本身进结构化列 —— 一份数据，不写两遍。
   *
   * R-6：「没有」有三种说法，不是两种。问过 N 次仍是计数；次数为零按「工具到底有没有查询通道」一分为
   * 二。`askable === null`（本进程没接探针）回落到只陈述次数的措辞 —— 它不宣称工具问不了。
   *
   * R-6b：目标驱动的行上，计数为零意味着目标答过、而它的读数行缺失。此时「从未问过」会与同一行的
   * `origin: target answered …` 自相矛盾，故自成一言；人工路径（那里的零次确实就是「从未问过」）沿用原措辞。
   */
  private _lookupPhrase(evidence: ReleaseEvidence): string {
    if (evidence.lookupCount > 0) {
      return `lookups: ${evidence.lookupCount} asked (see releaseLookups)`;
    }
    if (evidence.targetAnswered) {
      return 'lookup record missing — the target was asked, the lookup row was not recorded';
    }
    return evidence.askable === false
      ? 'lookups: none (not askable — this tool has no usable status query)'
      : 'lookups: none (never queried)';
  }
}

/**
 * The hold fields a release row names. Every release path already holds a full `AiWriteClaim`.
 *
 * 释放行会点名的占位字段。每条释放路径手上本来就有一整条 `AiWriteClaim`。
 */
type ReleaseClaimRef = Pick<AiWriteClaim, 'id' | 'idempotencyKey' | 'toolName' | 'userId'>;

/**
 * R-6: what both release paths state about the asking — the count, whether the tool even has a usable
 * status query (`null` when this process cannot tell), and the off-chain column built from the same
 * two facts. One shape for the prose and the data, so the three cases cannot drift apart.
 *
 * R-6：两条释放路径都陈述的询问读数 —— 次数、工具究竟有没有可用的状态查询（本进程判断不了时为
 * `null`），以及由同两个事实生成的链外列。散文与数据共用一个形状，三态便不会彼此漂移。
 */
interface ReleaseEvidence {
  lookupCount: number;
  askable: boolean | null;
  /**
   * R-6b: true only on the target-driven path — the target did answer, so a zero count is a missing
   * lookup row rather than a "nobody asked". Not in the prose or by itself; it decides the wording.
   *
   * R-6b：只在目标驱动的路径上为真 —— 目标确实答过，故计数为零是缺了一条读数行，而不是「没人问」。
   * 它不进散文、也不单独出现；它决定用哪句措辞。
   */
  targetAnswered: boolean;
  releaseLookups: string;
  /**
   * R-4: the newest reading's id — the key the reviewer's frozen view compares against. Not part of
   * the prose; it exists so the release can tell whether the screen still describes the row. It is
   * also the watermark the copied items carry (R-3 follow-up): the same id heads `items`, and any
   * larger id was written after the decision.
   *
   * R-4：最近一次读数的 id —— 审阅者冻结视图比对的键。它不进散文；它存在只是为了让释放判断屏幕是否仍在
   * 描述这一行。它也是拷贝条目承载的水位（R-3 后续）：同一个 id 领起 `items`，更大的 id 都写在此决定之后。
   */
  latestLookupId: number | null;
}

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

/**
 * R-4: the review screen's frozen reading — the two facts a release is bound to. Both are the read
 * surface's own values (`GET /ai/tool-effects/claims`: `decisionState`, `lastLookup.id`), so the
 * comparison is like for like. `lastLookupId: null` is the screen saying "nobody had asked yet".
 *
 * R-4：复核屏幕冻结的读数 —— 释放所绑定的两件事。两者都是读面自己的值（`GET /ai/tool-effects/claims`
 * 的 `decisionState`、`lastLookup.id`），故比对是同口径的。`lastLookupId: null` 是屏幕在说「当时还没人问过」。
 */
export interface ReleaseClaimView {
  /** The governance disposition the screen showed. / 屏幕当时显示的治理处置。 */
  decisionState: string;
  /** The newest reading's id at the screen's read; `null` = there was none. / 屏幕读取时最近一次读数的 id；`null` = 当时没有。 */
  lastLookupId: number | null;
}

export interface ReleaseClaimInput {
  /** Why the hold is being released — required, recorded verbatim on the audit row. / 为何释放，必填，原样记入审计行。 */
  note: string;
  /** Optional external reference (ticket, lookup id, log URL). / 可选外部引用（工单、对账 id、日志地址）。 */
  evidenceRef?: string;
  /** R-4: what the review screen showed — required; a release that names no view cannot be bound to one. / R-4：复核屏幕当时显示的读数 —— 必填；说不出视图的释放无法绑定到任何视图。 */
  view: ReleaseClaimView;
}

export type ReleaseClaimOutcome =
  | 'released_unknown'
  | 'not_found'
  | 'not_claimable'
  | 'not_stale'
  | 'already_closed'
  /** R-4: the ledger moved after the view was taken. Refused, and the refusal is a row. / R-4：视图取定后账本变动了。拒绝，且拒绝本身是一行。 */
  | 'stale_view';

export interface ReleaseClaimResult {
  outcome: ReleaseClaimOutcome;
  claimId: number;
  toolName: string | null;
  /** The claim's execution status **after** the call — `claimed` for a release (the truth is unknown). */
  status: string | null;
  decisionState: string | null;
  /**
   * The AI-audit row that records the act; `null` when the call was refused **without leaving a
   * record**. R-4: a `stale_view` refusal is itself a row, so it answers an id here.
   *
   * 记录本次动作的 AI 审计行；被拒且**没有留下记录**时为 `null`。R-4：`stale_view` 的拒绝本身就是一行，
   * 故这里会给出 id。
   */
  auditRowId: number | null;
}
