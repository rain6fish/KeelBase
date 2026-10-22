// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { AiToolSideEffect } from '../../governance-shared/entities/ai-tool-side-effect.entity';
import { EffectChainWriter } from './effect-chain';
import { EffectDisputeStore } from './effect-dispute.store';
import { WriteClaimStore } from './write-claim.store';
import type { DeclaredSideEffect } from './effect-composition';
import { argsHash, buildKey, isUniqueViolation, memberKey } from './effect-shared';
import type { GovernanceReporter } from '../../governance-shared/services/governance-reporter.service';
import type { CapturedWrite } from '../../common/write-capture/write-capture';
import type { RevokeClass } from '../../ai/interfaces/tool.interface';
import type { SideEffectSnapshot, WriteToolContext } from './tool-effects.types';

/**
 * 副作用**登记**：单条 `record` 与复合组 `recordGroup`，以及配套的两件事 ——
 * REV-10「账上没有的写」的序列化，和 D2-3c 的治理台上报。
 * **从 `ai-tool-effects.service.ts` 整段搬出**（2026-10-11 拆分第七批），实现一字未改。
 *
 * ⚠ **这一簇是第一片需要「宿主接缝」的**：它要用链写入器与争议判定（两样都已各自成模块，直接注入），
 * 还要问一句 `_resolveSnapshotClass`（A / 投影 / 撤销三簇共用，留在服务上）—— 那一件事以**一个回调**
 * 注入，而不是把整份服务递进来。后面撤销那一簇会照同一条办。
 *
 * The registration cluster — `record`, `recordGroup`, and the two things they need — moved out as one
 * piece. It is the first slice that needs a seam back to the host: it asks `_resolveSnapshotClass`, which
 * three clusters share and which therefore stays on the service, and that one question arrives as a
 * callback rather than as the whole service.
 */
export class EffectRegistration {
  /** ⚠ 日志名沿用搬动前那一个：拆分不该让运维看到的日志前缀变样（同前两个 store）。 */
  private readonly logger = new Logger('AiToolEffectsService');

  constructor(
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    private readonly chain: EffectChainWriter,
    private readonly dispute: EffectDisputeStore,
    private readonly claims: WriteClaimStore,
    /** 宿主接缝：KB-6 档位快照的解析（A / 投影 / 撤销三簇共用，实现在服务上）。 */
    private readonly resolveSnapshotClass: (toolName: string, resultType: string) => RevokeClass,
    private readonly reporter?: GovernanceReporter,
  ) {}

  /** 记录写工具副作用（execute 成功后调用）；resultType: event/todo/crm_task；snapshot 为 E-1 字段级变更快照 */
  async record(
    ctx: WriteToolContext,
    resultType: string,
    resultId: number,
    snapshot?: SideEffectSnapshot,
  ): Promise<AiToolSideEffect> {
    const key = buildKey(ctx);
    const base = {
      idempotencyKey: key,
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      // §4 G1：run 成员副作用记 runId（链外列，_chainPayload 白名单不含 → 不入链，不破历史链）
      runId: ctx.runId ?? null,
      // REV-7：agent 身份随行留存（链外列），使「哪个 agent 替哪个用户写」不必 join 审计行
      agentId: ctx.agentId ?? null,
      toolName: ctx.toolName,
      argsHash: argsHash(ctx),
      resultType,
      resultId,
      beforeSnapshot: snapshot?.before ?? null,
      afterSnapshot: snapshot?.after ?? null,
      // KB-6：副作用发生时刻的撤销能力档位快照（ctx 直传优先；否则按工具注册/resultType 兜底）
      revokeClass: ctx.revokeClass ?? this.resolveSnapshotClass(ctx.toolName, resultType),
      // 单目标行不属于任何补偿组（历史语义逐字节不变）
      compensationGroup: null,
      parentEffectId: null,
      // REV-10：账上没有的写（本行记的是 resultType#resultId，其余被观察到、而没有被声明的那些）
      undeclaredWrites: this._serializeUndeclaredWrites(ctx, [{ resultType, resultId }]),
    };
    // G-3（§internal.17 ① G-3）：新行入副作用哈希链（prev = 最近一条已哈希行；历史行 null 不参与；首个哈希行 genesis）。
    // 链写入 = read(prev) → compute → insert，是 read-modify-write：**必须串行**，否则并发两行读到同一 prev
    // → 同 prevHash 两分支 → 链分叉（verifySideEffectChain 判 invalid）。见 _withChainWrite。
    return this._saveSingle(ctx, base, key, resultType, resultId);
  }

  /**
   * 复合写工具登记（docs/cascade-compensation.spec.md §4）：一次调用跨表落多行，同属一个补偿组。
   * - 组标识 = 该次调用的**幂等基键** → 重试天然映射同一组，无需另生成 uuid。
   * - 整组在**一个**链写上下文内登记（postgres 单事务单锁 / sqlite 单队列任务）→ 组内链相邻、登记原子，
   *   杜绝「N 次独立提交 → 提交一半的半组」。
   * - 任一成员唯一冲突 → 整组回滚 → 回放既有整组（幂等重试语义）。
   */
  async recordGroup(
    ctx: WriteToolContext,
    effects: DeclaredSideEffect[],
    snapshots?: Array<SideEffectSnapshot | undefined>,
  ): Promise<AiToolSideEffect[]> {
    const baseKey = buildKey(ctx);
    // REV-6：成组成员的**身份必须能承载变更**（after 快照）。缺了就是 `identity_incomplete` 的行 ——
    // 撤销时的跨组判定只能拿它比目标、比不出变更。此处如实标注，不静默放行，也**不**拒绝登记
    // （业务行已写进目标表，拒登只会让这次写没有任何副作用行 = 撤销够不到，把可恢复换成不可恢复）。
    const missingChange = effects.map((_, i) => snapshots?.[i]?.after == null);
    if (missingChange.some(Boolean)) {
      const n = missingChange.filter(Boolean).length;
      this.logger.warn(
        `[AiToolEffects] compensation group ${baseKey}: ${n}/${effects.length} 成员无变更快照（identity_incomplete）` +
          `——该组身份只能承载目标、承载不了变更，跨组判定退化为「碰了同一行」`,
      );
    }
    const save = async (manager?: EntityManager): Promise<AiToolSideEffect[]> => {
      const saved: AiToolSideEffect[] = [];
      for (let i = 0; i < effects.length; i++) {
        const e = effects[i];
        const base = {
          idempotencyKey:
            i === 0
              ? baseKey
              : memberKey(baseKey, i, e.resultType, e.resultId),
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          runId: ctx.runId ?? null,
          // REV-7：同一件事在复合组里也一样 —— 身份随行，不靠 join
          agentId: ctx.agentId ?? null,
          toolName: ctx.toolName,
          argsHash: argsHash(ctx),
          resultType: e.resultType,
          resultId: e.resultId,
          beforeSnapshot: snapshots?.[i]?.before ?? null,
          afterSnapshot: snapshots?.[i]?.after ?? null,
          revokeClass: ctx.revokeClass ?? this.resolveSnapshotClass(ctx.toolName, e.resultType),
          compensationGroup: baseKey,
          // REV-6：身份缺变更那半的行如实标注（链外注解列；单目标行不属于组，不标）
          identityIncomplete: missingChange[i],
          // REV-13：缺变更就一并记**成因**（`no_captor` / `no_entity_and_empty_fallback` /
          // `row_missing` / `failed`）——四种「没有」不等价，压成一个 bit 就分不出「设计如此」与「出错了」。
          // 置标而调用方没给成因 ⇒ 留 null（「标了但原因不可考」），**不拿默认值冒充已知**。
          identityIncompleteReason: missingChange[i] ? (snapshots?.[i]?.afterReason ?? null) : null,
          // 根成员恒为第 0 条（spec §3）：根 parentEffectId=null，其余指向根（登记序保证根先落库）
          parentEffectId: i === 0 ? null : (saved[0]?.id ?? null),
          // REV-10：同一件事在复合组里也一样 —— 组**声明的全部成员**就是「账上应该有」的集合
          undeclaredWrites: this._serializeUndeclaredWrites(ctx, effects),
        };
        saved.push(await this.chain.insertOne(base, manager));
      }
      return saved;
    };

    try {
      const saved = await this.chain.withChainWrite(save);
      this._reportEffect(ctx, effects[0].resultType, effects[0].resultId);
      return saved;
    } catch (err) {
      if (!isUniqueViolation(err)) {
        // 非唯一冲突：不伪装幂等命中（与 record 同口径）
        throw err;
      }
      this.logger.warn(`[AiToolEffects] recordGroup conflict (idempotent replay): ${(err as Error).message}`);
      const group = await this.listGroup(baseKey);
      // ARC-4：幂等键被**非本组成员**占用时 `listGroup` 查不到任何行 —— 典型是「先单目标登记、后复合登记」：
      // 那条单目标行的 `compensation_group` 为 null，按组查必空。此前这里**直接返回空数组走人**，于是
      // 本次声明的成员**一行都没登记**，而调用方又把返回值丢掉 ⇒ 整份声明静默消失、那次业务动作不可撤。
      // 占键的那一行**本身就是可读的证据位**（`parent_effect_id` 为空 ⇒ 它就是根，单条撤销也会读它），
      // 故把它按「持有里多出来的」那一侧标成争议，而不是以「无处可读」为由不标。
      let held = group;
      if (held.length === 0) {
        const occupant = (await this.claims.findExisting(baseKey)).effect;
        if (occupant) held = [occupant];
      }
      // REV-1：回放之前先比一次声明与持有 —— 不比对就是「静默少记录」（撤销该组只补偿持有的那些行、汇总全绿）。
      await this.dispute.markIfDeclarationDiffers(baseKey, effects, held);
      this._reportEffect(ctx, effects[0].resultType, effects[0].resultId);
      // 返回**本组既有成员**：外行占键时为 `[]`（本次声明确实一行都没登记）—— 调用方据此不得当成功。
      return group;
    }
  }


  /** 载入整组副作用（补偿组内全部行，按 id 升序 = 登记序；根在最前） */
  async listGroup(compensationGroup: string): Promise<AiToolSideEffect[]> {
    return this.effectsRepo.find({
      where: { compensationGroup } as any,
      order: { id: 'ASC' },
    });
  }

  /**
   * REV-10：**账上没有的写** —— 数据层观察到的写，减去本次登记的目标。
   *
   * 比配走**归一名字**（小写、去下划线）：订阅器给的是实体类名（`CrmTask`），而登记层用的是 resultType
   * （`crm_task` / 生成模块名），两者是同一命名空间的不同写法 —— 与 `resolveLocalEntity` 的两段匹配同一
   * 精神，且**必须只在这一处**做，免得两条路各归一一次而漂移。
   *
   * 主键取不到（`null`）时**照记**：我们确实知道写了那张表的某一行，只是不知道哪一行 —— 那仍然是
   * 「账上没有」；把它压掉，就是把一次真实的漏记说成没有。
   *
   * 没观察到（未开采集 / 本次没写）⇒ `null`，**不假装「没写过」**。
   */
  private _serializeUndeclaredWrites(
    ctx: WriteToolContext,
    recorded: Array<{ resultType: string; resultId: number }>,
  ): string | null {
    const observed = ctx.observedWrites;
    if (!observed || observed.length === 0) return null;
    const norm = (s: string): string => s.toLowerCase().replace(/_/g, '');
    const recordedKeys = new Set(recorded.map((r) => `${norm(r.resultType)}#${r.resultId}`));
    const missing = observed.filter((w) => !recordedKeys.has(`${norm(w.entity)}#${w.id}`));
    if (missing.length === 0) return null;
    this.logger.warn(
      `[AiToolEffects] REV-10 声明与实写不一致：本次调用在数据层写了 ${missing.length} 处账上没有的行（` +
        `${missing.map((m) => `${m.entity}#${m.id ?? '?'}:${m.kind}`).join(', ')}）` +
        `——已如实记在该行上，**不据此改判、也不自动补偿**`,
    );
    return JSON.stringify(missing);
  }

  /** REV-10：读侧的解析（与写入侧同一形状）；读不出来就如实给 `null`，不外抛打断列表。 */
  parseUndeclaredWrites(raw: string | null | undefined): CapturedWrite[] | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as CapturedWrite[]) : null;
    } catch {
      return null;
    }
  }

  private async _saveSingle(
    ctx: WriteToolContext,
    base: Record<string, unknown>,
    key: string,
    resultType: string,
    resultId: number,
  ): Promise<AiToolSideEffect> {
    let saved: AiToolSideEffect | undefined;
    try {
      saved = await this.chain.withChainWrite((manager) => this.chain.insertOne(base, manager));
    } catch (err) {
      if (!isUniqueViolation(err)) {
        // 非唯一冲突（DB down / 连接中断等）：不伪装幂等命中——副作用未落库却报成功会造成重复执行，必须上抛
        throw err;
      }
      this.logger.warn(`[AiToolEffects] record conflict (idempotent skip): ${(err as Error).message}`);
      const existing = await this.effectsRepo.findOne({ where: { idempotencyKey: key } });
      // REV-4：同键冲突有**两种**，此前被当成一种。
      // - 纯幂等重放：两次写的是**同一条**业务记录 → 无话可说；
      // - 写了别的：本次调用真的写下了**另一条**业务行，而它**没有任何副作用行承载** ⇒ 那一条不可撤，
      //   而链路上此前没有一处说得出（调用方只看到「幂等命中」）。
      // 比对按**目标身份**，与 REV-1 的组路径同口径。
      await this.dispute.markIfWriteDiffers(existing, resultType, resultId);
      this._reportEffect(ctx, resultType, resultId);
      return existing!;
    }
    this._reportEffect(ctx, resultType, resultId);
    return saved!;
  }

  /** D2-3c：副作用双写上报治理台（配置 GOVERNANCE_URL 时；失败静默） */
  private _reportEffect(ctx: WriteToolContext, resultType: string, resultId: number): void {
    if (!this.reporter?.enabled) return;
    void this.reporter
      .reportEffect({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        toolName: ctx.toolName,
        args: ctx.args,
        resultType,
        resultId,
      })
      .catch(() => {});
  }
}
