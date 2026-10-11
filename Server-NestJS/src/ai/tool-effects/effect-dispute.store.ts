// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import type { DeclaredSideEffect } from './effect-composition';
import { declarationDiff, targetKey } from './effect-shared';
import type {
  CrossGroupClaim,
  RevokeDisputeEvidence,
  RevokePatch,
  RevokeResult,
} from './tool-effects.types';

/** 回写撤销态列的那一处实现（`_patchRevoke`）—— 争议与撤销两侧都只用它，故注入而不是各写一份。 */
export type RevokePatcher = (effect: AiToolSideEffect, patch: RevokePatch) => Promise<void>;

/**
 * REV-1 / REV-4 / REV-5 / ARC-6：**声明与持有不一致**这件事的标记、读取、说明与确认。
 * **从 `ai-tool-effects.service.ts` 整段搬出**（2026-10-11 拆分第六批），实现一字未改 ——
 * 只是几个私有名去掉下划线（它们本来就被别的簇读），`logger` 换成自己的，`this._patchRevoke` 换成注入的
 * `patchRevoke`（那处实现留在服务上：撤销侧也在用，单一实现是这次拆分的纪律）。
 *
 * The declaration-vs-held dispute: marking it, reading it, explaining it, and acknowledging it. Moved out
 * of the service as one piece. `_patchRevoke` stays on the service and arrives here as a callback, so the
 * one implementation of that write is still one.
 */
export class EffectDisputeStore {
  /** ⚠ 日志名沿用搬动前那一个：拆分不该让运维看到的日志前缀变样（同 `write-claim.store.ts`）。 */
  private readonly logger = new Logger('AiToolEffectsService');

  constructor(
    private readonly effectsRepo: Repository<AiToolSideEffect>,
    private readonly patchRevoke: RevokePatcher,
  ) {}

  /**
   * REV-1：被拒声明与已持有组不一致 → 留存证据并把整组标为争议。
   *
   * 触发条件：同参数重试在幂等键上冲突（→ 整组回滚 → 回放既有组），而工具**非确定性**，两次声明的成员不同
   * （多声明或少声明都算）。此时回放的那一组**不覆盖**本次声明 —— 沉默地回放它，就等于把「这部分已撤销」
   * 说成事实。标记后撤销路径据 `revokeDispute` **拒绝报告完成**（见 `_withDisputeNote` / `_groupResult`）。
   *
   * 证据写在**根行**（组内主体对象，`parent_effect_id IS NULL`）上，一处即够：撤销路径按**组**判定
   * （`_compensateGroup` 载入全组后 `members.some(m => m.revokeDispute)`），单成员组的唯一一行本来就是根行。
   * 逐行复制只会把同一份证据放大成 O(N²) 文本、并在写入失败时留下互相不一致的副本 —— 单一副本是单一事实。
   * 列是**链外注解**，不入 `_chainPayload`，故不破历史链。标记写入失败只告警——它不改变业务事实，
   * 权威的补偿语义仍由逐行 revoke_status 与目标软删信号承载。
   */
  async markIfDeclarationDiffers(
    baseKey: string,
    declared: DeclaredSideEffect[],
    stored: AiToolSideEffect[],
  ): Promise<void> {
    if (stored.length === 0) return; // 无既有行可标（唯一冲突来自别处）→ 不制造无处可读的标记
    // 两侧都按**目标引用**比（行对象本身带一堆链列/注解列，混进证据只会稀释它）
    const storedRefs = stored.map((e) => ({ resultType: e.resultType, resultId: e.resultId }));
    const diff = declarationDiff(declared, storedRefs);
    if (!diff) return;
    const evidence: RevokeDisputeEvidence = {
      declared,
      stored: storedRefs,
      onlyDeclared: diff.onlyDeclared,
      onlyStored: diff.onlyStored,
      decidedAt: new Date().toISOString(),
    };
    this.logger.warn(
      `[AiToolEffects] compensation group ${baseKey} disputed: 声明 ${declared.length} 条 vs 持有 ${stored.length} 条` +
        `（声明多出 ${diff.onlyDeclared.length}、持有多出 ${diff.onlyStored.length}）——撤销将拒绝报告完成`,
    );
    // 根行：与 _auditCompensation 同一定义（parent_effect_id 为空者；异常形态回落登记序首行）
    const root = stored.find((r) => r.parentEffectId == null) ?? stored[0];
    // ARC-6：证据随**最新**事实走（标记的含义就是「此刻声明与持有对不上」），但要小心别把人的确认悄悄作废——
    // 确认指的是**这一次**的缺失集合，故只有本次与上次**完全同一批成员**时才把确认带过去；
    // 集合变了 = 新事实 ⇒ 写一份**未确认**的新证据（裁决随之回来），并如实记一条警告。
    const prev = this.parseDispute(root.revokeDispute);
    const sameMissingSet =
      prev != null &&
      JSON.stringify([...prev.onlyDeclared].map(targetKey).sort()) ===
        JSON.stringify([...diff.onlyDeclared].map(targetKey).sort());
    if (prev?.acknowledgedAt != null && !sameMissingSet) {
      this.logger.warn(
        `[AiToolEffects] compensation group ${baseKey}: 争议的缺失集合已变——上一份确认（${prev.acknowledgedBy}）不再适用，本次按未确认处理`,
      );
    }
    await this.patchRevoke(root, {
      revokeDispute: JSON.stringify(
        sameMissingSet && prev?.acknowledgedAt != null
          ? { ...evidence, acknowledgedAt: prev.acknowledgedAt, acknowledgedBy: prev.acknowledgedBy }
          : evidence,
      ),
    });
  }

  /**
   * REV-4：**单目标**冲突分支的比对——同键重放写的是不是同一条业务记录。
   *
   * 触发面（实测）：常规重放根本到不了这里 —— 调用方在**执行工具之前**先查重（`findExisting`），命中即短路，
   * 工具不会再跑、也就不会多写一行。故本分支实际只在**并发**下可达：两次同键调用同时探测未命中 → 都执行 →
   * 一条落库、另一条撞唯一键。形状与 ARC-3 同类（都是「预检通过之后的竞态窗口」）。
   *
   * **证据复用既有的形状**（`declared` / `stored` / 双向差集），因为它在单条上恰好就是同一个意思：
   * `declared` = 本次调用写下的目标、`stored` = 账上持有的目标，于是 `onlyDeclared` = 「写了却没有行承载」
   * 的那一条 —— 非空即未了结。故 ARC-6 的裁决（**只认 `onlyDeclared` 一侧**）在此**照旧成立**，无须第二套判据。
   *
   * 目标相同则**不标记**：那是纯幂等重放，标记它就是把正常路径说成争议。
   */
  async markIfWriteDiffers(
    existing: AiToolSideEffect | null,
    resultType: string,
    resultId: number,
  ): Promise<void> {
    // 键被占了却查不到那一行（并发删 / 异常）：不制造无处可读的标记
    if (!existing) return;
    const storedRef = { resultType: existing.resultType, resultId: existing.resultId };
    const declaredRef = { resultType, resultId };
    if (targetKey(storedRef) === targetKey(declaredRef)) return; // 纯幂等重放

    const evidence: RevokeDisputeEvidence = {
      declared: [declaredRef],
      stored: [storedRef],
      // 「写了却没有行承载」的那一条 —— 撤销够不到它
      onlyDeclared: [declaredRef],
      onlyStored: [storedRef],
      decidedAt: new Date().toISOString(),
    };
    this.logger.warn(
      `[AiToolEffects] single-target replay wrote a different record: 本次写 ${resultType}#${resultId}，` +
        `而该键被 ${existing.resultType}#${existing.resultId} 占用` +
        `——**本次写下的那条没有任何副作用行承载（撤销够不到它）**，该行已标为争议`,
    );
    await this.patchRevoke(existing, { revokeDispute: JSON.stringify(evidence) });
  }

  /**
   * 组级争议说明（空数组 = 无争议 → 可以报完成）。单一判据，组级汇总与批量标记共用：
   * REV-1「声明与持有不一致」 / REV-5「另一个活组仍主张本组 effect」。
   */
  notesFor(members: AiToolSideEffect[], cross: CrossGroupClaim[]): string[] {
    const notes: string[] = [];
    if (members.some((m) => this.hasOpenDispute(m))) {
      notes.push(
        '已按**持有**的行补偿，但该组**声明与持有不一致**（组已标 disputed）——不得视为该业务动作已完全撤销',
      );
    }
    if (cross.length) notes.push(this._crossClaimText(cross));
    return notes;
  }

  /** REV-5：跨组主张的读法（撤销结论里要说得出「是哪个组、主张了哪个对象」） */
  private _crossClaimText(claims: CrossGroupClaim[]): string {
    const detail = claims
      .map((c) => `${c.resultType}#${c.resultId}（补偿组 ${c.groups.join('、')}）`)
      .join('；');
    return `另有**活着的**补偿组仍主张本次撤销的业务对象：${detail}——那一组承载的业务动作不随本次撤销结束，故不得视为已完全撤销`;
  }

  /** REV-1：读争议证据。列内容由本服务写入；读侧不因一行坏数据让整页 500 —— 解析失败返回 null，`disputed` 仍为 true。 */
  parseDispute(raw: string | null | undefined): RevokeDisputeEvidence | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RevokeDisputeEvidence;
    } catch {
      return null;
    }
  }

  /**
   * ARC-6：该行是否有一条**未了结**的争议（**单源判据**）。
   *
   * 四处读点（组级说明 / 管理端列表 / 批量标记 / 单条说明）共用它，免得「已确认」在一处解除、在另一处仍报未完成
   * ——那正是本仓反复修的那类「同一状态、两条路两个结论」。**解析不出来一律按「无未了结」**：坏 JSON 的注解列
   * 不该让撤销永久卡在未完成上（它已经不具备可读的证据可指）。
   */
  hasOpenDispute(effect: AiToolSideEffect): boolean {
    if (effect.revokeDispute == null) return false; // 没有标记 ⇒ 谈不上争议
    const evidence = this.parseDispute(effect.revokeDispute);
    // 标记在、内容读不出来 ⇒ **fail-closed**：不解除一份读不懂的裁决（对读不懂的东西放宽，比保守更危险）
    if (evidence == null) return true;
    if (evidence.acknowledgedAt != null) return false; // ARC-6：管理端显式确认过 ⇒ 解除「未了结」，证据仍在
    // ARC-6：只有「声明了却从未登记」那一侧才让撤销够不到东西
    return evidence.onlyDeclared.length > 0;
  }

  /**
   * ARC-6：**确认**一条争议（管理端动作）—— 解除「未了结」，**证据原样保留**，另记确认人与时刻。
   *
   * 为什么是**显式**动作而不是自动清除：「声明了却从未登记」的成员按构造**补不上**（重试撞键只会回放既有组，
   * 不补登记），所以「后一次比对一致」并不代表问题解决——自动清除等于把谎话写进状态。而「有人看过了」
   * 是人能给出的真信息，且它**不假装问题被修好**（证据还在，确认人与时刻也在）。
   *
   * **保存失败必须上抛**：这是人的动作，报告成功却没落库就是谎报。故**不走** `_patchRevoke`
   *（它对保存失败只 warn —— 运维态回写可以那样，人说过「我看过了」不行）。
   * 幂等：已确认过的再确认返回**原确认时刻**，不覆盖。
   */
  async acknowledgeDispute(
    effectId: number,
    adminUserId: string,
  ): Promise<{ ok: boolean; reason?: 'not_found' | 'no_open_dispute'; acknowledgedAt?: string }> {
    const row = await this.effectsRepo.findOne({ where: { id: effectId } });
    if (!row) return { ok: false, reason: 'not_found' };
    const evidence = this.parseDispute(row.revokeDispute);
    if (!evidence) return { ok: false, reason: 'no_open_dispute' };
    if (evidence.acknowledgedAt) return { ok: true, acknowledgedAt: evidence.acknowledgedAt };
    const acknowledgedAt = new Date().toISOString();
    await this.effectsRepo.update(effectId, {
      revokeDispute: JSON.stringify({ ...evidence, acknowledgedAt, acknowledgedBy: adminUserId }),
    });
    this.logger.log(`[AiToolEffects] dispute on effect ${effectId} acknowledged by ${adminUserId}`);
    return { ok: true, acknowledgedAt };
  }

  /**
   * REV-1 / REV-5：**撤销不得报告完成**（这一步才是关键，只暴露不一致/重叠不够）。
   *
   * 只降级结论与说明，**不改写行级运维态**：持有的那几行确实被补偿了（`revokeStatus=revoked` 是真的），
   * 而「这**一次业务动作**是否已完全撤销」为假——被拒声明里多出来的成员没有任何行持有（REV-1），
   * 或另一个活组承载的业务动作不在本次范围内（REV-5）。两个读数由此分轴，
   * 故 `revoked:false` 与 `revokeStatus:'revoked'` 并存是**如实**，不是矛盾。
   */
  withDisputeNote(
    effect: AiToolSideEffect,
    result: RevokeResult,
    cross: CrossGroupClaim[] = [],
  ): RevokeResult {
    const notes: string[] = [];
    if (this.hasOpenDispute(effect)) {
      // REV-4：措辞不再说「该补偿组」—— 单目标行没有组，而那一条同样可能被标上争议（同键竞态下写了别的记录）。
      // 改成「该业务动作」后一句话同时说得通两条路径，且被用例断言的「声明与持有不一致」原样保留。
      notes.push(
        '该业务动作已被标记为「声明与持有不一致」：已按**持有**的行补偿，而声明与登记的不一致——不得视为该业务动作已完全撤销',
      );
    }
    if (cross.length) notes.push(this._crossClaimText(cross));
    if (notes.length === 0) return result;
    return {
      ...result,
      revoked: false,
      message: `${result.message ? `${result.message}；` : ''}${notes.join('；')}`,
    };
  }
}
