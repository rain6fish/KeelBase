// SPDX-License-Identifier: Apache-2.0

import { Not, Repository } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { EffectRegistration } from './effect-registration';
import { targetKey } from './effect-shared';
import type { SideEffectRevoker, DerivedReferenceCount } from './side-effect-revoker';
import type { RevokeClass } from '../interfaces/tool.interface';
import type { CrossGroupClaim, RevokeResult, SplitGroupFinding } from './tool-effects.types';

/**
 * 撤销 / 补偿的**宿主接缝**：这一簇要用到三样留在服务上的东西，故以接口显式声明、而不是把整份服务
 * 递进来（拆分第七批为登记那一簇开的先例，这里照办）：
 * - `resolveSnapshotClass` —— A / 投影 / 撤销三簇共用的档位快照解析；
 * - `loadTarget` —— 投影与撤销共用的目标状态读取。
 *
 * The seam back to the host for the revoke cluster: three things stay on the service, declared here as an
 * interface rather than handing over the whole service.
 */
export interface RevokeHostSeam {
  resolveSnapshotClass(toolName: string, resultType: string): RevokeClass;
  loadTarget(type: string, id: number): Promise<{ title?: string; deletedAt?: Date | null } | null>;
}

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
  constructor(
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    private readonly registration: EffectRegistration,
    private readonly host: RevokeHostSeam,
    private readonly revoker?: SideEffectRevoker,
  ) {}

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

  /** 撤销跳过判据（单条/批量共用）：已软删 revoked / 已请求外部补偿 compensating；revoke_failed 视为可重试 */
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
    // 补偿中 = 外部结果未知 → 如实 revoked:false（KB-6：不得显示为已撤销）。
    const alreadyRevoked = reason === 'already_revoked';
    return {
      revoked: alreadyRevoked,
      effectId: effect.id,
      skipped: true,
      reason,
      external: reason === 'compensating',
      revokeStatus: (effect.revokeStatus as RevokeResult['revokeStatus']) ?? undefined,
      message:
        reason === 'already_revoked'
          ? '该副作用此前已撤销（幂等成功），跳过重复触发'
          : '外部补偿已请求、结果以目标系统为准——跳过重复触发',
    };
  }

  /** 撤销能力档位（KB-6）：行上快照优先；旧行/未快照行按工具注册或 resultType 兜底解析 */
  classOf(effect: AiToolSideEffect): RevokeClass {
    return (
      (effect.revokeClass as RevokeClass) ??
      this.host.resolveSnapshotClass(effect.toolName, effect.resultType)
    );
  }
}
