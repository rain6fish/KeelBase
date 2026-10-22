// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { sortKeys } from '../../common/canonical-json';
import { AiToolSideEffect } from '../../governance-shared/entities/ai-tool-side-effect.entity';
import { EffectComparability } from './effect-comparability.entity';
import { SideEffectSnapshotCaptor, type CaptureResult } from './side-effect-snapshot-captor';
import type {
  RevokeComparabilityAttempt,
  RevokeComparabilityEvidence,
  TargetComparison,
} from './tool-effects.types';

/**
 * REV-9 / REV-14 / REV-17 那条线：撤销前「这个目标还是不是我写的那条」的**比对**，以及每次撤销尝试留下的
 * **可比性记录**。**从 `ai-tool-effects.service.ts` 整段搬出**（2026-10-11 拆分第五批），实现一字未改 ——
 * 只是四个对外方法的私有下划线去掉，`DRIFT_IGNORED_KEYS` 与 `logger` 换成自己的。
 *
 * 搬它的理由：这一簇只依赖 `comparabilityRepo` 与 `snapshotCaptor`**两样**，与其余各簇没有共享状态
 * —— 撤销（D）与列表（G）只是它的**消费者**，各自通过下面四个方法读数。
 *
 * The content-drift comparison and the per-attempt comparability record, moved out of the service as one
 * piece. It depends on exactly two things — the comparability repository and the snapshot captor — and
 * shares no state with any other cluster; revocation and the listing are only its consumers.
 */
export class EffectComparabilityStore {
  /**
   * ⚠ 日志名**保持搬动前那一份**：这次拆分不该让运维看到的日志前缀变样。用字符串而不是 import 那个类，
   * 是为了不引入 `服务 → 本类 → 服务` 的循环（与 `write-claim.store.ts` 同一处置）。
   */
  private readonly logger = new Logger('AiToolEffectsService');

  constructor(
    private readonly comparabilityRepo?: Repository<EffectComparability>,
    private readonly snapshotCaptor?: SideEffectSnapshotCaptor,
  ) {}

  /**
   * REV-9：比对前剔掉「记账用」时间戳。
   *
   * 快照是对**整行**的投影（`SideEffectSnapshotCaptor._sanitize` 只剔敏感字段），而 `updatedAt` 每次写都会动
   * ⇒ 留着它，任何一次触碰都会被读成「目标被改过」，而**用噪音报出来的东西没人会看**——那等于把这次检查关掉。
   * 故只比**内容**：剔除 `createdAt` / `updatedAt` 这两个由 ORM 维护的记账列，其余一律参与比对。
   *
   * **如实写出的边界**：这条规则只认这两列是「非内容」。某个业务列若也会为无关原因自行变动（计数器之类），
   * 它仍会被读成漂移——那属于**误报**而非漏报，且会点名是哪个字段，可据此再收紧。
   */
  private static readonly DRIFT_IGNORED_KEYS = new Set(['createdAt', 'updatedAt']);

  /**
   * 快照 JSON → 可比对的内容视图（键序归一 + 剔记账列）；解析不了返回 null（不猜）。
   *
   * 键序归一用与幂等键同一口径的递归排序（`common/canonical-json.ts`，Q-2）：此前这里只排顶层，
   * 嵌套对象键序不同会被误报成内容漂移 —— 那是误报而非漏报，但同样是噪音来源。
   *
   * Snapshot JSON → the comparable content view (normalised key order + bookkeeping columns removed);
   * `null` when it cannot be parsed. Key-order normalisation is recursive and shares the single source
   * in `common/canonical-json.ts` (Q-2); it used to sort only the top level, so a nested object with a
   * different key order was reported as a content drift.
   */
  private _contentOnly(snapshotJson: string | null | undefined): Record<string, unknown> | null {
    if (!snapshotJson) return null;
    try {
      const parsed = JSON.parse(snapshotJson) as unknown;
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      for (const k of EffectComparabilityStore.DRIFT_IGNORED_KEYS) delete (parsed as Record<string, unknown>)[k];
      return sortKeys(parsed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * REV-9：**撤销前问一句「目标还是不是我写的那条」**。
   *
   * 撤销路径原先只读「是不是软删了」（`revokeStatus` / 目标 `deletedAt`），`after_snapshot` 从不参与判定
   * ⇒ AI 写入之后、撤销之前若有人或别的系统改过该目标，撤销**照样软删并报成功**，把中间那次改动一并抹掉
   * 且毫无提示。本方法把那件事变成**可检出**。
   *
   * 三态返回（REV-14 起）：**没承诺比**（无捕获器 / 无 `after_snapshot` —— 该行身份本就缺「变更」那半，
   * REV-6 已单独标注）· **比完了**（`drift` 为字段名清单或 `null`）· **承诺了没比成**（`reason` 说清成因）。
   * 前两态对**漂移**这件事的处置相同（不添任何话），但第三态对 REV-14 是**必须留痕**的事实：
   * 旧形态把后两态压进同一个 `null`，于是「读不到所以没查」与「查了、没变」在读数上完全相同 ——
   * 一次撤销可以在**有成员压根没被检查过**的情况下读作完成，而没有任何地方说出这件事。
   *
   * **边界**：REV-9 只做「可检出、不静默」——不拒绝、不改判定、不动 wire 契约；REV-14 只把第三态**记下来**，
   * 同样不改判定。
   */
  async targetDrift(effect: AiToolSideEffect): Promise<TargetComparison> {
    if (!this.snapshotCaptor) return { promised: false };
    const before = this._contentOnly(effect.afterSnapshot);
    if (!before) return { promised: false };
    let captured: CaptureResult;
    try {
      captured = await this.snapshotCaptor.captureAfter(effect.resultType, effect.resultId);
    } catch {
      return { promised: true, compared: false, reason: 'failed' };
    }
    const now = this._contentOnly(captured.json);
    if (!now) {
      // `captureAfter` 给了 json 却没给成因时，是**形状**读不出来（非对象 / 数组 / 坏 JSON）——属故障。
      return { promised: true, compared: false, reason: captured.reason ?? 'failed' };
    }
    if (JSON.stringify(before) === JSON.stringify(now)) {
      return { promised: true, compared: true, drift: null };
    }
    const keys = [...new Set([...Object.keys(before), ...Object.keys(now)])]
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(now[k]))
      .sort();
    return { promised: true, compared: true, drift: keys.join(', ') };
  }

  /**
   * REV-14: collect the promised-but-unreachable members into evidence; `null` when there is no
   * difference at all, so a consistent pass produces no reading.
   *
   * REV-14：把「承诺了却比不到」的那些收成证据；**没有差集就返回 `null`**（不产生该读数）。
   */
  private _comparabilityEvidence(
    entries: Array<{
      ref: { resultType: string; resultId: number };
      cmp: TargetComparison;
    }>,
  ): RevokeComparabilityEvidence | null {
    const promised: RevokeComparabilityEvidence['promised'] = [];
    const uncomparable: RevokeComparabilityEvidence['uncomparable'] = [];
    for (const { ref, cmp } of entries) {
      if (!cmp.promised) continue;
      promised.push({ ...ref });
      if (!cmp.compared) uncomparable.push({ ...ref, reason: cmp.reason });
    }
    if (uncomparable.length === 0) return null;
    this.logger.warn(
      `[AiToolEffects] REV-14 承诺比对却比不到：${uncomparable
        .map((u) => `${u.resultType} #${u.resultId}(${u.reason})`)
        .join('、')}——已记在该组根行上，撤销判定**不因此改变**`,
    );
    return { promised, uncomparable };
  }

  /**
   * REV-17 (supersedes REV-14's single column): **append** this pass's reading rather than overwrite the
   * last one — one piece of evidence per revoke, kept on the **root** row's history (a single-target row
   * is its own root; never a copy per member).
   *
   * One column held one reading, so a later attempt erased an earlier one — and a pass with nothing to
   * report wrote `null`, which reads exactly like "this row was never revoked". One row per attempt keeps
   * the two apart: the row says what was checked and what it found, and **no row means no check**.
   *
   * The callers are unchanged in one respect that matters: they still invoke it only **after** the
   * compensation actually landed — a verdict that never materialised records nothing.
   *
   * REV-17：把这一次的读数**追加**下来，而不是覆盖上一次。
   *
   * 一列只装一个读数，于是后一次尝试会抹掉前一次 —— 而无可报的那一次写 `null`，与「该行从未被撤销」读成
   * 同一个样子。每次尝试一行把两半分开：行说清了查了什么、查到什么，而**没有行就是没有查过**。
   *
   * 调用点有一处不变且要紧：仍只在**补偿真的落地之后**才调它 —— 判定没成立时不记任何东西。
   */
  async record(
    root: AiToolSideEffect,
    entries: Array<{
      ref: { resultType: string; resultId: number };
      cmp: TargetComparison;
    }>,
  ): Promise<void> {
    if (!this.comparabilityRepo) return; // 降级装配：这段历史记不下来（见构造器注释）
    // **什么都没承诺 ⇒ 什么都不记**。`_comparabilityEvidence` 返回 null 有**两种**情形：真的全比过了，与
    // 「捕获器缺席 ⇒ 本就什么都没承诺」。给后者写一条 `clean` 会说「查过」而其实没查 —— 那正是本次改动要消灭的
    // 那类谎。故先问「有没有可比这件事」，没有就不落行；空历史因此只表示「没有一次尝试走到过承诺」。
    if (!entries.some((e) => e.cmp.promised)) return;
    const evidence = this._comparabilityEvidence(entries);
    try {
      await this.comparabilityRepo.save(
        this.comparabilityRepo.create({
          effectId: root.id,
          checked: evidence ? 'diff' : 'clean',
          promised: evidence ? JSON.stringify(evidence.promised) : null,
          uncomparable: evidence ? JSON.stringify(evidence.uncomparable) : null,
        }),
      );
    } catch (err) {
      // 与旧的 `_patchRevoke` 同一条容忍度：撤销本身已经发生，这行只是注解，写不进去不该把它变成失败。
      // 但**不静默**——日志里说清是哪一行的哪一次尝试没记上。
      this.logger.warn(
        `[AiToolEffects] REV-17 comparability attempt not recorded (effect ${root.id}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * REV-14: the read side, same shape as the write side. Unparseable reads as `null` rather than
   * throwing — a bad annotation must not take the whole list down.
   *
   * REV-14：读侧的解析（与写入侧同一形状）；读不出来就如实给 `null`，不外抛打断列表。
   */
  private _parseComparability(
    raw: string | null | undefined,
  ): RevokeComparabilityEvidence | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object'
        ? (parsed as RevokeComparabilityEvidence)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * REV-17: the comparability history for a whole page of effects, in **one** query.
   *
   * Done as a batch rather than per row: this mapping already loads each target, and a second per-row
   * round trip would grow that with the page. Groups by effect id, oldest attempt first.
   *
   * REV-17：一页副作用行的可比性历史，**一次**查询取回。
   *
   * 批量而不是按行：这个映射本来就要逐行 `_loadTarget`，再加一层按行往返会随页大小增长。按副作用 id
   * 分组，尝试按时间升序。
   */
  async historyFor(
    effectIds: number[],
  ): Promise<Map<number, RevokeComparabilityAttempt[]>> {
    const byEffect = new Map<number, RevokeComparabilityAttempt[]>();
    if (!this.comparabilityRepo || effectIds.length === 0) return byEffect;
    const rows = await this.comparabilityRepo.find({
      where: { effectId: In(effectIds) },
      order: { id: 'ASC' },
    });
    for (const row of rows) {
      const attempts = byEffect.get(row.effectId) ?? [];
      attempts.push({
        checked: row.checked,
        promised: this._parseJsonArray<RevokeComparabilityAttempt['promised'][number]>(row.promised),
        uncomparable:
          this._parseJsonArray<RevokeComparabilityAttempt['uncomparable'][number]>(row.uncomparable),
        at: row.at instanceof Date ? row.at.toISOString() : null,
      });
      byEffect.set(row.effectId, attempts);
    }
    return byEffect;
  }

  /**
   * REV-17: one effect's history, with the **legacy** single-column reading in front when there is one.
   *
   * The old column is not dropped and not ignored: its value is the last reading taken before the history
   * existed, and dropping it from the answer would erase exactly the kind of evidence this change is
   * about. It does not know when it was written, so it says `at: null` and `legacy: true` rather than
   * guessing a moment.
   *
   * REV-17：一条副作用的历史；若有**遗留**的单列读数，放在最前。
   *
   * 旧列既不删也不忽略：它的值是历史存在之前取的最后一个读数，把它从答案里去掉，正是抹掉本次改动要保住的
   * 那类证据。它不知道自己写于何时，故如实说 `at: null` 与 `legacy: true`，而不是猜一个时刻。
   */
  comparabilityFor(
    effect: AiToolSideEffect,
    history: Map<number, RevokeComparabilityAttempt[]>,
  ): RevokeComparabilityAttempt[] {
    const legacy = this._parseComparability(effect.revokeComparability);
    return [
      ...(legacy
        ? [
            {
              checked: 'diff' as const,
              promised: legacy.promised,
              uncomparable: legacy.uncomparable,
              at: null,
              legacy: true as const,
            },
          ]
        : []),
      ...(history.get(effect.id) ?? []),
    ];
  }

  /** JSON 文本 → 数组；读不出（空 / 非法 / 非数组）一律 `[]` —— 坏注解不该打断列表（同 `_parseComparability` 口径）。 */
  private _parseJsonArray<T>(raw: string | null | undefined): T[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
}
