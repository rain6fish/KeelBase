// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { DataSource, EntityManager, IsNull, LessThan, Not, Raw, Repository } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { EffectRegistration } from './effect-registration';
import { EffectComparabilityStore } from './effect-comparability.store';
import { EffectDisputeStore } from './effect-dispute.store';
import { OperationAuditService } from '../../operation-audit/operation-audit.service';
import type { ExternalRevoker } from '../proxy/proxy-revoker.service';
import { targetKey } from './effect-shared';
import type { SideEffectRevoker, DerivedReferenceCount } from './side-effect-revoker';
import type { RevokeClass } from '../interfaces/tool.interface';
import type {
  HostHelpers,
  CrossGroupClaim,
  RevokeBatchItem,
  RevokeBatchResult,
  RevokeClaimOutcome,
  RevokePatch,
  RevokeResult,
  RevokeRunBatchResult,
  TargetComparison,
  SplitGroupFinding,
} from './tool-effects.types';

/**
 * 撤销 / 补偿的**宿主接缝**：这一簇要用到三样留在服务上的东西，故以接口显式声明、而不是把整份服务
 * 递进来（拆分第七批为登记那一簇开的先例，这里照办）：
 * - `resolveSnapshotClass` —— A / 投影 / 撤销三簇共用的档位快照解析；
 * - `loadTarget` —— 投影与撤销共用的目标状态读取。
 *
 * The seam back to the host for the revoke cluster: three things stay on the service, declared here as an
 * interface rather than handing over the whole service.
 */
export interface RevokeHostSeam extends HostHelpers {
  /**
   * Write back the revoke state columns. **One implementation only** (the service's `_patchRevoke`):
   * both the revoke side and the dispute side write those five columns, and two implementations would
   * be exactly the "same state, two accounts" defect this repo keeps fixing — so it crosses the seam
   * as a callback rather than being copied.
   *
   * PRE-3: the boolean says whether the write landed. A caller writing an **authoritative terminal
   * state** must honour it (a local soft-delete that could not record its outcome stays
   * `compensating` = unknown, and the result must not claim `revoked`); an annotation-only caller may
   * ignore it.
   *
   * KB-6 撤销运维态的回写。**只有一处实现**（服务上那个 `_patchRevoke`）：撤销与争议两侧都写那五列，
   * 两处实现正是本仓反复修的那类缺陷的成因 —— 故以接缝传过来，而不是各写一份。
   *
   * PRE-3：布尔值表示这次写入是否落库。写**权威终态**的调用方必须处理它（本地软删已执行、终态却
   * 没落库时，该行留在 `compensating` = 未知，结果不得声称 `revoked`）；只写注解的调用方可以忽略。
   */
  patchRevoke(
    effect: AiToolSideEffect,
    patch: RevokePatch,
    opts?: { attempts?: number },
  ): Promise<boolean>;
}

/** 可回写的撤销态列 —— 声明在 `tool-effects.types.ts`（撤销与争议两侧同一份）。 */

/**
 * 撤销 / 补偿。**从 `ai-tool-effects.service.ts` 分两片搬出**（2026-10-11）：这一片是**支撑件** ——
 * 派生的引用读数、漂移措辞、跨组分裂检出、跨组主张、跳过判据与档位解析；下一片是状态机本身。
 * 实现一字未改，只把几个私有名去掉下划线（它们本来就被状态机那一半与投影读）。
 *
 * The revoke / compensation cluster, moved out in two pieces: this one is the support around the state
 * machine — derived-reference readings, drift wording, split detection, cross-group claims, the skip
 * predicate and the tier lookup.
 */
export class EffectRevoke {
  /** ⚠ 日志名沿用搬动前那一个：拆分不该让运维看到的日志前缀变样（同前三个 store）。 */
  private readonly logger = new Logger('AiToolEffectsService');

  /**
   * ⚠ **可变字段**：`ai.module` 在 DI 之后才调 `setExternalRevoker`（ProxyToolRevokerService 需要
   * 运行时拿到 ToolRegistry）。搬出前它是服务上的实例字段，搬出后由服务转发 setter —— **不能只在构造时
   * 取一次值**，否则那次运行期注入永远到不了撤销路径，B 路径补偿会静默退化成「没有执行器」。
   */
  private externalRevoker?: ExternalRevoker;

  constructor(
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    private readonly registration: EffectRegistration,
    private readonly comparability: EffectComparabilityStore,
    private readonly dispute: EffectDisputeStore,
    private readonly host: RevokeHostSeam,
    private readonly revoker?: SideEffectRevoker,
    private readonly dataSource?: DataSource,
    private readonly operationAudit?: OperationAuditService,
    externalRevoker?: ExternalRevoker,
  ) {
    this.externalRevoker = externalRevoker;
  }

  /** 运行期注入（`ai.module` 的 useFactory 在 DI 之后调它）—— 服务上的同名公开方法转发到这里。 */
  setExternalRevoker(revoker: ExternalRevoker): void {
    this.externalRevoker = revoker;
  }

  /**
   * REV-16: what this operation did **not** reach — the live rows still pointing at the targets it revoked.
   *
   * Returns `undefined` when none of the targets' types has a reference model, which keeps the result's
   * field absent and the two readings apart: absent is "not checked", an empty array is "checked, nothing
   * points at it". Totals are per referencing **table**, summed over the revoked targets, so a group shows
   * one line per table rather than one per member.
   *
   * The targets themselves are passed as the exclusion set: a member being revoked in this same operation
   * is part of the action, not a leftover pointing at it.
   *
   * REV-16：本次操作**没够到**的部分 —— 它撤销的目标上，还活着的引用行。
   *
   * 所有目标类型都没有引用模型时返回 `undefined`，于是结果里该字段**缺席**，两种读数因此分开：缺席是
   * 「未检查」，空数组是「查过、没有东西指着它」。按**引用方表**汇总、跨被撤销目标相加，故一个组每个表
   * 一行，而不是每个成员一行。
   *
   * 目标本身同时作为排除集：同一次操作里一并撤销的成员属于本次动作，不是「留下指着它的东西」。
   */
  async downstreamReferences(
    revokedTargets: Array<{ resultType: string; resultId: number }>,
  ): Promise<DerivedReferenceCount[] | undefined> {
    if (!this.revoker?.countDerivedReferences) return undefined;
    const totals = new Map<string, number>();
    let checkedAny = false;
    for (const target of revokedTargets) {
      const found = await this.revoker.countDerivedReferences(
        target.resultType,
        target.resultId,
        revokedTargets,
      );
      if (found === null) continue; // 该类型没有引用模型 ⇒ 未检查（**不是**「没有」）
      checkedAny = true;
      for (const ref of found) totals.set(ref.table, (totals.get(ref.table) ?? 0) + ref.remaining);
    }
    if (!checkedAny) return undefined;
    return [...totals.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([table, remaining]) => ({ table, remaining }));
  }


  /**
   * REV-9：把漂移事实**加到人读消息上**（单条与组内成员共用一处措辞，免得两条路各写一句）。
   *
   * 为什么走 `message` 而不是新增结构化键：**两条路的 wire 开放度不同** —— 单条结果 `revokeResult` 是
   * `additionalProperties: true`（加键不破契约），而**批量逐条** `item` 与 `revokeBatch` 是 `false`
   * （加键要升版本）。漂移这件事两条路都要答，若只在单条加键，就变成「同一状态、两条路两个形状」
   * ——正是本仓反复修的那类缺陷。`message` 是两条路**都有且都开放**的那个面，故用它；
   * 要结构化字段，得先让两条路的形状同向（升版本或统一），那是另一步。
   */
  withDriftNote(message: string | undefined, drift: string | null): string | undefined {
    if (!drift) return message;
    const note = `⚠ 目标在写入后被改过（${drift}），本次补偿把该改动一并抹除`;
    return message ? `${message}；${note}` : note;
  }

  /**
   * REV-3 **检出**：同一 `resultType + resultId`（同一业务对象）出现在**多个**补偿组 → 一次业务动作被拆成两组。
   *
   * 为什么难发现：组分键吃的是**调用身份**（userId/conversationId/toolName/args），其中 `conversationId` 会在
   * 工具毫不知情的情况下变（会话 id 缺失或查不到时 `_resolveConversation` 会**新建**会话；载荷多一个
   * continuation token 同理）。于是同一个 effect 落进两组，**两组各自内部自洽完整**：唯一冲突永不触发、
   * 幂等回放根本不执行，记录里没有任何地方读起来异常 —— 比「少记录」（至少留下一次冲突）更难察觉。
   *
   * **检出之外还有闸门**（REV-5）：撤销时**自己**再判一次（`_crossGroupClaims`），命中就拒绝报完成。
   * 检出回答「历史与全局上哪些对象被拆过」，闸门回答「这一次撤销能不能说完成」——两个问题，两个落点。
   *
   * **组键不动**（2026-09-24 裁决）：把组键改成吃**主体 effect 身份**（参数降为 args_hash 证据）会让两次
   * **合法**调用触碰同一主体行时被并组，而并错方向的代价不可恢复（撤销够到没人要求够到的 effect，
   * 撤销不能倒着跑）；而少记录 / 分裂都是可恢复的（撤销可以再跑一次）。
   *
   * 无 LLM、无猜测：只报「哪些业务对象横跨多个组」这一可从库中判定的事实。
   */
  async findSplitGroups(
    limit = 100,
  ): Promise<{ count: number; truncated: boolean; splits: SplitGroupFinding[] }> {
    // 检出结果条数上限与 list() 同口径（≤100）：本端点每条要找一次承载行，不放开成无界放大面。
    const capped = Math.min(Math.max(limit, 1), 100);
    // 库侧分组聚合（双方言均支持 COUNT(DISTINCT)/HAVING）——不要把全表拉进内存自己分组。
    // 多取一条用于如实报告「还有更多」：检出器绝不能在自身能力边界上沉默。
    const pairs = await this.effectsRepo
      .createQueryBuilder('e')
      .select('e.resultType', 'resultType')
      .addSelect('e.resultId', 'resultId')
      .where('e.compensationGroup IS NOT NULL')
      .groupBy('e.resultType')
      .addGroupBy('e.resultId')
      .having('COUNT(DISTINCT e.compensation_group) > 1')
      .orderBy('e.resultType', 'ASC')
      .addOrderBy('e.resultId', 'ASC')
      .limit(capped + 1)
      .getRawMany<{ resultType: string; resultId: number | string }>();
    const truncated = pairs.length > capped;
    const shown = truncated ? pairs.slice(0, capped) : pairs;
    const splits: SplitGroupFinding[] = [];
    for (const p of shown) {
      const resultId = Number(p.resultId);
      const rows = await this.effectsRepo.find({
        where: { resultType: p.resultType, resultId } as any,
        order: { id: 'ASC' },
      });
      // 只列**已分组**的行：`groups` 与 `effectIds` 必须同口径，否则「这几行属于哪些组」会自相矛盾
      // （无组的单目标行不属于本次分裂，但它确实存在于同一业务对象上——那一层事实由 list/治理视图呈现）。
      const grouped = rows.filter(
        (r): r is typeof r & { compensationGroup: string } =>
          typeof r.compensationGroup === 'string' && r.compensationGroup.length > 0,
      );
      splits.push({
        resultType: p.resultType,
        resultId,
        groups: [...new Set(grouped.map((r) => r.compensationGroup))],
        effectIds: grouped.map((r) => r.id),
      });
    }
    return { count: splits.length, truncated, splits };
  }

  /**
   * REV-5 **闸门**：本次要撤销的这组，组内每个成员是否还有**别的活着的组**也主张同一 `resultType + resultId`。
   *
   * 为什么只有在撤销时问得出来：**写时每一组各自内部都是正确的**——唯一冲突不触发、幂等回放不执行，
   * 记录里没有任何东西读起来异常，检查在那里**没有主语**；而活下来的那个组**仍指着刚被撤销的 effect**，
   * 这个失败只在撤销进行时才可察（docs/revoke-contract.spec.md §5.3）。
   *
   * 「活着」= 该组承载同一 effect 的那行 `revoke_status` 不是 `revoked` —— 已补偿完的组不再主张它。
   *
   * **保守方向**：只回答「另一个组还主张这个 effect」，**答不出**「那个组是否还留有本次撤销覆盖不到的成员」。
   * 前者命中就拒绝报完成（可恢复：撤销可以再跑一次）；若反过来把「其实还有存活部分」判成无碍，
   * 得到的是不可恢复的「报完成而实未完成」——与「不换组键」同一条取舍。
   * （REV-6 补齐成组成员的变更快照后，这里才谈得上把比对从「碰了同一行」细化到「是否同一变更」。）
   */
  async crossGroupClaims(
    groupId: string,
    members: Array<Pick<AiToolSideEffect, 'resultType' | 'resultId'>>,
  ): Promise<CrossGroupClaim[]> {
    if (members.length === 0) return [];
    // 按**目标**圈定候选行，再在内存里按「同组 / 已补偿完」过滤：成员的 (resultType,resultId) 至多几条，
    // 而库侧聚合会把「哪个组主张了哪一行」这层还原丢掉，判定需要的是组与行的对应关系。
    const rows = await this.effectsRepo.find({
      where: members.map((m) => ({
        resultType: m.resultType,
        resultId: m.resultId,
        compensationGroup: Not(groupId),
      })) as any,
    });
    const byTarget = new Map<string, CrossGroupClaim>();
    for (const r of rows) {
      if (!r.compensationGroup || r.compensationGroup === groupId) continue;
      if (r.revokeStatus === 'revoked') continue; // 已补偿完的组不再主张
      const key = targetKey(r);
      const found = byTarget.get(key);
      if (found) {
        if (!found.groups.includes(r.compensationGroup)) found.groups.push(r.compensationGroup);
      } else {
        byTarget.set(key, {
          resultType: r.resultType,
          resultId: r.resultId,
          groups: [r.compensationGroup],
        });
      }
    }
    return [...byTarget.values()].sort(
      (a, b) => a.resultType.localeCompare(b.resultType) || a.resultId - b.resultId,
    );
  }

  /** 本次撤销相关的跨组主张（组内全部成员；单目标行不属于任何组 → 空，不查库） */
  async claimsForRevoke(effect: AiToolSideEffect): Promise<CrossGroupClaim[]> {
    if (!effect.compensationGroup) return [];
    const members = await this.registration.listGroup(effect.compensationGroup);
    return this.crossGroupClaims(effect.compensationGroup, members.length ? members : [effect]);
  }

  /** 撤销跳过判据（单条/批量共用）：已软删 revoked / 结果未知 compensating；revoke_failed 视为可重试 */
  /**
   * 幂等判据：**这一行到底做完了没有**。
   *
   * ARC-1：此前只看 `revokeStatus === 'revoked'`，而读侧 `isRestored` 要求「revoked **且** 目标仍未软删」
   * ——**同一条状态、两条路两个结论**：一条撤销后从回收站恢复的行（目标又活了），撤销侧仍报
   * `already_revoked`（即 `revoked:true`），而列表侧早已按 `targetSoftDeleted` 把它读成 `executed`。
   * 于是「撤销报完成，而那条业务动作仍然活着」。现取**同一判据**：`revoked` **且目标仍在软删态**才算完成；
   * 目标已复活 ⇒ 不算完成 ⇒ 走正常撤销路径（读侧本来就是这么建模的：恢复 ⇒ 这条又活了）。
   *
   * **只在有本地软删语义时**才这么判：`describeTarget` 对**外部**副作用返回的是占位
   * `{deletedAt: null}`（「撤销语义在外部」，不是「目标活着」），照它判会把外部行读成未完成而**重复补偿**。
   * 故以 `_classOf === 'local_compensate'` 且 revoker 认这个 resultType 为门。
   *
   * 目标读不到（无 revoker / 行不存在）⇒ **判不了**，按完成处理——保守方向是「不因读不到就去重复补偿」。
   *
   * PRE-3：`compensating` 自本地补偿引入意图写之后**不再只属于外部**——它同样表示「本地软删已执行、
   * 终态未能落库」这种**结果未知**。这里对它返回 `'compensating'`（而不是 `null`）正是关键：
   * 「不知道」读作「未知 / 不重试」，**不读作「未撤销」**。
   *
   * PRE-3: after local compensation started recording its intent first, `compensating` no longer belongs
   * to the external path alone — it also says "the local soft-delete landed, but its terminal state could
   * not be recorded", i.e. the outcome is unknown. Returning `'compensating'` (not `null`) is the point:
   * "don't know" reads as unknown / do not re-trigger, **never as "not revoked"**.
   */
  async skipReason(
    effect: AiToolSideEffect,
  ): Promise<'already_revoked' | 'compensating' | null> {
    if (effect.revokeStatus === 'compensating') return 'compensating';
    if (effect.revokeStatus === 'revoked') {
      const localSoftDelete =
        this.classOf(effect) === 'local_compensate' &&
        (this.revoker?.canHandle(effect.resultType) ?? false);
      if (localSoftDelete) {
        const target = await this.host.loadTarget(effect.resultType, effect.resultId);
        if (target && target.deletedAt == null) return null; // 已从回收站恢复 → 又活了 → 不算完成
      }
      return 'already_revoked';
    }
    return null;
  }

  /**
   * 构建「跳过不重复触发」结果（单条撤销用；批量走 _revokeBatch 的 skip 分支）。
   * 争议降级**不在此处**——跳过路径原本以「幂等成功」的口径把争议重新报成完成，故降级由结论层
   * （`_concludeSingle`）统一施加，免得两个判据在这里各判一半。
   */
  skippedResult(
    effect: AiToolSideEffect,
    reason: 'already_revoked' | 'compensating',
  ): RevokeResult {
    // 幂等语义（单条）：已撤销 = 终态已达成 → revoked:true（HTTP DELETE 幂等成功），仅 skipped 标记不重复触发；
    // 补偿中 = 结果未知 → 如实 revoked:false（KB-6：不得显示为已撤销）。
    //
    // PRE-3：`external` 由**档位**决定，而不是由 `compensating` 推断 —— 本地补偿的终态未落库同样会
    // 停在 `compensating`，把它标成 `external:true` 会在结果里说一句关于外部系统、而这次根本没外呼的话。
    //
    // PRE-3: `external` comes from the **tier**, not from `compensating` — a local compensation whose
    // terminal write failed also stays `compensating`, and labelling it `external:true` would tell the
    // caller a story about an external system that this operation never called.
    const alreadyRevoked = reason === 'already_revoked';
    return {
      revoked: alreadyRevoked,
      effectId: effect.id,
      skipped: true,
      reason,
      external: reason === 'compensating' ? this.classOf(effect) === 'governed_external' : undefined,
      revokeStatus: (effect.revokeStatus as RevokeResult['revokeStatus']) ?? undefined,
      message:
        reason === 'already_revoked'
          ? '该副作用此前已撤销（幂等成功），跳过重复触发'
          : '撤销结果未知（可能尚未到达目标系统 / 终态未能落库）——跳过重复触发，需人工核对',
    };
  }

  /** 撤销能力档位（KB-6）：行上快照优先；旧行/未快照行按工具注册或 resultType 兜底解析 */
  classOf(effect: AiToolSideEffect): RevokeClass {
    return (
      (effect.revokeClass as RevokeClass) ??
      this.host.resolveSnapshotClass(effect.toolName, effect.resultType)
    );
  }
  /** 撤销 AI 副作用：软删目标 event/todo/crm_task（可经 RG-3 回收站恢复） */
  async revoke(effectId: number): Promise<RevokeResult | null> {
    const effect = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!effect) return null;
    return this.concludeSingle(effect);
  }

  /**
   * P0-15 用户侧撤销：仅本人可撤销自己的 AI 副作用。
   * 非本人/不存在 → null（controller 转 404）；目标软删可经 RG-3 回收站恢复。
   */
  async revokeOwned(effectId: number, userId: string): Promise<RevokeResult | null> {
    const effect = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!effect || effect.userId !== userId) return null;
    return this.concludeSingle(effect);
  }

  /**
   * REV-11: take a stuck compensation on. A person, recorded — not an inference.
   *
   * **Conditional update, like every other arbitration point in this repo** (`ConfirmationStore.resolve`,
   * `R4ApprovalService._claimExecution`, the dispatch claim in `_doRevokeSingle`): the row is claimed
   * only if it is *still* what the caller believed it was — `compensating`, past the staleness
   * threshold, and unclaimed. `affected === 0` means someone else got there first, and that is reported
   * rather than papered over.
   *
   * **What this does not do** (REV-11's stated boundary): it does not rewrite `revoke_status`, does not
   * touch the target, and does not claim the compensation finished. The truth is still in the target
   * system; a claim says only who is looking. It also does not poll or reconcile — that is a later batch.
   *
   * On refusal we re-read the row and report **which** refusal it was, because "already claimed" and
   * "not stale" are different situations for the operator and a bare `false` would conflate them.
   *
   * REV-11：把一条卡住的补偿接过来。一个人，被记录下来 —— 不是推断出来的。
   *
   * **条件更新，与本仓其他每一个仲裁点同形**（`ConfirmationStore.resolve`、`R4ApprovalService._claimExecution`、
   * `_doRevokeSingle` 里的派发认领）：只有当该行**仍然是**调用者以为的那样时才能认领 —— 仍是
   * `compensating`、已过陈旧阈值、且无人认领。`affected === 0` 意味着别人先到了；那要如实报出，
   * 而不是抹平。
   *
   * **它不做什么**（REV-11 明列的边界）：不改写 `revoke_status`、不碰目标、不声称补偿已完成。真值仍在
   * 目标系统；认领只说明谁在看。它也不做轮询或对账 —— 那是后面一批的事。
   *
   * 被拒时**回读该行并报出是哪一种拒**，因为对运维而言「已被认领」与「还没到陈旧」是两回事，
   * 一个光秃秃的 `false` 会把它们混为一谈。
   */
  async claim(effectId: number, byUserId: string): Promise<{ outcome: RevokeClaimOutcome; claimedBy?: string | null; claimedAt?: string | null }> {
    const thresholdMinutes = this.host.staleThresholdMinutes();
    const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);

    const res = await this.effectsRepo.update(
      {
        id: effectId,
        revokeStatus: 'compensating',
        revokeRequestedAt: LessThan(cutoff),
        revokeClaimedBy: IsNull(),
      },
      { revokeClaimedBy: byUserId, revokeClaimedAt: new Date() },
    );
    if (res?.affected) {
      const after = await this.effectsRepo.findOne({ where: { id: effectId } });
      return {
        outcome: 'claimed',
        claimedBy: after?.revokeClaimedBy ?? byUserId,
        claimedAt: after?.revokeClaimedAt ? after.revokeClaimedAt.toISOString() : null,
      };
    }

    // 认领没命中：**回读**并说清是哪一种，不把三种情形压成一个 false
    const row = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!row) return { outcome: 'not_found' };
    if (row.revokeClaimedBy != null) {
      return {
        outcome: 'already_claimed',
        claimedBy: row.revokeClaimedBy,
        claimedAt: row.revokeClaimedAt ? row.revokeClaimedAt.toISOString() : null,
      };
    }
    // 剩下的可能：不是 compensating，或还没到陈旧阈值。两者对调用方是同一句话——
    // 「这条现在还不需认领」——故合并为一个读数，但**不**与上面两种混。
    return { outcome: 'not_stale' };
  }

  /**
   * 单条撤销的**结论层**：单条撤销的响应**就是**结论本身，故两个争议判据（REV-1 声明与持有不一致、
   * REV-5 另一个活组仍主张）都在此施加（批量路径不降级：那里逐条计数是逐行事实，只带 `disputed` 标记）。
   *
   * 多成员组例外：那条路的结论已在 `_groupResult` 里连同争议说明一起给出（`cascade` 即该形态的标记），
   * 这里不再把同一句话追加第二遍；跳过路径没有组汇总，故在**施加之前**先判一次。
   */
  private async concludeSingle(effect: AiToolSideEffect): Promise<RevokeResult> {
    const reason = await this.skipReason(effect);
    if (reason) {
      return this.dispute.withDisputeNote(
        effect,
        this.skippedResult(effect, reason),
        await this.claimsForRevoke(effect),
      );
    }
    const result = await this.doRevoke(effect);
    if (result.cascade) return result;
    return this.dispute.withDisputeNote(effect, result, await this.claimsForRevoke(effect));
  }

  /**
   * G1 会话级批量撤销（revoke-contract §3 Case B）：一键撤销某会话（一次对话/run 近似）的 AI 写副作用。
   * - ownerId 提供 → 只撤该用户本人的（AI Action Center 本人作用域）；否则（admin）撤该会话全部
   * - 逐条复用 _doRevoke（档位门控 none 拒绝 / local 软删 / external 补偿），已撤销或已请求外部补偿
   *   （revokeStatus revoked/compensating）跳过不重复触发；revoke_failed 视为可重试
   * - 返回逐条结果 + 汇总，便于前端一键撤销后展示部分失败
   */
  async revokeConversation(
    conversationId: string,
    opts?: { ownerId?: string },
  ): Promise<RevokeBatchResult> {
    const effects = await this.effectsRepo.find({
      where: { conversationId } as any,
      order: { createdAt: 'ASC' },
    });
    return { conversationId, ...(await this.revokeBatch(effects, opts)) };
  }

  /**
   * §4 G1：run 级批量撤销——精确撤销「某次 run 一次性授权」产生的全部副作用（比会话级更细：
   * 一个对话可含多次 run）。逐条复用档位门控撤销（同 revokeConversation），汇总逐条结果。
   */
  async revokeRun(runId: string, opts?: { ownerId?: string }): Promise<RevokeRunBatchResult> {
    const effects = await this.effectsRepo.find({
      where: { runId } as any,
      order: { createdAt: 'ASC' },
    });
    return { runId, ...(await this.revokeBatch(effects, opts)) };
  }

  /** 批量撤销公共循环（revokeConversation / revokeRun 共用；owner 过滤 + 逐条档位门控 + 汇总） */
  private async revokeBatch(
    effects: AiToolSideEffect[],
    opts?: { ownerId?: string },
  ): Promise<{
    total: number;
    revoked: number;
    skipped: number;
    failed: number;
    results: RevokeBatchItem[];
  }> {
    // 以「未提供」判据而非真值判据：ownerId 为空串等 falsy 值时不得静默升级为 admin 全作用域
    const ownerFilter = opts?.ownerId;
    const scoped =
      ownerFilter !== undefined ? effects.filter((e) => e.userId === ownerFilter) : effects;
    const results: RevokeBatchItem[] = [];
    let revoked = 0;
    let skipped = 0;
    let failed = 0;
    // 级联补偿折叠（docs/cascade-compensation.spec.md §5）：同组只补偿一次——否则一个 N 成员组会被补偿 N 次。
    // 逐条结果按成员摊平，前端仍看到「一条一行」。组分支必须**先于** skipReason 判定：
    // 若首个成员恰是可跳过态（已撤销/补偿中），提前 continue 会让整组根本不被处理。
    const processedGroups = new Set<string>();
    const scopedIds = new Set(scoped.map((e) => e.id));
    // REV-1 / REV-5：争议组的行在批量里也必须**读得出**。逐条计数本身是逐行事实（这一行确实被补偿了），
    // 但若只剩一个光秃秃的 `revoked:3 / failed:0`，批量读起来就是「这次业务动作已完全撤销」——正是要拦的那个读数。
    // 判定按**组**（标记只在根行上，故逐行看会漏；跨组主张同样只能按组问）。
    const withDispute = (disputed: boolean, item: RevokeBatchItem): RevokeBatchItem =>
      disputed ? { ...item, disputed: true } : item;
    for (const effect of scoped) {
      const groupId = effect.compensationGroup;
      // REV-1 / REV-5：争议是**组级**事实（标记在根行；跨组主张要按组问），故按组判定后摊到逐条结果上
      let disputed = this.dispute.hasOpenDispute(effect);
      if (groupId) {
        if (processedGroups.has(groupId)) continue;
        processedGroups.add(groupId);
        try {
          const members = await this.registration.listGroup(groupId);
          const claims = await this.crossGroupClaims(groupId, members);
          disputed = this.dispute.notesFor(members, claims).length > 0;
          if (members.length > 1) {
            const { items, result } = await this.compensateGroup(effect, groupId, members, claims);
            for (const it of items) {
              if (!scopedIds.has(it.effectId)) continue;
              // REV-16：批量**逐条**也要带上这个读数 —— 只在单条带上就会变成「同一状态、两条路两个形状」，
              // 正是本仓反复修的那类缺陷。组级结论是整组的，故组内每条都带同一份。
              results.push(
                withDispute(disputed, {
                  ...it,
                  ...(result.downstreamReferences
                    ? { downstreamReferences: result.downstreamReferences }
                    : {}),
                }),
              );
              if (it.revoked) revoked++;
              else if (it.skipped) skipped++;
              else failed++;
            }
            continue;
          }
        } catch (err) {
          failed++;
          results.push(
            withDispute(disputed, {
              effectId: effect.id,
              revoked: false,
              error: (err as Error).message,
              compensationGroup: groupId,
            }),
          );
          continue;
        }
      }
      const skipReason = await this.skipReason(effect);
      if (skipReason) {
        skipped++;
        results.push(
          withDispute(disputed, {
            effectId: effect.id,
            revoked: false,
            skipped: true,
            reason: skipReason,
            compensationGroup: groupId ?? null,
          }),
        );
        continue;
      }
      try {
        const r = await this.doRevoke(effect);
        // ARC-7：`compensating`（已请求外部补偿、结果未知）既不是 revoked 也不是 failed。
        // 此前它落进 `revoked++`——同一次业务动作于是在单条说「未完成」、在批量说「已撤销」，
        // 而管理台 toast 念的正是这三个数（`aiCenterConvRevokeDone`）。
        if (r.revoked) revoked++;
        else if (r.skipped) skipped++;
        else failed++;
        results.push(
          withDispute(disputed, {
            effectId: effect.id,
            revoked: r.revoked,
            skipped: r.skipped,
            reason: r.reason === 'already_revoked' || r.reason === 'compensating' ? r.reason : undefined,
            revokeStatus: r.revokeStatus ?? null,
            external: r.external ?? false,
            message: r.message,
            compensationGroup: groupId ?? null,
            // REV-16：与单条撤销同向（见上面组分支的注释）
            ...(r.downstreamReferences ? { downstreamReferences: r.downstreamReferences } : {}),
          }),
        );
      } catch (err) {
        failed++;
        results.push(
          withDispute(disputed, {
            effectId: effect.id,
            revoked: false,
            error: (err as Error).message,
            compensationGroup: groupId ?? null,
          }),
        );
      }
    }
    return { total: scoped.length, revoked, skipped, failed, results };
  }


  /**
   * 撤销派发（docs/cascade-compensation.spec.md §5）：属**多成员补偿组** → 级联补偿整组；
   * 否则走单目标路径（无组的历史行行为逐字节不变）。
   *
   * 返回的是**逐行事实**（这一条到底撤销了没有）；REV-1 / REV-5 的争议降级由**结论层**施加：
   * 单条撤销在 `_concludeSingle` 里降级，组级在 `_groupResult` 里降级，批量则不动逐条计数
   * —— 否则同一件事（持有的行确实补偿了、声明却不一致）会在两条路径上被数成不同的东西。
   * 跨组闸门（REV-5）在组级由此处算出后传入，撤销过程中**不再**重复查询。
   */
  private async doRevoke(effect: AiToolSideEffect): Promise<RevokeResult> {
    if (effect.compensationGroup) {
      const members = await this.registration.listGroup(effect.compensationGroup);
      if (members.length > 1) {
        // REV-5：撤销**之前**先看 —— 另一个活组是否也主张本次要撤的这些 effect
        const cross = await this.crossGroupClaims(effect.compensationGroup, members);
        return (await this.compensateGroup(effect, effect.compensationGroup, members, cross)).result;
      }
    }
    return this.doRevokeSingle(effect);
  }



  /**
   * 级联补偿整组：本地成员落在**一个 DB 事务**里，任一失败即回滚 → 整组零改动；
   * 外部成员在本地事务提交后于事务外顺序补偿，诚实落 compensating / revoke_failed。
   * 本地回滚时**不触发**外部补偿——避免制造「半补偿」（一部分已撤销、一部分原样）的更糟状态。
   */
  private async compensateGroup(
    requested: AiToolSideEffect,
    groupId: string,
    members: AiToolSideEffect[],
    cross: CrossGroupClaim[],
  ): Promise<{ result: RevokeResult; items: RevokeBatchItem[] }> {
    const results: RevokeBatchItem[] = [];
    const locals: AiToolSideEffect[] = [];
    const externals: AiToolSideEffect[] = [];
    /** PRE-3：本地软删已落地、但撤销终态未能落库的成员（读作「未知」，不是「未撤销」）。 */
    const unrecorded: number[] = [];
    // REV-1 / REV-5：争议是**组级**事实 → 汇总必须据此拒绝报完成，无论本次是否真的补偿了什么。
    const disputeNotes = this.dispute.notesFor(members, cross);

    for (const m of members) {
      const reason = await this.skipReason(m);
      if (reason) {
        results.push({
          effectId: m.id,
          revoked: false,
          skipped: true,
          reason,
          revokeStatus: (m.revokeStatus as RevokeBatchItem['revokeStatus']) ?? null,
          compensationGroup: groupId,
        });
        continue;
      }
      // KB-6 `none` 档位：**不参与补偿**（没有补偿端点），而那是**声明**、不是失败。按 `skipped` 记它 ——
      // 与 §5.3 对「已请求补偿的外部成员」的处理同形。否则它会落进外部那一堆、被汇总计成 `failed`，
      // 整组于是报 `revoke_failed`，摘要还谎称「本地成员已整体回滚」（2026-10-11 修）。
      // A `none` member declares there is no compensation endpoint — that is not a failure. Recording it
      // as skipped keeps it out of the `failed` tally; otherwise the whole group reports revoke_failed.
      if (this.classOf(m) === 'none') {
        results.push({
          effectId: m.id,
          revoked: false,
          skipped: true,
          reason: 'revoke_class_none',
          revokeStatus: (m.revokeStatus as RevokeBatchItem['revokeStatus']) ?? null,
          compensationGroup: groupId,
        });
        continue;
      }
      if (this.classOf(m) === 'local_compensate' && this.revoker?.canHandle(m.resultType)) {
        locals.push(m);
      } else {
        externals.push(m);
      }
    }

    // REV-9：组内本地成员与单条走**同一处**比对——否则「同一状态两条路两个结论」正是本仓反复修的那类缺陷。
    // 在事务**之前**读：软删在事务里发生，读要在那之前。声明在 `if` 之外，因为组级摘要也要用它。
    const driftByEffect = new Map<number, string>();
    if (locals.length) {
      const comparisons: Array<{
        ref: { resultType: string; resultId: number };
        cmp: TargetComparison;
      }> = [];
      for (const m of locals) {
        const cmp = await this.comparability.targetDrift(m);
        comparisons.push({
          ref: { resultType: m.resultType, resultId: m.resultId },
          cmp,
        });
        const d = cmp.promised && cmp.compared ? cmp.drift : null;
        if (d) {
          driftByEffect.set(m.id, d);
          this.logger.warn(
            `[AiToolEffects] effect ${m.id}: 目标 ${m.resultType} #${m.resultId} 在写入后被改过（${d}）`,
          );
        }
      }
      const run = async (manager?: EntityManager): Promise<void> => {
        for (const m of locals) {
          const r = await this.revoker!.revoke(m.resultType, m.resultId, m.userId, manager);
          if (!r.revoked) {
            throw new Error(r.message ?? `本地补偿失败：${m.resultType} #${m.resultId}`);
          }
        }
      };
      const claimed = new Set<number>();
      try {
        // PRE-3: record the intent **before** the fact-layer transaction. The record must exist first,
        // or a crash/failed terminal write leaves the facts changed with nothing for the readers to
        // consult. A claim that cannot be written aborts the group before any target is touched.
        // PRE-3：改事实层（事务软删）**之前**先写意图。记录必须先存在，否则崩溃或终态写入失败会留下
        // 「事实改了、读侧没东西可读」。写不成意图就整组中止 —— 一个目标都不碰。
        for (const m of locals) {
          const outcome = await this.claimLocalIntent(m);
          if (outcome !== 'claimed') {
            throw new Error(
              outcome === 'not_claimed'
                ? `本地成员 effect ${m.id} 的撤销已被另一写者认领（或已不处于可派发状态），本次未触碰任何目标`
                : `本地成员 effect ${m.id} 的撤销意图未能落库，本次未触碰任何目标`,
            );
          }
          claimed.add(m.id);
        }
        if (this.dataSource) {
          await this.dataSource.transaction((manager) => run(manager));
        } else {
          // 无 DataSource（单测 / 降级装配）：退化为顺序执行，失去原子性。部署态恒有 DataSource。
          await run();
        }
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.error(`[AiToolEffects] cascade rollback (group ${groupId}): ${msg}`);
        // The fact layer did not change. Clear only the intents **we** wrote, so the rows read as
        // "failed / retryable" instead of "in flight". Rows another writer owns are left alone.
        // 事实层没有改动。只清理**我们**写下的意图，使它们读作「失败可重试」而不是「进行中」；
        // 别人认领的行一概不碰。
        for (const m of locals) {
          if (claimed.has(m.id)) {
            await this.host.patchRevoke(m, { revokeStatus: 'revoke_failed' }, { attempts: 2 });
          }
        }
        for (const m of locals) {
          results.push({ effectId: m.id, revoked: false, error: msg, compensationGroup: groupId });
        }
        for (const m of externals) {
          results.push({
            effectId: m.id,
            revoked: false,
            message: '本地成员补偿失败并已回滚，未触发外部补偿（避免半补偿）',
            compensationGroup: groupId,
          });
        }
        const rolledBack = this.groupResult(requested, groupId, members, results, disputeNotes);
        // 失败也要留痕：审计要看见「补偿尝试过且失败了」，而不是一片空白
        await this.auditCompensation(groupId, members, rolledBack.items, requested);
        return rolledBack;
      }
      // PRE-3: the terminal write happens after commit. If it cannot land, the row keeps the intent
      // (`compensating`) — the frozen "outcome unknown" reading — and the result must not claim
      // `revoked`. The facts did land; only their record is missing.
      //
      // PRE-3：终态写在提交之后。写不进去时该行保留意图（`compensating`）——已冻结的「结果未知」读数，
      // 结果也不得声称 `revoked`。事实已经落地，缺的是它的记录。
      for (const m of locals) {
        const recorded = await this.host.patchRevoke(
          m,
          { revokeStatus: 'revoked' },
          { attempts: 2 },
        );
        const driftNote = this.withDriftNote(undefined, driftByEffect.get(m.id) ?? null);
        if (!recorded) unrecorded.push(m.id);
        const message = recorded
          ? driftNote
          : '本地软删已执行，但撤销终态未能落库——状态未知，需人工核对';
        results.push({
          effectId: m.id,
          revoked: recorded,
          // `compensating` is neither revoked nor failed: the fact landed, the record did not.
          // `compensating` 既不是已撤销也不是失败：事实落地了，记录没有。
          ...(recorded ? {} : { skipped: true, reason: 'compensating', external: false }),
          revokeStatus: recorded ? 'revoked' : 'compensating',
          compensationGroup: groupId,
          // REV-9：漂移事实随该成员逐条可见（组级汇总不吞它）——没有漂移时不加该字段，保持原形状
          ...(message ? { message } : {}),
        });
      }
      // REV-14：本地补偿已落地，这时才把「承诺了却比不到」的那些落到**组根行**上——组级判定随即
      // 多半会读作 complete，那时这个差集只剩这里可读。放在提交之后（与上面「回滚不留回写」同口径）。
      await this.comparability.record(
        members.find((m) => m.parentEffectId == null) ?? members[0],
        comparisons,
      );
    }

    for (const m of externals) {
      const r = await this.doRevokeSingle(m);
      results.push({
        effectId: m.id,
        revoked: r.revoked,
        // ARC-7：逐条必须带上「没撤销是因为在等目标系统」这一读数——否则它在汇总里既不是 revoked
        // 也不是 skipped，会被 `_groupResult` 计成 failed（一次**成功**的派发被报成**失败**）。
        skipped: r.skipped,
        reason: r.reason === 'already_revoked' || r.reason === 'compensating' ? r.reason : undefined,
        external: r.external,
        revokeStatus: r.revokeStatus ?? null,
        message: r.message,
        compensationGroup: groupId,
      });
    }

    const out = this.groupResult(
      requested,
      groupId,
      members,
      results,
      disputeNotes,
      [...driftByEffect.entries()].map(
        ([id, d]) => `effect ${id} 的目标在写入后被改过（${d}），本次补偿把该改动一并抹除`,
      ),
      unrecorded.length > 0
        ? [
            `其中 ${unrecorded.length} 条本地补偿已执行、但撤销终态未能落库——状态未知，需人工核对`,
          ]
        : [],
    );
    // REV-16：整组拿走的那些目标上，还有哪些行指着它们。**在组级结论之外**再答一句 —— 组级会读出
    // 「全部补偿完成」，而那正是读者会据此断定「什么都干净了」的时刻；这个字段说的是它**没够到**的部分。
    // 成员自身作为排除集：组内一并撤销的那些行属于本次动作，不是「留下指着它的东西」。
    const downstreamReferences = await this.downstreamReferences(
      members.map((m) => ({ resultType: m.resultType, resultId: m.resultId })),
    );
    if (downstreamReferences) out.result.downstreamReferences = downstreamReferences;
    await this.auditCompensation(groupId, members, out.items, requested);
    return out;
  }

  /**
   * 补偿自身入 operation_audit（docs/cascade-compensation.spec.md §6）——该表入哈希链，故补偿自动入链。
   *
   * 只对**组级**补偿写显式行：单目标撤销已有全局拦截器行（HTTP 级），再写一行只是噪音；而组级补偿的
   * 逐成员结果只有服务层知道，拦截器看不见。
   * 落点 `targetId` = **根成员的业务 id**（不是副作用 id）→ 使其能被 evidence-root / 业务动作视图按业务对象捞到。
   *
   * 诚实取舍：`OperationAuditService.log()` 两个方言分支都只 logger.warn 吞掉异常、**永不抛**，
   * 故这里是 best-effort，**做不到 fail-closed**（本仓 AU-5 的 fail-closed 抛的是另一条链 / AI 审计）。
   * 但「状态改了却无记录」不会发生：权威运维态是逐条 revoke_status + 目标软删信号，
   * 本行只是链锚定的人读摘要。
   */
  private async auditCompensation(
    groupId: string,
    members: AiToolSideEffect[],
    items: RevokeBatchItem[],
    requested: AiToolSideEffect,
  ): Promise<void> {
    if (!this.operationAudit) return;
    const byId = new Map(members.map((m) => [m.id, m]));
    const root = members.find((m) => m.parentEffectId == null) ?? members[0];
    const detail = JSON.stringify(
      items.map((it) => {
        const m = byId.get(it.effectId);
        return {
          resultType: m?.resultType ?? null,
          resultId: m?.resultId ?? null,
          role: it.effectId === root.id ? 'root' : 'child',
          revoked: it.revoked,
          revokeStatus: it.revokeStatus ?? null,
        };
      }),
    );
    const uid = Number(requested.userId);
    await this.operationAudit.log({
      userId: Number.isFinite(uid) ? uid : null,
      action: 'COMPENSATE',
      method: 'DELETE',
      path: '/ai/tool-effects/compensate',
      featureKey: 'ai.compensate',
      featureFallback: 'ai · compensate',
      targetId: String(root.resultId),
      requestBody: JSON.stringify({
        groupId,
        requestedEffectId: requested.id,
        total: members.length,
        // REV-12：**指回原始授权决定**。此前这行有组、有成员明细、有 target，唯独没有「这次撤销依据的是
        // 哪次授权」⇒「谁许可 / 执行 / 收回」要靠证据包另行拼装，**行本身**答不出。这里带上授权时那条
        // 链的连接键，使三者可在一条链上读。**不新建第二套授权存储** —— 只指回，不复制。
        //
        // 为什么是这几个键、以及它们各自能指到哪（如实边界）：
        // - `runId`：**run 级确认时它就是那次决定本身的标识**（token = runId，见 run-level-approval.spec.md
        //   §2.3）—— 这是**直接引用**；单条确认/免确认写为 null。
        // - `conversationId` + `toolName`：单条确认唯一可靠的定位键 —— 授权依据（含策略版本）在会话的
        //   `tool_call` 审计行上，按这两个键可定位到它。**不把策略版本复制过来**：撤销时读到的策略版本是
        //   **此刻**的，不是授权时的，抄进来只会把后来的策略写成当时的依据。
        authorization: {
          conversationId: requested.conversationId ?? null,
          runId: requested.runId ?? null,
          toolName: requested.toolName,
        },
      }),
      // changes 是链外列（≤4000）→ 逐成员明细放这里不动 payload 契约；超长截断护栏
      changes: detail.length > 4000 ? `${detail.slice(0, 3997)}...` : detail,
      businessEvent: 'AiSideEffectCompensated',
    });
  }

  /**
   * 组级结果汇总：整组全成（或本就是已撤销态）才 `revoked:true`——
   * 「已请求外部补偿·结果未知」与「有成员失败」都不得伪装成已撤销（KB-6 诚实口径）。
   *
   * 第三个条件：**有争议**（REV-1 声明与持有不一致 / REV-5 另一个活组仍主张）同样不得报完成 ——
   * 持有多出来的那几条没有任何行承载，或那一组的业务动作不在本次范围内，
   * 「这个业务动作已完全撤销」是假的，即便持有的每一行都补偿成功。说明由 `disputeNotes` 原样带出。
   */
  private groupResult(
    requested: AiToolSideEffect,
    groupId: string,
    members: AiToolSideEffect[],
    results: RevokeBatchItem[],
    disputeNotes: string[],
    /**
     * REV-9：组内成员的「目标被中间写改过」清单。走**独立车道**——它与 `disputeNotes` 不同：
     * 争议要**拒绝报完成**（`revoked:false`），而漂移只要求**不静默**，不得据此改判定。
     * 默认空：回滚分支调用时什么都没补偿，谈不上抹掉谁的改动。
     */
    driftNotes: string[] = [],
    /**
     * PRE-3：不改变判定的补充说明（目前用于「本地软删已执行、终态未落库」的成员）。
     * 与 `driftNotes` 同为「必须被说出来、但不得改写判定」的车道。
     */
    extraNotes: string[] = [],
  ): { result: RevokeResult; items: RevokeBatchItem[] } {
    const disputed = disputeNotes.length > 0;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.revoked && !r.skipped).length;
    const alreadyRevoked = results.filter((r) => r.reason === 'already_revoked').length;
    const compensating = results.some(
      (r) => r.reason === 'compensating' || r.revokeStatus === 'compensating',
    );
    const revoked = results.filter((r) => r.revoked).length;
    const allOk = failed === 0 && revoked + alreadyRevoked === results.length;
    const summary =
      failed > 0
        ? `级联补偿失败（${failed}/${members.length} 条未补偿）：本地成员已整体回滚，未产生半补偿状态`
        : disputed
          ? `级联补偿 ${members.length} 条：${disputeNotes.join('；')}`
          : compensating
            ? `级联补偿 ${members.length} 条：本地已完成，外部成员补偿已请求、结果以目标系统为准`
            : `级联补偿 ${members.length} 条（同一次业务动作）`;
    // C8「不被伪装」：按声明不可撤的成员必须**被说出来** —— 否则「级联补偿 N 条」会被读成 N 条全撤了。
    // A `none` member must be named in the summary, or the group reads as if every member were revoked.
    const notApplicable = results.filter((r) => r.reason === 'revoke_class_none').length;
    const notes = [
      ...(notApplicable > 0
        ? [`其中 ${notApplicable} 条按声明不可撤（revokeClass=none：无撤销接口 / 无补偿端点），未参与补偿`]
        : []),
      ...driftNotes,
      ...extraNotes,
    ];
    return {
      result: {
        revoked: allOk && !compensating && !disputed,
        effectId: requested.id,
        compensationGroup: groupId,
        cascade: { groupId, total: members.length, revoked, skipped, failed },
        revokeStatus: failed > 0 ? 'revoke_failed' : compensating ? 'compensating' : 'revoked',
        // 逐成员 message 会被这条摘要遮住，故「不参与补偿的成员」与漂移清单都在此**并进摘要**
        // （组级读数的可见面就是它）。
        message: notes.length > 0 ? `${summary}；${notes.join('；')}` : summary,
      },
      items: results,
    };
  }

  /**
   * PRE-3: record the **intent** before the fact layer changes, and make that record a CAS.
   *
   * The order is the fix. `revoke_status` must exist *before* the target is soft-deleted, so there is
   * never a moment where the facts changed while the predicate layer has nothing to consult. If this
   * write fails, the target is left untouched: no state change, no divergence. The CAS
   * (`NULL` / `revoke_failed` / `revoked`-whose-target-came-back → `compensating`) is the same
   * arbitration point the external path uses (ARC-3), so two concurrent revokes cannot both own the row.
   *
   * The three outcomes are reported separately because the honest answer differs: `claimed` — proceed;
   * `not_claimed` — another writer owns it (or it is no longer dispatchable), re-read and report;
   * `write_failed` — the record could not be written, so **do not touch the target**.
   *
   * PRE-3：改事实层**之前**先写意图，并让这次写入成为一个 CAS。
   *
   * 顺序本身即是修法：`revoke_status` 必须在目标软删**之前**存在，于是永远不会出现「事实改了、
   * 判据层没东西可读」。这次写入失败就**不碰目标**——没有状态改动，也就没有不一致。CAS
   *（`NULL` / `revoke_failed` → `compensating`）与外部路径是同一个仲裁点（ARC-3），
   * 两个并发撤销因此不可能同时拥有这一行。
   *
   * 三种结果分开回报，因为诚实的答复各不相同：`claimed` 继续；`not_claimed` 已被另一写者认领
   *（或已不处于可派发态）——回读后如实回报；`write_failed` 记录写不进去——**不得触碰目标**。
   */
  private async claimLocalIntent(
    effect: AiToolSideEffect,
  ): Promise<'claimed' | 'not_claimed' | 'write_failed'> {
    try {
      const claim = await this.effectsRepo.update(
        {
          id: effect.id,
          // `revoked` is included for the ARC-1 round trip: a row revoked earlier whose target came
          // back from the recycle bin is deliberately re-revokable (the fact says it is live again).
          // `skipReason` already ruled out the "revoked and still soft-deleted" case before we get
          // here, and the CAS still serialises concurrent revokes: the first writer moves the row to
          // `compensating`, so the second one matches zero rows.
          //
          // Must use `Raw` for the NULL test — `In([null, ...])` is never true for NULL in SQL
          // (the same trap ARC-3 documents on the external path).
          //
          // 包含 `revoked` 是为了 ARC-1 的往返：早先撤销过、目标又从回收站恢复的行**应当可以再撤**
          //（事实层说它又活了）。走到这里之前 `skipReason` 已排除「revoked 且目标仍软删」；CAS 仍然
          // 串行化并发撤销：第一个写者把行改成 `compensating`，第二个就命中 0 行。
          revokeStatus: Raw(
            (alias) => `(${alias} IS NULL OR ${alias} = 'revoke_failed' OR ${alias} = 'revoked')`,
          ),
        },
        {
          revokeStatus: 'compensating',
          revokeRequestedAt: new Date(),
          // The previous request's acknowledgement does not speak for this one.
          revokeAcknowledgedAt: null,
        },
      );
      return claim?.affected ? 'claimed' : 'not_claimed';
    } catch (err) {
      this.logger.error(
        `[AiToolEffects] local revoke intent write FAILED — effect ${effect.id} ` +
          `(${effect.resultType}#${effect.resultId}); target left untouched: ` +
          `${(err as Error)?.message ?? String(err)}`,
      );
      return 'write_failed';
    }
  }

  private async doRevokeSingle(effect: AiToolSideEffect): Promise<RevokeResult> {
    // KB-6：撤销能力档位门控——none（不可撤/外部未知）直接拒绝，不再误走 externalRevoker
    // 制造"可撤销"假象。旧行 revokeClass 为 null 时按工具/resultType 兜底解析。
    const revokeClass: RevokeClass = this.classOf(effect);
    if (revokeClass === 'none') {
      return {
        revoked: false,
        effectId: effect.id,
        external: effect.resultType === 'proxy_call',
        message: '该副作用无撤销接口（revokeClass=none：不可撤 / 目标系统无补偿端点）',
      };
    }

    // D2-1f：本地实体撤销走 SideEffectRevoker（可替换为远程补偿 revoker）
    if (revokeClass === 'local_compensate' && this.revoker?.canHandle(effect.resultType)) {
      // REV-9：**先**问一句「目标还是不是我写的那条」，再软删——软删之后那行就没了，问也白问。
      const cmp = await this.comparability.targetDrift(effect);
      const drift = cmp.promised && cmp.compared ? cmp.drift : null;
      // PRE-3: the intent must land **before** the fact layer changes. If it cannot, do not touch
      // the target — that is what keeps "facts changed, no record" unrepresentable.
      // PRE-3：意图必须在事实层改动**之前**落地。写不成就**不碰目标** —— 这正是让「事实改了、
      // 没有记录」不可表示的那一步。
      const claim = await this.claimLocalIntent(effect);
      if (claim !== 'claimed') {
        // Re-read so the refusal names **which** refusal it was: a concurrent writer may have just
        // finished (`revoked`), just failed (`revoke_failed`), or still be in flight (`compensating`).
        // 回读一下，把「被拒」说清楚是哪一种：并发写者可能刚完成（`revoked`）、刚失败
        //（`revoke_failed`），或仍在进行中（`compensating`）。
        const now = await this.effectsRepo.findOne({ where: { id: effect.id } });
        const status = (now?.revokeStatus as RevokeResult['revokeStatus']) ?? undefined;
        if (claim === 'not_claimed' && status === 'revoked') {
          return {
            revoked: true,
            effectId: effect.id,
            skipped: true,
            reason: 'already_revoked',
            revokeStatus: 'revoked',
            message: '该副作用已由另一写者完成撤销（幂等成功）——本次未重复触发',
          };
        }
        if (claim === 'not_claimed' && status === 'revoke_failed') {
          return {
            revoked: false,
            effectId: effect.id,
            revokeStatus: 'revoke_failed',
            message: '该副作用的撤销处于失败态（另一写者刚写入）——请重试',
          };
        }
        return {
          revoked: false,
          effectId: effect.id,
          skipped: claim === 'not_claimed' ? true : undefined,
          reason: claim === 'not_claimed' ? 'compensating' : undefined,
          revokeStatus: status,
          message:
            claim === 'not_claimed'
              ? '该副作用的撤销已被另一写者认领（结果未知）——本次未触碰目标'
              : '撤销意图未能落库（`revoke_status` 写失败）——本次未触碰目标，状态未知需人工核对',
        };
      }
      let r: { revoked: boolean; message?: string };
      try {
        r = await this.revoker.revoke(effect.resultType, effect.resultId, effect.userId);
      } catch (err) {
        // The fact layer did not change. Record a readable failure (best-effort); if even that
        // cannot land, the row keeps the intent, which reads as unknown rather than "not revoked".
        // 事实层没有改动。落一个可读的失败态（尽力而为）；连它都写不进去时该行保留意图，
        // 读作「未知」而不是「未撤销」。
        await this.host.patchRevoke(effect, { revokeStatus: 'revoke_failed' }, { attempts: 2 });
        throw err;
      }
      this.logger.log(`[AiToolEffects] revoked ${effect.resultType} #${effect.resultId} (effect ${effect.id})`);
      if (!r.revoked) {
        const recorded = await this.host.patchRevoke(
          effect,
          { revokeStatus: 'revoke_failed' },
          { attempts: 2 },
        );
        return {
          revoked: false,
          effectId: effect.id,
          message: recorded
            ? this.withDriftNote(r.message, drift)
            : `${this.withDriftNote(r.message, drift) ?? ''}；且失败态未能落库——状态未知，需人工核对`,
          revokeStatus: recorded ? 'revoke_failed' : 'compensating',
        };
      }
      // The fact layer changed. Record the terminal state; if that cannot land, the intent stays
      // (`compensating`) and the result must not claim `revoked`: the facts landed, the record did
      // not. `compensating` is the frozen "outcome unknown" reading, not "not revoked".
      //
      // 事实层已改动。写终态；写不进去时保留意图（`compensating`），结果也不得声称 `revoked`：
      // 事实落地了，记录没有。`compensating` 是已冻结的「结果未知」读数，不是「未撤销」。
      const recorded = await this.host.patchRevoke(
        effect,
        { revokeStatus: 'revoked' },
        { attempts: 2 },
      );
      // REV-14：软删落地后才落这份读数——判定没成立时不记（同「本地回滚不留回写」的口径）。
      // 单目标行就是它自己的根，故写在本行。
      await this.comparability.record(effect, [
        { ref: { resultType: effect.resultType, resultId: effect.resultId }, cmp },
      ]);
      if (drift) {
        this.logger.warn(
          `[AiToolEffects] effect ${effect.id}: 目标 ${effect.resultType} #${effect.resultId} 在写入后被改过（${drift}）`,
        );
      }
      // REV-16：这次撤销拿走的这个目标，还有哪些行指着它。只在撤销**真的落地**时问 —— 没撤成，谈不上
      // 「没够到」。字段在类型没有引用模型时**缺席**（未检查），与「查过、没有」不是一回事。
      const downstreamReferences = r.revoked
        ? await this.downstreamReferences([
            { resultType: effect.resultType, resultId: effect.resultId },
          ])
        : undefined;
      return {
        revoked: recorded,
        effectId: effect.id,
        // Unknown, not failed: the soft-delete landed; only its record is missing. `skipped` keeps
        // the batch tally from counting it as a failure (same treatment ARC-7 gives `compensating`).
        // 是「未知」而不是「失败」：软删落地了，缺的是记录。`skipped` 使它不被批量计成失败
        //（与 ARC-7 对 `compensating` 的处理同向）。
        ...(recorded ? {} : { skipped: true, reason: 'compensating', external: false }),
        message: recorded
          ? this.withDriftNote(r.message, drift)
          : '本地软删已执行，但撤销终态未能落库——状态未知，需人工核对',
        revokeStatus: recorded ? 'revoked' : 'compensating',
        ...(downstreamReferences ? { downstreamReferences } : {}),
      };
    }
    // governed_external / 本地 canHandle 不中的 proxy_call：B 路径外部补偿
    if (this.externalRevoker) {
      // REV-2 细化：**外呼之前**先写「意图」。这一刻的诚实读数是「**可能根本没到达**外部系统」；
      // 此前是「先外呼、返回后才写态」——进程若在调用中途死掉则一个字段都不写，该行读起来像**从未请求过补偿**，
      // 「当前未了结」的聚合里凭空少一条。「发送前」与「已确认」是两个事件，其间的间隙正是那个真实的不确定。
      //
      // ARC-3：这一次写入同时是**派发认领（CAS）** —— 此前是无条件 `update`（裸 read-modify-write），
      // 两次并发撤销会**各自读到 `revoke_status = null` 然后各派发一次**：退款/取消订单这类端点若非幂等，
      // 那是**真双发**；而且后一次写回的 `revoke_failed` 还会**覆盖**前一次的成功读数。
      // 条件更新是唯一仲裁点（同 `ConfirmationStore.resolve` / `R4ApprovalService._claimExecution` 先例）：
      // 只有仍处「未派发」（NULL）或「上次失败、可重试」（revoke_failed）的行才放行派发；
      // 已被派发（compensating）或已完成（revoked）⇒ 命中 0 行 ⇒ **不派发**，如实回报。
      // 认领落地后，本行在这轮派发里**只有这一个写者**，故上面那条覆盖风险随之一并消失——不需要再给回写加条件。
      //
      // ⚠ 用 `Raw` 写这条谓词，**不要** `In([null, 'revoke_failed'])`：SQL 里 `x IN (NULL, ...)` 对 NULL 恒不成立
      //（要 `IS NULL`），照 `In` 写会让**首次派发**永远认领不到。
      //
      // **fail-closed**：判据取 `!claim?.affected` 而非 `=== 0` —— 底层没给出可判定的 `affected` 时
      //（替身 / 非标准驱动），宁可当作认领失败、不派发，也不把「读数缺失」当成许可。
      // 口径同 `ConfirmationStore.resolve`：拿不到 affected 一律拒。
      const claim = await this.effectsRepo.update(
        {
          id: effect.id,
          revokeStatus: Raw((alias) => `(${alias} IS NULL OR ${alias} = 'revoke_failed')`),
        },
        {
          revokeStatus: 'compensating',
          revokeRequestedAt: new Date(),
          // 上一次请求的确认不代表这一次 —— 重试（revoke_failed 可重试）必须把旧确认清掉，
          // 否则新意图会被旧确认冒充成「已到达」。
          revokeAcknowledgedAt: null,
        },
      );
      if (!claim?.affected) {
        const now = await this.effectsRepo.findOne({ where: { id: effect.id } });
        return {
          revoked: false,
          effectId: effect.id,
          external: true,
          skipped: true,
          reason: 'compensating',
          revokeStatus: (now?.revokeStatus as RevokeResult['revokeStatus']) ?? undefined,
          message: '该副作用的外部补偿已在派发中（或已完成）——本次未重复派发',
        };
      }
      const r = await this.externalRevoker.revoke(effect.toolName, effect.resultId, effect.userId);
      // 外呼返回 = **确认**（对方应答过，含拒绝）：单独记为一个事件，与意图之间留下可读的间隙。
      // KB-6：2xx ≠ 确认回滚——补偿端点 2xx 只证明「已请求」，Java 端结果未知 → 落 compensating 而非 revoked。
      //
      // PRE-3：这次写入同样不得静默失败。写不进去时该行仍停在意图态（`compensating` + 无确认），
      // 读数会退成「可能根本没到达」——那是**保守方向的未知**，但结果不得声称一个更确定的态。
      // The same rule on the external path: a failed write leaves the row at `compensating` with no
      // acknowledgement. That reads as "possibly never reached" — a conservative unknown — and the
      // result must not claim a more definite state than the record holds.
      const acknowledged = await this.host.patchRevoke(
        effect,
        {
          revokeStatus: r.ok ? 'compensating' : 'revoke_failed',
          revokeAcknowledgedAt: new Date(),
        },
        { attempts: 2 },
      );
      if (!r.ok) {
        // 对方拒绝 = 补偿**失败**（不是「未完成」）——据实计为失败，**不进 skipped**（两者在汇总里必须分得开）。
        return {
          revoked: false,
          effectId: effect.id,
          external: true,
          compensated: false,
          revokeStatus: acknowledged ? 'revoke_failed' : 'compensating',
          message: acknowledged
            ? r.message
            : `${r.message}；但失败态未能落库——状态未知，需人工核对`,
        };
      }
      // ARC-2 / ARC-7：**`compensating` 不得报 `revoked`**。KB-6 与本文件组级路径（`_groupResult`）早已如此，
      // 唯独单条外部分支此前用 `revoked: r.ok`——于是同一条 `compensating`、同一状态，单条说「已撤销」而组级说「未完成」。
      // 现在四处同向：不仅 `revoked:false`，还给出与「本就在 compensating 的行」**完全相同**的读数
      // （`skipped` + `reason:'compensating'`），批量的 `revoked` 计数因此不再把待目标系统的成员算成已撤销——
      // 那三个数直接进管理台 toast（`aiCenterConvRevokeDone`）。
      return {
        revoked: false,
        effectId: effect.id,
        external: true,
        compensated: true,
        skipped: true,
        reason: 'compensating',
        revokeStatus: 'compensating',
        message: acknowledged
          ? `Java 端已请求补偿（${r.message}）；结果以目标系统为准`
          : `Java 端已请求补偿（${r.message}）；但确认时刻未能落库——抵达凭据未知`,
      };
    }
    return {
      revoked: false,
      effectId: effect.id,
      external: true,
      message: 'B 路径外部副作用撤销需 Java 端补偿（无本地实体可软删 / 未配置补偿执行器）',
    };
  }
}
