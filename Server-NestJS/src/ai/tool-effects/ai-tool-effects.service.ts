// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { EffectComparability } from './effect-comparability.entity';
import { AiWriteClaim } from './ai-write-claim.entity';
import type { ExternalRevoker } from '../proxy/proxy-revoker.service';
import { SIDE_EFFECT_REVOKER, type DerivedReferenceCount } from './side-effect-revoker';
import type { SideEffectRevoker } from './side-effect-revoker';
import { GOVERNANCE_REPORTER } from '../governance-bridge/governance-reporter.service';
import type { GovernanceReporter } from '../governance-bridge/governance-reporter.service';
import type { AuditChainService } from '../../common/audit-chain/audit-chain.service';
import { OperationAuditService } from '../../operation-audit/operation-audit.service';
import { ToolRegistry } from '../tools/tool-registry';
import { resolveRevokeClass, type RevokeClass } from '../interfaces/tool.interface';
import type { DeclaredSideEffect } from './effect-composition';
import { paginated } from '../../common/dto/paginated';
import { ConfigService } from '@nestjs/config';
import { IsNull, LessThan, Not, Raw } from 'typeorm';
import { revokeAge, revokeWindow, DEFAULT_REVOKE_STALE_MINUTES } from './revoke-staleness';
import { SideEffectSnapshotCaptor } from './side-effect-snapshot-captor';
import { buildKey, memberKey, targetKey } from './effect-shared';
import { EffectChainWriter } from './effect-chain';
import { WriteClaimStore } from './write-claim.store';
import { EffectComparabilityStore } from './effect-comparability.store';
import { EffectDisputeStore, type RevokePatch } from './effect-dispute.store';
import { EffectRegistration } from './effect-registration';
import {
  EXTERNAL_REVOKER,
  type CrossGroupClaim,
  type RevokeBatchItem,
  type RevokeBatchResult,
  type RevokeClaimOutcome,
  type RevokeResult,
  type RevokeRunBatchResult,
  type SideEffectSnapshot,
  type SplitGroupFinding,
  type TargetComparison,
  type WriteToolContext,
} from './tool-effects.types';

// 拆分第一批（2026-10-11）：`sortKeys` 从这里**再导出** —— 它有两个仓内消费者
// （`ai.service.ts`、`tool-execution.service.ts`），搬走时不能把它们的 import 打断。
// `sortKeys` is re-exported: it has two in-repo consumers whose imports must keep working.
export { sortKeys } from './effect-shared';

// 拆分第二批（2026-10-11）：这些类型搬到了 `tool-effects.types.ts`，在此**再导出**，使本模块对外的
// 面子与搬动前一字不差。**唯一不在名单里的是 `TargetComparison`** —— 它此前就不是本模块的导出。
// Re-exported so this module's surface is what it was before the move. `TargetComparison` is
// deliberately absent: it was never part of that surface.
export {
  EXTERNAL_REVOKER,
  type CrossGroupClaim,
  type RevokeBatchItem,
  type RevokeBatchResult,
  type RevokeCascadeSummary,
  type RevokeClaimOutcome,
  type RevokeComparabilityAttempt,
  type RevokeComparabilityEvidence,
  type RevokeDisputeEvidence,
  type RevokeResult,
  type RevokeRunBatchResult,
  type SideEffectSnapshot,
  type SplitGroupFinding,
  type WriteToolContext,
} from './tool-effects.types';

/**
 * HS-3 写工具幂等与补偿：
 * - 幂等：同会话同工具同参数（idempotencyKey）重复调用返回已有结果，防 LLM 重试/并发重复创建
 * - 可撤销：记录副作用（resultType+resultId），管理台可软删对应 event/todo（衔接 RG-3 回收站）
 */
@Injectable()
export class AiToolEffectsService {
  private readonly logger = new Logger(AiToolEffectsService.name);

  constructor(
    @InjectRepository(AiToolSideEffect)
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    @Optional() @Inject(SIDE_EFFECT_REVOKER)
    private readonly revoker?: SideEffectRevoker,
    @Optional() @Inject(EXTERNAL_REVOKER)
    private externalRevoker?: ExternalRevoker,
    // D2-3c：可选治理上报（业务系统配 GOVERNANCE_URL 时副作用双写）
    @Optional() @Inject(GOVERNANCE_REPORTER)
    private readonly reporter?: GovernanceReporter,
    // G-3（§internal.17 ① G-3）：副作用哈希链（AuditChainService，ai.module 已 import AuditChainModule；缺失降级不链化）
    @Optional() private readonly auditChain?: AuditChainService,
    // KB-6：工具注册表（解析副作用撤销能力档位快照；ToolRegistry 为 AiModule provider，构造器注入）
    @Optional() private readonly toolRegistry?: ToolRegistry,
    // G-3 链写入串行化（postgres 走 DB 锁事务；缺失则退化为进程内串行）——见 _withChainWrite
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
    /**
     * docs/cascade-compensation.spec.md §6：补偿自身入 operation_audit（该表入哈希链 → 补偿自动入链）。
     * @Optional：治理台/单测装配可能没有 OperationAuditModule（缺则该链降级为无显式补偿行）。
     */
    @Optional() private readonly operationAudit?: OperationAuditService,
    /** REV-2：陈旧阈值来源（`REVOKE_STALE_MINUTES`）。@Optional：单测装配可省，省则用默认值。 */
    @Optional() private readonly configService?: ConfigService,
    /**
     * REV-9：撤销前重读目标，用作「还是不是我写的那条」的比对源。**必须与写入时同一个捕获器**
     * ——`after_snapshot` 就是它产的，换一个实现去读会得到不可比的形状（归一化不同即永远「漂移」）。
     * @Optional：缺失时判不了，如实不报（见 `_targetDrift`）。
     */
    @Optional() private readonly snapshotCaptor?: SideEffectSnapshotCaptor,
    /**
     * ACT-5/6 切片1：执行级幂等的占位行仓库。**放在构造器末尾**，使既有的位置式装配不被扰动。
     * @Optional：缺失即**退回旧行为**（`claimWrite` 报 `{won:true}`）——只在单测装配/降级接线时发生；
     * 生产由 `ai.module` 的 `TypeOrmModule.forFeature` 提供。**如实标注**：缺它时写不重复保护**不生效**。
     */
    @Optional()
    @InjectRepository(AiWriteClaim)
    private readonly claimsRepo?: Repository<AiWriteClaim>,
    /**
     * REV-17：可比性记录的**历史**（每次走到比对的撤销尝试一行）。同样**放在构造器末尾**，使既有的位置式
     * 装配不被扰动。@Optional：缺失即**退回「无历史」**（读侧返回 `[]`、写侧不 append）——只在单测装配/
     * 降级接线时发生；生产由 `ai.module` 的 `TypeOrmModule.forFeature` 提供。**如实标注**：缺它时这段历史
     * 记不下来（但既有的单列读数仍可读，见 `_recordComparability`）。
     */
    @Optional()
    @InjectRepository(EffectComparability)
    private readonly comparabilityRepo?: Repository<EffectComparability>,
  ) {
    // 拆分第三批（2026-10-11）：链写入器在**构造器体内**建立 —— 构造器签名一字未动（有二十多处位置式
    // `new AiToolEffectsService(...)` 与两个 Nest 模块依赖它）。**只此一份**：登记与撤销共用同一个它，
    // 否则就是两条串行队列，单写者（sqlite）那条路上链丢更新。
    // Built in the constructor body so the signature stays put. Exactly one instance: registration and
    // revocation share it, or the single-writer path ends up with two serialization queues.
    this.chain = new EffectChainWriter(this.effectsRepo, this.auditChain, this.dataSource);
    this.claims = new WriteClaimStore(this.effectsRepo, this.claimsRepo);
    this.comparability = new EffectComparabilityStore(this.comparabilityRepo, this.snapshotCaptor);
    // 争议侧回写撤销态列时走**服务上那一处** `_patchRevoke`（撤销侧也在用，单一实现）——
    // 以回调注入而不是各写一份：两条路写同一列，正是本仓反复修的那类缺陷的成因。
    this.dispute = new EffectDisputeStore(this.effectsRepo, (effect, patch: RevokePatch) =>
      this._patchRevoke(effect, patch),
    );
    // 宿主接缝（拆分第七批）：登记那一簇要问一句 `_resolveSnapshotClass`（A / 投影 / 撤销三簇共用，
    // 故留在这里），以**一个回调**注入 —— 不把整份服务递进去。
    this.registration = new EffectRegistration(
      this.effectsRepo,
      this.chain,
      this.dispute,
      this.claims,
      (toolName, resultType) => this._resolveSnapshotClass(toolName, resultType),
      this.reporter,
    );
  }

  /** 副作用登记（拆分第七批，2026-10-11）：实现在 `effect-registration.ts`。 */
  private readonly registration: EffectRegistration;

  /** 记录写工具副作用（execute 成功后调用）—— 转发给登记层。 */
  async record(
    ctx: WriteToolContext,
    resultType: string,
    resultId: number,
    snapshot?: SideEffectSnapshot,
  ): Promise<AiToolSideEffect> {
    return this.registration.record(ctx, resultType, resultId, snapshot);
  }

  /** 复合写工具登记（一次调用跨表落多行、同属一个补偿组）—— 转发给登记层。 */
  async recordGroup(
    ctx: WriteToolContext,
    effects: DeclaredSideEffect[],
    snapshots?: Array<SideEffectSnapshot | undefined>,
  ): Promise<AiToolSideEffect[]> {
    return this.registration.recordGroup(ctx, effects, snapshots);
  }

  /** 载入整组副作用（补偿组内全部行，按 id 升序 = 登记序；根在最前）—— 转发给登记层。 */
  async listGroup(compensationGroup: string): Promise<AiToolSideEffect[]> {
    return this.registration.listGroup(compensationGroup);
  }

  /** REV-1/4/5 · ARC-6 争议的标记、读取与确认（拆分第六批，2026-10-11）：实现在 `effect-dispute.store.ts`。 */
  private readonly dispute: EffectDisputeStore;

  /** ARC-6：确认一条争议（管理端动作）—— 转发给争议 store。 */
  async acknowledgeDispute(
    effectId: number,
    adminUserId: string,
  ): Promise<{ ok: boolean; reason?: 'not_found' | 'no_open_dispute'; acknowledgedAt?: string }> {
    return this.dispute.acknowledgeDispute(effectId, adminUserId);
  }

  /** REV-9/14/17 内容漂移比对与可比性记录（拆分第五批，2026-10-11）：实现在 `effect-comparability.store.ts`。 */
  private readonly comparability: EffectComparabilityStore;

  /** G-3 副作用链写入与校验（拆分第三批）：唯一实例，登记与撤销共用。 */
  private readonly chain: EffectChainWriter;

  /** ACT-5/6 执行级幂等的占位行（拆分第四批，2026-10-11）：实现在 `write-claim.store.ts`。 */
  private readonly claims: WriteClaimStore;

  /** G-3：副作用哈希链完整性校验 —— 转发给链写入器（实现在 `effect-chain.ts`）。 */
  async verifySideEffectChain(): Promise<{
    valid: boolean;
    checked: number;
    hashed: number;
    firstHashedId: number | null;
  }> {
    return this.chain.verify();
  }

  // ── ACT-5/6 执行级幂等：以下六个公开方法转发给 `this.claims`（实现见 `write-claim.store.ts`） ──
  // 公开面与搬动前一字不差：`tool-execution.service.ts` 与 `ai.service.ts` 的调用点不必知道这次拆分。

  /** 尝试幂等返回：同 key 已有副作用 → `{ existing: true, effect }`。 */
  async findExisting(key: string): Promise<{ existing: boolean; effect?: AiToolSideEffect }> {
    return this.claims.findExisting(key);
  }

  /** ACT-5/6：为写工具执行占位（唯一约束即仲裁点）。 */
  async claimWrite(
    ctx: WriteToolContext,
  ): Promise<{ won: boolean; status?: string; effectId?: number | null }> {
    return this.claims.claimWrite(ctx);
  }

  /** 执行完成且副作用已登记 ⇒ 落定。 */
  async settleClaim(key: string, effectId: number | null): Promise<void> {
    return this.claims.settleClaim(key, effectId);
  }

  /** 本地实体写失败且确认未落库 ⇒ 释放占位。 */
  async releaseClaim(key: string, reason: string): Promise<void> {
    return this.claims.releaseClaim(key, reason);
  }

  /** ACT-5（消费者①）：把这次写的审计行挂到占位行上。 */
  async attachAuditRow(
    ref: { userId: string; conversationId?: string; toolName: string; argsJson: string },
    auditRowId: number,
  ): Promise<void> {
    return this.claims.attachAuditRow(ref, auditRowId);
  }

  /** 崩溃残留：仍是 `claimed` 且已超过阈值（可见、不自动解决）。 */
  async listStaleClaims(olderThanMs: number): Promise<AiWriteClaim[]> {
    return this.claims.listStaleClaims(olderThanMs);
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
  private async _downstreamReferences(
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
  private _withDriftNote(message: string | undefined, drift: string | null): string | undefined {
    if (!drift) return message;
    const note = `⚠ 目标在写入后被改过（${drift}），本次补偿把该改动一并抹除`;
    return message ? `${message}；${note}` : note;
  }

  /** REV-2：陈旧阈值（分钟）——配置缺失时回落到与 Joi 默认一致的常量，避免两处各写一个数。 */
  private _staleThresholdMinutes(): number {
    const configured = this.configService?.get<number>('REVOKE_STALE_MINUTES');
    return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_REVOKE_STALE_MINUTES;
  }

  /** AiModule useFactory 组装 B 路径 revoker（ToolRegistry 非 provider，运行时注入） */
  setExternalRevoker(revoker: ExternalRevoker): void {
    this.externalRevoker = revoker;
  }

  /** 幂等键：sha256(userId:conversationId:toolName:stableArgsJson) —— 实现在 `effect-shared.ts`，此处只是委托。 */
  static buildKey(ctx: WriteToolContext): string {
    return buildKey(ctx);
  }

  /**
   * 复合写工具组内成员幂等键 —— 实现在 `effect-shared.ts`，此处只是委托。
   * 仓内既有的 `AiToolEffectsService.memberKey(...)` 调用点因此一字不用改。
   */
  static memberKey(baseKey: string, index: number, resultType: string, resultId: number): string {
    return memberKey(baseKey, index, resultType, resultId);
  }






  /**
   * KB-6：解析副作用撤销能力档位快照。工具注册表命中 → 用工具显式/推导值（含 ProxyTool 显式档位）；
   * 未注册（生成模块等动态工具）→ 按 revoker.canHandle(resultType) 兜底（本地可软删 → local_compensate，否则 none）。
   */
  private _resolveSnapshotClass(toolName: string, resultType: string): RevokeClass {
    try {
      const tool = this.toolRegistry?.getTool(toolName);
      if (tool) return resolveRevokeClass(tool);
    } catch {
      // tool 未注册：落入 resultType 兜底
    }
    return this.revoker?.canHandle(resultType)
      ? 'local_compensate'
      : 'none';
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
  private async _crossGroupClaims(
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
  private async _claimsForRevoke(effect: AiToolSideEffect): Promise<CrossGroupClaim[]> {
    if (!effect.compensationGroup) return [];
    const members = await this.registration.listGroup(effect.compensationGroup);
    return this._crossGroupClaims(effect.compensationGroup, members.length ? members : [effect]);
  }



  /** KB-6/deferred④：撤销可点 = 服务端单一权威（status=executed 且档位非 none）；三端据此渲染，不各自复制判定 */
  private _isRevocable(
    revokeClass: string | null | undefined,
    status: string,
  ): boolean {
    if (status !== 'executed') return false;
    return (
      revokeClass === 'local_compensate' ||
      revokeClass === 'governed_external' ||
      revokeClass === 'transactional'
    );
  }

  /** 管理台：按用户/类型列出 AI 创建的副作用（含目标记录当前状态） */
  async list(options: { userId?: number; page?: number; limit?: number; stale?: boolean } = {}) {
    const page = options.page ?? 1;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const where: Record<string, unknown> = {};
    if (options.userId !== undefined) where.userId = String(options.userId);

    // REV-2：只看「陈旧未了结」时在库侧过滤（compensating 且请求时刻早于 now − 阈值）。
    // 请求时刻为 NULL 的旧行天然不匹配 —— 与 revokeAge 对它们「年龄未知，故不判陈旧」的口径一致，
    // 不把「查不到年龄」悄悄算成「陈旧」。
    const thresholdMinutes = this._staleThresholdMinutes();
    if (options.stale === true) {
      where.revokeStatus = 'compensating';
      where.revokeRequestedAt = LessThan(new Date(Date.now() - thresholdMinutes * 60_000));
    }

    const [items, total] = await this.effectsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // REV-17：本页每一行的可比性**历史**，一次查询取全页（不按行 N+1 —— 这个映射里已经有一次
    // `_loadTarget`，不该再加一层按行的往返）。
    const comparabilityHistory = await this.comparability.historyFor(items.map((e) => e.id));

    // 附带目标记录当前状态（软删则标注可恢复）
    const enriched = await Promise.all(
      items.map(async (effect) => {
        const target = await this._loadTarget(effect.resultType, effect.resultId);
        const targetSoftDeleted = target?.deletedAt != null;
        // REV-2：`compensating` 的年龄与陈旧度。只回答「多久了 / 可能已陈旧」，
        // 真值仍在目标系统 —— 不据此把 revokeStatus 改写成成功或失败。
        const age = revokeAge(effect.revokeStatus, effect.revokeRequestedAt, new Date(), thresholdMinutes);
        // REV-2 细化：同一条 `compensating` 还分两个窗口 —— 「可能根本没到达」（无确认凭据）与
        // 「确实到达了但对方没给终态」（有确认凭据）。此前两者读数相同，聚合视图因此不诚实。
        const window = revokeWindow(effect.revokeStatus, effect.revokeAcknowledgedAt);
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          argsHash: effect.argsHash,
          createdAt: effect.createdAt,
          targetExists: !!target,
          targetSoftDeleted,
          targetTitle: target?.title ?? null,
          beforeSnapshot: effect.beforeSnapshot ?? null,
          afterSnapshot: effect.afterSnapshot ?? null,
          // KB-6：撤销能力档位 + 归一状态（4 值），供前端据档位诚实渲染（none 不显示撤销钮）
          revokeClass: this._readRevokeClass(effect),
          revokeStatus: effect.revokeStatus ?? null,
          // REV-2：补偿请求时刻 + 年龄 + 陈旧标记（阈值由服务端配置，前端不必硬编码）
          revokeRequestedAt: effect.revokeRequestedAt ? effect.revokeRequestedAt.toISOString() : null,
          revokePending: age.pending,
          revokeAgeMinutes: age.ageMinutes,
          revokeStale: age.stale,
          // REV-2 细化：确认时刻 + 窗口（unacknowledged = 可能未到达 / awaiting_target = 已到达无回音）
          revokeAcknowledgedAt: effect.revokeAcknowledgedAt
            ? effect.revokeAcknowledgedAt.toISOString()
            : null,
          revokeWindow: window,
          // REV-11: **who this is on**. `revokeStale` already answers "is anything stuck" and the two
          // windows answer "stuck how", but neither says whose work it is — and "somewhere to look"
          // and "someone has to look" are different things. The accountable party is the user on
          // whose behalf the write happened; it is an existing column, surfaced rather than inferred.
          // The assignee for this surface is the admin role itself, which is why no assignee field is
          // invented here: only admins can read this list at all.
          // REV-11：**这是谁的活**。`revokeStale` 已答「有没有卡住」、两个窗口已答「怎么卡住的」，
          // 却都没说是谁的活——而「有的看」与「必须有人看」是两件事。责任人是那次写所代表的使用者，
          // 是一个**既有列**的暴露，不是推断。本面的指派对象就是管理端角色本身，故此处不另造指派字段：
          // 这张列表本来就只有管理员读得到。
          ownerUserId: effect.userId,
          // REV-7：**谁在替该用户执行**，读自本行 —— 不 join 审计行即可回答（导入本列之前的行是 null，
          // 语义为「未知」，不回填）。
          agentId: effect.agentId ?? null,
          // REV-10：**账上没有的写**（本次调用在数据层真的写了、而登记层没有对应行）。`null` = 没观察到。
          undeclaredWrites: this.registration.parseUndeclaredWrites(effect.undeclaredWrites),
          // REV-11: "needs claiming" is **derived**, never stored — a stale row nobody has taken on.
          // One fact, one home: storing it alongside the two columns below would let the flag and the
          // columns disagree, and no reader could tell which one to believe.
          // REV-11：「需认领」是**派生**的，从不落库——滞留且无人接手。同一事实只住一处：若与下面两列
          // 并列存一份，flag 与列就可能互相矛盾，而读者无从判断该信哪个。
          revokeNeedsClaim: age.stale && effect.revokeClaimedBy == null,
          revokeClaimedBy: effect.revokeClaimedBy ?? null,
          revokeClaimedAt: effect.revokeClaimedAt ? effect.revokeClaimedAt.toISOString() : null,
          // REV-1：该组是否「声明与持有不一致」——标记 + 证据（被拒声明与双向差集），供管理端解释为何撤销未报完成
          disputed: this.dispute.hasOpenDispute(effect),
          dispute: this.dispute.parseDispute(effect.revokeDispute),
          // REV-17: **the history of what this revoke promised to check and could not** — one entry per
          // attempt, oldest first, plus the legacy single-column reading when one exists (it predates the
          // table, so its moment is unknown and is not invented). An empty list is the one reading that
          // says nothing was ever checked; `checked` says which of the two a given attempt's reading is,
          // so "checked and clean" and "never revoked" no longer collapse into the same value.
          // REV-17：**这次撤销承诺要查、却没能查到的那些的历史** —— 每次尝试一条、按时间升序；若存在旧的
          // 单列读数也带上（它早于本表，其时刻不可考，故不臆造）。空列表是唯一一个「从未查过」的读数；
          // `checked` 说明某次尝试的读数属于哪一种，故「查过且干净」与「从未撤销」不再塌成同一个值。
          revokeComparability: this.comparability.comparabilityFor(effect, comparabilityHistory),
          // REV-6：该行身份缺「变更」那半（成组行登记时无变更快照）——读取侧不得默认为完整身份
          identityIncomplete: effect.identityIncomplete === true,
          // REV-13: **why** the change half is missing. `null` means one of two things and neither
          // pretends to be knowledge: the row is not flagged, or it was flagged before this column
          // existed (reason unknowable). Two of the four values are faults, two are design choices.
          // REV-13：缺变更那半的**成因**。`null` 有两种读法，都不冒充已知：该行未置标，或置标于本列
          // 出现之前（原因不可考）。四个取值里两个是故障、两个是设计选择。
          identityIncompleteReason: effect.identityIncompleteReason ?? null,
          // 级联补偿（v3）：组标识 + 根引用，供前端显示「这是 N 条中的第 M 条」
          compensationGroup: effect.compensationGroup ?? null,
          parentEffectId: effect.parentEffectId ?? null,
          status: this._normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this._isRevocable(
            this._readRevokeClass(effect),
            this._normalizeStatus(effect, targetSoftDeleted),
          ),
          // D2：AI 决策证据 ↔ 实际状态变化——由快照导出紧凑变更摘要（不返回全量值，控载荷）
          change: this._summarizeChange(effect.beforeSnapshot, effect.afterSnapshot),
        };
      }),
    );

    const page_ = paginated(enriched, total, page, limit);
    if (options.stale !== true) return page_;

    // ACT-6 第 2 片留下缺口、用户 2026-09-30 裁定接到这条车道：卡住的**占位行**此前只对代码可见 ——
    // `listStaleClaims` 的唯一调用者是它的用例，没有端点、没有管理台露出。它装两类东西，同一口径
    // 「**可见，不自动解决**」：**崩溃残留**（claim 没走到落定）与**外部写失败**（目标是否收到不可知，
    // 故既不释放也不落定）。阈值与上面副作用行的 `stale` **同源**（`_staleThresholdMinutes`），
    // 免得同一屏里两个「陈旧」各说各的。
    const staleClaims = (await this.claims.listStaleClaims(thresholdMinutes * 60_000)).map((c) =>
      this._projectStaleClaim(c),
    );
    return { ...page_, staleClaims };
  }

  /**
   * 陈旧占位行的读侧投影 —— 同 REV-11 的口径：只陈述**谁的、哪一次、卡了多久、试了几次**。
   * 真值在目标系统（外部写）或崩溃前那一刻（残留），**本读数不下判决**，故没有「成功/失败」字段。
   */
  private _projectStaleClaim(c: AiWriteClaim): Record<string, unknown> {
    return {
      id: c.id,
      idempotencyKey: c.idempotencyKey,
      userId: c.userId,
      conversationId: c.conversationId ?? null,
      runId: c.runId ?? null,
      toolName: c.toolName,
      agentId: c.agentId ?? null,
      status: c.status,
      claimedAt: c.claimedAt.toISOString(),
      ageMinutes: Math.floor((Date.now() - c.claimedAt.getTime()) / 60_000),
      attempts: c.attempts,
    };
  }

  /**
   * AI Action Center（§internal.17 北极星用户侧，docs/ai-action-center.spec.md）：本人 AI 写副作用清单 + 归一状态 + 目标富化。
   * 数据最小化：不回显 args/argsHash/before/after 快照（字段级证据走 B4/审计面）；人类标签由前端按 toolName 映射（D2 toolLabel）。
   * status 归一：目标软删（targetSoftDeleted=true）→ revoked，否则 executed。
   */
  /**
   * D2：从 before/after 快照导出紧凑「实际状态变化」摘要——kind（created/updated/unknown）+ 变更字段名。
   * 只给字段名（不给全量值），列表载荷可控；详细 diff 仍走动作详情（FieldDiff）。
   */
  private _summarizeChange(
    beforeRaw: string | null | undefined,
    afterRaw: string | null | undefined,
  ): { kind: 'created' | 'updated' | 'unknown'; fields: string[] } {
    const parse = (raw: string | null | undefined): Record<string, unknown> | null => {
      if (!raw) return null;
      try {
        const v = JSON.parse(raw) as unknown;
        return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    };
    const before = parse(beforeRaw);
    const after = parse(afterRaw);
    if (!before && after) return { kind: 'created', fields: Object.keys(after) };
    if (before && after) {
      const fields = Object.keys(after).filter(
        (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
      );
      return { kind: 'updated', fields };
    }
    return { kind: 'unknown', fields: [] };
  }

  async listOwned(userId: string, options: { page?: number; limit?: number } = {}) {
    const page = options.page ?? 1;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

    const [items, total] = await this.effectsRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const enriched = await Promise.all(
      items.map(async (effect) => {
        const target = await this._loadTarget(effect.resultType, effect.resultId);
        const targetSoftDeleted = target?.deletedAt != null;
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          createdAt: effect.createdAt,
          targetExists: !!target,
          targetSoftDeleted,
          targetTitle: target?.title ?? null,
          // KB-6：撤销能力档位 + 归一状态（4 值，禁把 governed_external 显示为 revoked）
          revokeClass: this._readRevokeClass(effect),
          revokeStatus: effect.revokeStatus ?? null,
          // 级联补偿（v3）：组标识 + 根引用
          compensationGroup: effect.compensationGroup ?? null,
          parentEffectId: effect.parentEffectId ?? null,
          status: this._normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this._isRevocable(
            this._readRevokeClass(effect),
            this._normalizeStatus(effect, targetSoftDeleted),
          ),
          // D2：AI 决策证据 ↔ 实际状态变化——由快照导出紧凑变更摘要（不返回全量值，控载荷）
          change: this._summarizeChange(effect.beforeSnapshot, effect.afterSnapshot),
        };
      }),
    );

    return paginated(enriched, total, page, limit);
  }

  /**
   * P0-14：按对话取副作用（含目标记录当前状态），供用户可见的执行轨迹用。
   * 复用 _loadTarget 富化，按 createdAt 升序。
   */
  /**
   * B4 治理视图：按业务动作（resultType+resultId，如 crm_task:42）反查 AI 副作用（供「业务动作 → 治理轨迹」展示）。
   *
   * The pair is not naturally unique for result types with no local entity: rows written before the
   * proxy identity carried a user dimension can share one pair across users. Both consequences are
   * handled here rather than at each call site — `viewerUserId` narrows the lookup to that user, so a
   * viewer can neither be served someone else's effect nor get a 403 that leaks its existence; and
   * `order` makes "which row" deterministic, so an admin or service identity that passes no viewer
   * still gets a stable answer instead of whatever the driver returned first.
   *
   * 该二元组对**无本地实体**的 resultType 不天然唯一：在代理身份带上用户维度之前写入的行，
   * 可能跨用户共享同一对值。两个后果都在此处理，不推给每个调用点：`viewerUserId` 把查询收窄到
   * 该用户，查看者既拿不到他人的副作用、也不会吃到「存在但不属于你」的 403（那泄露行的存在）；
   * `order` 让「取到哪一行」确定，不传查看者的管理员 / 服务身份也拿到稳定答案。
   */
  async findByTarget(
    resultType: string,
    resultId: number,
    viewerUserId?: string,
  ): Promise<AiToolSideEffect | null> {
    const where: Record<string, unknown> = { resultType, resultId };
    if (viewerUserId !== undefined) where.userId = viewerUserId;
    return this.effectsRepo.findOne({ where: where as any, order: { id: 'ASC' } });
  }

  /**
   * A-3 恢复态（docs/cascade-compensation.spec.md §7）：**补偿过但目标当前未软删** → 已恢复。
   * 依据：`revoke_status='revoked'` 证明补偿发生过；`targetSoftDeleted=false` 证明目标现已回到生效态
   * （回收站 restore 只清 deletedAt、**不动** revoke_status，故两者组合即「撤销后又恢复」这一历史事实）。
   * 单一权威：规则在此一处，前端不各自复制判定。
   */
  isRestored(effect: AiToolSideEffect, targetSoftDeleted: boolean): boolean {
    return effect.revokeStatus === 'revoked' && !targetSoftDeleted;
  }


  /** B4/A-3 生命周期富化：副作用目标记录当前状态（是否存在/软删/标题）——撤销态判定依赖 targetSoftDeleted */
  async describeTarget(
    resultType: string,
    resultId: number,
  ): Promise<{ targetExists: boolean; targetSoftDeleted: boolean; targetTitle: string | null }> {
    const target = await this._loadTarget(resultType, resultId);
    return {
      targetExists: !!target,
      targetSoftDeleted: target?.deletedAt != null,
      targetTitle: target?.title ?? null,
    };
  }

  /**
   * KB-6：读时 revokeClass 兜底（旧行/未快照行）。工具注册命中优先；否则按本地可软删推导。
   */
  private _readRevokeClass(effect: AiToolSideEffect): RevokeClass {
    if (effect.revokeClass) return effect.revokeClass as RevokeClass;
    return this._resolveSnapshotClass(effect.toolName, effect.resultType);
  }

  /**
   * KB-6：status 归一（4 值），供 list/listOwned/listForConversation 共用。
   * - targetSoftDeleted（本地 live 信号权威，RG-3 回收站恢复后自动回 executed）→ revoked
   * - 否则按 revoke_status：compensating → revoking_external（已请求外部补偿·结果未知，禁 revoked）；
   *   revoke_failed → revoke_failed；null/其他 → executed
   * 兼容：旧本地已撤行经 targetSoftDeleted 仍 revoked；旧 proxy 行 class 兜底 none → executed（前端据此藏钮）。
   */
  private _normalizeStatus(effect: AiToolSideEffect, targetSoftDeleted: boolean): string {
    if (targetSoftDeleted) return 'revoked';
    switch (effect.revokeStatus) {
      case 'compensating':
        return 'revoking_external';
      case 'revoke_failed':
        return 'revoke_failed';
      default:
        return 'executed';
    }
  }

  /** §internal.16 A-2 业务实体账本：按实体取全部 AI 副作用（时间升序，供行为史聚合） */
  async findManyByTarget(resultType: string, resultId: number): Promise<AiToolSideEffect[]> {
    return this.effectsRepo.find({
      where: { resultType, resultId } as any,
      order: { createdAt: 'ASC' },
    });
  }

  async listForConversation(conversationId: string) {
    const items = await this.effectsRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(
      items.map(async (effect) => {
        const target = await this._loadTarget(effect.resultType, effect.resultId);
        const targetSoftDeleted = target?.deletedAt != null;
        return {
          id: effect.id,
          toolName: effect.toolName,
          conversationId: effect.conversationId,
          resultType: effect.resultType,
          resultId: effect.resultId,
          argsHash: effect.argsHash,
          createdAt: effect.createdAt.toISOString(),
          targetExists: !!target,
          targetSoftDeleted,
          targetTitle: target?.title ?? null,
          beforeSnapshot: effect.beforeSnapshot ?? null,
          afterSnapshot: effect.afterSnapshot ?? null,
          // KB-6：撤销能力档位 + 归一状态（执行轨迹面同样据档位诚实渲染）
          revokeClass: this._readRevokeClass(effect),
          revokeStatus: effect.revokeStatus ?? null,
          // 级联补偿（v3）：组标识 + 根引用
          compensationGroup: effect.compensationGroup ?? null,
          parentEffectId: effect.parentEffectId ?? null,
          status: this._normalizeStatus(effect, targetSoftDeleted),
          // 服务端单一权威的撤销可点判定（status=executed 且档位非 none）
          revocable: this._isRevocable(
            this._readRevokeClass(effect),
            this._normalizeStatus(effect, targetSoftDeleted),
          ),
        };
      }),
    );
  }

  /** 撤销 AI 副作用：软删目标 event/todo/crm_task（可经 RG-3 回收站恢复） */
  async revoke(effectId: number): Promise<RevokeResult | null> {
    const effect = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!effect) return null;
    return this._concludeSingle(effect);
  }

  /**
   * P0-15 用户侧撤销：仅本人可撤销自己的 AI 副作用。
   * 非本人/不存在 → null（controller 转 404）；目标软删可经 RG-3 回收站恢复。
   */
  async revokeOwned(effectId: number, userId: string): Promise<RevokeResult | null> {
    const effect = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!effect || effect.userId !== userId) return null;
    return this._concludeSingle(effect);
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
    const thresholdMinutes = this._staleThresholdMinutes();
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
  private async _concludeSingle(effect: AiToolSideEffect): Promise<RevokeResult> {
    const reason = await this._skipReason(effect);
    if (reason) {
      return this.dispute.withDisputeNote(
        effect,
        this._skippedResult(effect, reason),
        await this._claimsForRevoke(effect),
      );
    }
    const result = await this._doRevoke(effect);
    if (result.cascade) return result;
    return this.dispute.withDisputeNote(effect, result, await this._claimsForRevoke(effect));
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
    return { conversationId, ...(await this._revokeBatch(effects, opts)) };
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
    return { runId, ...(await this._revokeBatch(effects, opts)) };
  }

  /** 批量撤销公共循环（revokeConversation / revokeRun 共用；owner 过滤 + 逐条档位门控 + 汇总） */
  private async _revokeBatch(
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
          const claims = await this._crossGroupClaims(groupId, members);
          disputed = this.dispute.notesFor(members, claims).length > 0;
          if (members.length > 1) {
            const { items, result } = await this._compensateGroup(effect, groupId, members, claims);
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
      const skipReason = await this._skipReason(effect);
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
        const r = await this._doRevoke(effect);
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
  private async _skipReason(
    effect: AiToolSideEffect,
  ): Promise<'already_revoked' | 'compensating' | null> {
    if (effect.revokeStatus === 'compensating') return 'compensating';
    if (effect.revokeStatus === 'revoked') {
      const localSoftDelete =
        this._classOf(effect) === 'local_compensate' &&
        (this.revoker?.canHandle(effect.resultType) ?? false);
      if (localSoftDelete) {
        const target = await this._loadTarget(effect.resultType, effect.resultId);
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
  private _skippedResult(
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

  /**
   * 撤销派发（docs/cascade-compensation.spec.md §5）：属**多成员补偿组** → 级联补偿整组；
   * 否则走单目标路径（无组的历史行行为逐字节不变）。
   *
   * 返回的是**逐行事实**（这一条到底撤销了没有）；REV-1 / REV-5 的争议降级由**结论层**施加：
   * 单条撤销在 `_concludeSingle` 里降级，组级在 `_groupResult` 里降级，批量则不动逐条计数
   * —— 否则同一件事（持有的行确实补偿了、声明却不一致）会在两条路径上被数成不同的东西。
   * 跨组闸门（REV-5）在组级由此处算出后传入，撤销过程中**不再**重复查询。
   */
  private async _doRevoke(effect: AiToolSideEffect): Promise<RevokeResult> {
    if (effect.compensationGroup) {
      const members = await this.registration.listGroup(effect.compensationGroup);
      if (members.length > 1) {
        // REV-5：撤销**之前**先看 —— 另一个活组是否也主张本次要撤的这些 effect
        const cross = await this._crossGroupClaims(effect.compensationGroup, members);
        return (await this._compensateGroup(effect, effect.compensationGroup, members, cross)).result;
      }
    }
    return this._doRevokeSingle(effect);
  }


  /** 撤销能力档位（KB-6）：行上快照优先；旧行/未快照行按工具注册或 resultType 兜底解析 */
  private _classOf(effect: AiToolSideEffect): RevokeClass {
    return (
      (effect.revokeClass as RevokeClass) ??
      this._resolveSnapshotClass(effect.toolName, effect.resultType)
    );
  }

  /**
   * 级联补偿整组：本地成员落在**一个 DB 事务**里，任一失败即回滚 → 整组零改动；
   * 外部成员在本地事务提交后于事务外顺序补偿，诚实落 compensating / revoke_failed。
   * 本地回滚时**不触发**外部补偿——避免制造「半补偿」（一部分已撤销、一部分原样）的更糟状态。
   */
  private async _compensateGroup(
    requested: AiToolSideEffect,
    groupId: string,
    members: AiToolSideEffect[],
    cross: CrossGroupClaim[],
  ): Promise<{ result: RevokeResult; items: RevokeBatchItem[] }> {
    const results: RevokeBatchItem[] = [];
    const locals: AiToolSideEffect[] = [];
    const externals: AiToolSideEffect[] = [];
    // REV-1 / REV-5：争议是**组级**事实 → 汇总必须据此拒绝报完成，无论本次是否真的补偿了什么。
    const disputeNotes = this.dispute.notesFor(members, cross);

    for (const m of members) {
      const reason = await this._skipReason(m);
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
      if (this._classOf(m) === 'none') {
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
      if (this._classOf(m) === 'local_compensate' && this.revoker?.canHandle(m.resultType)) {
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
      try {
        if (this.dataSource) {
          await this.dataSource.transaction((manager) => run(manager));
        } else {
          // 无 DataSource（单测 / 降级装配）：退化为顺序执行，失去原子性。部署态恒有 DataSource。
          await run();
        }
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.warn(`[AiToolEffects] cascade rollback (group ${groupId}): ${msg}`);
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
        const rolledBack = this._groupResult(requested, groupId, members, results, disputeNotes);
        // 失败也要留痕：审计要看见「补偿尝试过且失败了」，而不是一片空白
        await this._auditCompensation(groupId, members, rolledBack.items, requested);
        return rolledBack;
      }
      // 提交成功后才回写运维态（在事务内回写会在回滚后留下假的 revoked）
      for (const m of locals) {
        await this._patchRevoke(m, { revokeStatus: 'revoked' });
        const driftNote = this._withDriftNote(undefined, driftByEffect.get(m.id) ?? null);
        results.push({
          effectId: m.id,
          revoked: true,
          revokeStatus: 'revoked',
          compensationGroup: groupId,
          // REV-9：漂移事实随该成员逐条可见（组级汇总不吞它）——没有漂移时不加该字段，保持原形状
          ...(driftNote ? { message: driftNote } : {}),
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
      const r = await this._doRevokeSingle(m);
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

    const out = this._groupResult(
      requested,
      groupId,
      members,
      results,
      disputeNotes,
      [...driftByEffect.entries()].map(
        ([id, d]) => `effect ${id} 的目标在写入后被改过（${d}），本次补偿把该改动一并抹除`,
      ),
    );
    // REV-16：整组拿走的那些目标上，还有哪些行指着它们。**在组级结论之外**再答一句 —— 组级会读出
    // 「全部补偿完成」，而那正是读者会据此断定「什么都干净了」的时刻；这个字段说的是它**没够到**的部分。
    // 成员自身作为排除集：组内一并撤销的那些行属于本次动作，不是「留下指着它的东西」。
    const downstreamReferences = await this._downstreamReferences(
      members.map((m) => ({ resultType: m.resultType, resultId: m.resultId })),
    );
    if (downstreamReferences) out.result.downstreamReferences = downstreamReferences;
    await this._auditCompensation(groupId, members, out.items, requested);
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
  private async _auditCompensation(
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
  private _groupResult(
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

  private async _doRevokeSingle(effect: AiToolSideEffect): Promise<RevokeResult> {
    // KB-6：撤销能力档位门控——none（不可撤/外部未知）直接拒绝，不再误走 externalRevoker
    // 制造"可撤销"假象。旧行 revokeClass 为 null 时按工具/resultType 兜底解析。
    const revokeClass: RevokeClass = this._classOf(effect);
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
      const r = await this.revoker.revoke(effect.resultType, effect.resultId, effect.userId);
      this.logger.log(`[AiToolEffects] revoked ${effect.resultType} #${effect.resultId} (effect ${effect.id})`);
      if (r.revoked) {
        await this._patchRevoke(effect, { revokeStatus: 'revoked' });
        // REV-14：软删落地后才落这份读数——判定没成立时不记（同「本地回滚不留回写」的口径）。
        // 单目标行就是它自己的根，故写在本行。
        await this.comparability.record(effect, [
          { ref: { resultType: effect.resultType, resultId: effect.resultId }, cmp },
        ]);
      }
      if (drift) {
        this.logger.warn(
          `[AiToolEffects] effect ${effect.id}: 目标 ${effect.resultType} #${effect.resultId} 在写入后被改过（${drift}）`,
        );
      }
      // REV-16：这次撤销拿走的这个目标，还有哪些行指着它。只在撤销**真的落地**时问 —— 没撤成，谈不上
      // 「没够到」。字段在类型没有引用模型时**缺席**（未检查），与「查过、没有」不是一回事。
      const downstreamReferences = r.revoked
        ? await this._downstreamReferences([
            { resultType: effect.resultType, resultId: effect.resultId },
          ])
        : undefined;
      return {
        revoked: r.revoked,
        effectId: effect.id,
        message: this._withDriftNote(r.message, drift),
        revokeStatus: r.revoked ? 'revoked' : 'revoke_failed',
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
      await this._patchRevoke(effect, {
        revokeStatus: r.ok ? 'compensating' : 'revoke_failed',
        revokeAcknowledgedAt: new Date(),
      });
      if (!r.ok) {
        // 对方拒绝 = 补偿**失败**（不是「未完成」）——据实计为失败，**不进 skipped**（两者在汇总里必须分得开）。
        return {
          revoked: false,
          effectId: effect.id,
          external: true,
          compensated: false,
          revokeStatus: 'revoke_failed',
          message: r.message,
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
        message: `Java 端已请求补偿（${r.message}）；结果以目标系统为准`,
      };
    }
    return {
      revoked: false,
      effectId: effect.id,
      external: true,
      message: 'B 路径外部副作用撤销需 Java 端补偿（无本地实体可软删 / 未配置补偿执行器）',
    };
  }

  /**
   * KB-6：回写撤销运维态（不入哈希链 payload）。保存失败静默——显示态以 targetSoftDeleted 为准，此为辅助审计态。
   *
   * REV-1 / REV-2 细化后，**每个事件各自成一个 patch**，不再由一个 setter 顺手补齐时间戳：
   * 意图（外呼前）/ 确认（外呼后）/ 终态（本地补偿成功）/ 争议标记 / REV-14 比对差集。写什么由
   * 调用点显式给出，好让「哪一刻写了什么」本身就是可读、可断言的事实。
   */
  private async _patchRevoke(
    effect: AiToolSideEffect,
    patch: Partial<
      Pick<
        AiToolSideEffect,
        | 'revokeStatus'
        | 'revokeRequestedAt'
        | 'revokeAcknowledgedAt'
        | 'revokeDispute'
        | 'revokeComparability'
      >
    >,
  ): Promise<void> {
    try {
      await this.effectsRepo.update(effect.id, patch);
    } catch (err) {
      this.logger.warn(`[AiToolEffects] revoke_status update failed (effect ${effect.id}): ${(err as Error).message}`);
    }
  }

  private async _loadTarget(type: string, id: number): Promise<{ title?: string; deletedAt?: Date | null } | null> {
    // D2-1f：目标状态经 SideEffectRevoker（本地软删状态 / 外部系统占位）
    return (
      this.revoker?.describeTarget(type, id) ?? { title: '外部系统写调用（B 路径）', deletedAt: null }
    );
  }
}

