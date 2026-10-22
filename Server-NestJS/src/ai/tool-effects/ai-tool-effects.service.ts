// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AiToolSideEffect } from '../../governance-shared/entities/ai-tool-side-effect.entity';
import { EffectComparability } from './effect-comparability.entity';
import { AiWriteClaim } from './ai-write-claim.entity';
import type { ExternalRevoker } from '../proxy/proxy-revoker.service';
import { SIDE_EFFECT_REVOKER } from './side-effect-revoker';
import type { SideEffectRevoker } from './side-effect-revoker';
import { GOVERNANCE_REPORTER } from '../../governance-shared/services/governance-reporter.service';
import type { GovernanceReporter } from '../../governance-shared/services/governance-reporter.service';
import type { AuditChainService } from '../../common/audit-chain/audit-chain.service';
import { OperationAuditService } from '../../operation-audit/operation-audit.service';
import { ToolRegistry } from '../tools/tool-registry';
import { resolveRevokeClass, type RevokeClass } from '../interfaces/tool.interface';
import type { DeclaredSideEffect } from './effect-composition';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_REVOKE_STALE_MINUTES } from '../../governance-core/revoke-staleness';
import { SideEffectSnapshotCaptor } from './side-effect-snapshot-captor';
import { buildKey, memberKey } from './effect-shared';
import { EffectChainWriter } from './effect-chain';
import { WriteClaimStore } from './write-claim.store';
import { EffectComparabilityStore } from './effect-comparability.store';
import { EffectDisputeStore } from './effect-dispute.store';
import { EffectRegistration } from './effect-registration';
import { EffectRevoke } from './effect-revoke';
import { EffectProjection } from './effect-projection';
import {
  EXTERNAL_REVOKER,
  type RevokeBatchResult,
  type RevokeClaimOutcome,
  type RevokePatch,
  type RevokeResult,
  type RevokeRunBatchResult,
  type SideEffectSnapshot,
  type SplitGroupFinding,
  type HostHelpers,
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
    externalRevoker?: ExternalRevoker,
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
    // 留在服务上的三样助手：撤销与投影**都要**它们，故在这里组装一次、两处共用同一个对象
    // （各写一份就是「同一状态、两处说」——本仓反复修的那类缺陷的成因）。
    const host: HostHelpers = {
      resolveSnapshotClass: (toolName, resultType) => this._resolveSnapshotClass(toolName, resultType),
      loadTarget: (type, id) => this._loadTarget(type, id),
      staleThresholdMinutes: () => this._staleThresholdMinutes(),
    };
    // 撤销那一簇的宿主接缝（拆分第八批）：上面三样 + 回写撤销态列那**一处**实现。
    this.revocations = new EffectRevoke(
      this.effectsRepo,
      this.registration,
      this.comparability,
      this.dispute,
      {
        ...host,
        // PRE-3: forward the retry option too — dropping it silently disables the terminal write's
        // retry (the failure would still be loud, but it would give up after one attempt).
        //
        // PRE-3：重试选项也要透传 —— 丢掉它会静默关掉终态写的重试
        //（失败仍会大声，但只试一次就放弃）。
        patchRevoke: (effect, patch: RevokePatch, opts) =>
          this._patchRevoke(effect, patch, opts),
      },
      this.revoker,
      this.dataSource,
      this.operationAudit,
      externalRevoker,
    );
    // 读侧投影（拆分第九批）：它读遍登记 / claims / 可比性 / 争议四家的注解列，故四家都收进来。
    this.projection = new EffectProjection(
      this.effectsRepo,
      this.claims,
      this.comparability,
      this.dispute,
      this.registration,
      host,
    );
  }

  /** 撤销 / 补偿（拆分第八批，2026-10-11 · 分两片）：实现在 `effect-revoke.ts`。 */
  private readonly revocations: EffectRevoke;

  /** 读侧投影（拆分第九批，2026-10-11）：实现在 `effect-projection.ts`。 */
  private readonly projection: EffectProjection;

  /** REV-3 跨组分裂检出（管理端）—— 转发给撤销那一簇。 */
  async findSplitGroups(
    limit = 100,
  ): Promise<{ count: number; truncated: boolean; splits: SplitGroupFinding[] }> {
    return this.revocations.findSplitGroups(limit);
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



  /** REV-2：陈旧阈值（分钟）——配置缺失时回落到与 Joi 默认一致的常量，避免两处各写一个数。 */
  private _staleThresholdMinutes(): number {
    const configured = this.configService?.get<number>('REVOKE_STALE_MINUTES');
    return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_REVOKE_STALE_MINUTES;
  }

  /**
   * AiModule useFactory 组装 B 路径 revoker（ToolRegistry 非 provider，运行时注入）。
   * **转发给撤销那一簇**（拆分第八批）：它才读这个字段，而这次注入发生在 DI **之后** ——
   * 只在构造时取一次值会让它永远到不了撤销路径。
   */
  setExternalRevoker(revoker: ExternalRevoker): void {
    this.revocations.setExternalRevoker(revoker);
  }

  // ── 撤销 / 补偿的公开面：以下五个转发给 `this.revocations`（实现在 `effect-revoke.ts`） ──
  // 公开面与搬动前一字不差：`ai.controller.ts` 与两个治理侧控制器不必知道这次拆分。

  /** 撤销 AI 副作用：软删目标 event/todo/crm_task（可经 RG-3 回收站恢复）。 */
  async revoke(effectId: number): Promise<RevokeResult | null> {
    return this.revocations.revoke(effectId);
  }

  /** 本人撤销（所有权校验）。 */
  async revokeOwned(effectId: number, userId: string): Promise<RevokeResult | null> {
    return this.revocations.revokeOwned(effectId, userId);
  }

  /** REV-11：认领一条滞留的 `compensating` 副作用。 */
  async claim(
    effectId: number,
    byUserId: string,
  ): Promise<{ outcome: RevokeClaimOutcome; claimedBy?: string | null; claimedAt?: string | null }> {
    return this.revocations.claim(effectId, byUserId);
  }

  /** G1 会话级批量撤销（docs/revoke-contract.spec.md §3 Case B）。 */
  async revokeConversation(
    conversationId: string,
    opts?: { ownerId?: string },
  ): Promise<RevokeBatchResult> {
    return this.revocations.revokeConversation(conversationId, opts);
  }

  /** §4 G1：run 级批量撤销。 */
  async revokeRun(runId: string, opts?: { ownerId?: string }): Promise<RevokeRunBatchResult> {
    return this.revocations.revokeRun(runId, opts);
  }

  // ── 读侧投影的公开面：以下七个转发给 `this.projection`（实现在 `effect-projection.ts`） ──
  // 公开面与搬动前一字不差：`ai.controller.ts`、`decision-trace`、`trust-sandbox`、
  // `business-history`、两个 governance-bridge 控制器与治理台控制器都不必知道这次拆分。

  /** 管理台：按用户/类型列出 AI 创建的副作用（含目标记录当前状态）。 */
  async list(options: { userId?: number; page?: number; limit?: number; stale?: boolean } = {}) {
    return this.projection.list(options);
  }

  /** AI Action Center：本人清单（数据最小化）。 */
  async listOwned(userId: string, options: { page?: number; limit?: number } = {}) {
    return this.projection.listOwned(userId, options);
  }

  /** 按业务目标 (resultType, resultId) 反查（B4 治理视图）。 */
  async findByTarget(
    resultType: string,
    resultId: number,
    viewerUserId?: string,
  ): Promise<AiToolSideEffect | null> {
    return this.projection.findByTarget(resultType, resultId, viewerUserId);
  }

  /**
   * A-3 restore state, three-valued: `restored` / `not_restored` / `unknown`.
   * `unknown` is the PRE-3 case — a compensation whose outcome was never recorded must not be read as
   * "not revoked". A boolean cannot express it, so the tri-state is the authoritative reading.
   *
   * A-3 恢复态，三值：`restored` / `not_restored` / `unknown`。
   * `unknown` 即 PRE-3 的情形 —— 补偿结果从未落库时，不得把它读成「未撤销」。布尔值表达不了它，
   * 故以三值为权威读数。
   */
  restoreState(
    effect: AiToolSideEffect,
    targetSoftDeleted: boolean,
  ): 'restored' | 'not_restored' | 'unknown' {
    return this.projection.restoreState(effect, targetSoftDeleted);
  }

  /** A-3 恢复态（布尔面）：`false` = 未被证明恢复，**不是**「确知未撤销」；未知态请读 `revokeStatus`。 */
  isRestored(effect: AiToolSideEffect, targetSoftDeleted: boolean): boolean {
    return this.projection.isRestored(effect, targetSoftDeleted);
  }

  /** 目标当前状态富化（是否存在 / 软删 / 标题）。 */
  async describeTarget(resultType: string, resultId: number) {
    return this.projection.describeTarget(resultType, resultId);
  }

  /** 按实体取全部副作用（行为史聚合）。 */
  async findManyByTarget(resultType: string, resultId: number): Promise<AiToolSideEffect[]> {
    return this.projection.findManyByTarget(resultType, resultId);
  }

  /** 按会话取副作用（执行轨迹）。 */
  async listForConversation(conversationId: string) {
    return this.projection.listForConversation(conversationId);
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
   * PRE-3: write back the revoke state columns. **A failed write is no longer swallowed.**
   *
   * For a local compensation the target's soft-delete is the fact layer and `revoke_status` is the
   * column every reader (`isRestored`, `skipReason`) consults. Swallowing the failure let the fact
   * change while the record stayed absent, so after a recycle-bin restore the row read as "never
   * revoked" — the predicate layer was lost even though the facts were not. Hence: retry transient
   * failures, log at `error` with the fields an operator needs, and report whether the write landed.
   * Callers that write an authoritative terminal state must honour the boolean; annotation-only
   * callers (dispute evidence, comparability history) may ignore it.
   *
   * PRE-3：回写撤销态列，**失败不再静默**。
   *
   * 本地补偿里，目标软删是事实层、`revoke_status` 是每个读侧（`isRestored`、`skipReason`）都依赖的判据层。
   * 把失败吞掉会让「事实改了而记录没落」，于是回收站恢复之后该行被读成「从未撤销」——**事实层未丢，
   * 判据层丢了**。现在：瞬时失败重试，最终失败以 `error` 级别记下运维需要的字段，并如实回报是否落库。
   * 写权威终态的调用方必须处理这个布尔值；只写注解（争议证据、可比性历史）的调用方可以忽略它。
   *
   * REV-1 / REV-2 细化后，**每个事件各自成一个 patch**，不再由一个 setter 顺手补齐时间戳：
   * 意图（外呼前）/ 确认（外呼后）/ 终态（本地补偿成功）/ 争议标记 / REV-14 比对差集。写什么由
   * 调用点显式给出，好让「哪一刻写了什么」本身就是可读、可断言的事实。
   */
  private async _patchRevoke(
    effect: AiToolSideEffect,
    patch: RevokePatch,
    opts: { attempts?: number } = {},
  ): Promise<boolean> {
    const attempts = Math.max(1, opts.attempts ?? 1);
    let lastErr: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.effectsRepo.update(effect.id, patch);
        return true;
      } catch (err) {
        lastErr = err;
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 10 * attempt));
        }
      }
    }
    this.logger.error(
      `[AiToolEffects] revoke state write FAILED after ${attempts} attempt(s) — effect ${effect.id} ` +
        `(${effect.resultType}#${effect.resultId}), columns=${Object.keys(patch).join(',')}: ` +
        `${(lastErr as Error)?.message ?? String(lastErr)}`,
    );
    return false;
  }

  private async _loadTarget(type: string, id: number): Promise<{ title?: string; deletedAt?: Date | null } | null> {
    // D2-1f：目标状态经 SideEffectRevoker（本地软删状态 / 外部系统占位）
    return (
      this.revoker?.describeTarget(type, id) ?? { title: '外部系统写调用（B 路径）', deletedAt: null }
    );
  }
}

