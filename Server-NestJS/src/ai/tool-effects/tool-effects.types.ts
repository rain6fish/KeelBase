// SPDX-License-Identifier: Apache-2.0

/**
 * 副作用登记 / 撤销的对外类型与 DI token。**从 `ai-tool-effects.service.ts` 原样搬来**（2026-10-11 拆分
 * 第二批），搬动时一字未改；服务仍把它们**再导出**，故任何从服务路径 import 它们的调用方不受影响。
 *
 * 唯一的例外是 `TargetComparison`：它在**这里**导出（好让同目录的兄弟模块能用），但**不**从服务再导出
 * —— 那正是搬动前服务对外的面子。
 *
 * Public types and the DI token for the side-effect registry, moved verbatim out of the service, which
 * re-exports them so no importer's path changes. `TargetComparison` is the exception: exported here for
 * sibling modules, deliberately not re-exported from the service, matching the surface it had before.
 */
import type { DeclaredSideEffect } from './effect-composition';
import type { AiToolSideEffect } from './ai-tool-side-effect.entity';
import type { CaptureUnavailableReason } from './side-effect-snapshot-captor';
import type { CapturedWrite } from '../../common/write-capture/write-capture';
import type { DerivedReferenceCount } from './side-effect-revoker';
import type { RevokeClass } from '../interfaces/tool.interface';

export interface WriteToolContext {
  userId: string;
  conversationId?: string;
  /** KB-5 run 授权 id（run 成员写才有，= run 确认 token；docs/revoke-contract.spec.md §4 G1）。链外注解，不入 _chainPayload */
  runId?: string;
  /**
   * REV-7：这次写**依据的那次授权**（确认 / 审批 token）。缺省 = 没有授权参与（受信任作用域内的自动写）
   * —— 含义是「没有审批，也就没有窗口」，不是「未知」。由调用方在边界处给，落进占位行的
   * `authorization_ref`：窗口住在确认行上，该列是**唯一**指得回它的引用（`runId` 只覆盖 run 成员）。
   */
  authorizationRef?: string;
  toolName: string;
  args: Record<string, unknown>;
  /**
   * REV-7：写发生时**谁在替用户执行**（`actorContext.agentId`，与审计行同一来源）。
   * 由调用方在边界处读入——登记层不自己去追这个上下文，免得把两处取值的时机弄歧义。
   */
  agentId?: string;
  /**
   * REV-10：调用期间**数据层实际观察到的写**（由 `tool-execution` 在采集作用域里取得）。
   * 登记层拿它与**自己要记的目标**对差，把「写了却没记」的那些如实落到行上。
   * 缺席 = 没开采集（单测 / 降级装配）⇒ 不产生这条读数，**不假装「没写过」**。
   */
  observedWrites?: CapturedWrite[];
  /** KB-6：副作用撤销能力档位（可直传；缺省由服务内按工具注册/resultType 兜底解析） */
  revokeClass?: RevokeClass;
}

/** E-1 字段级变更快照（JSON 字符串；create 类 before 为 null） */
export interface SideEffectSnapshot {
  before?: string | null;
  after?: string | null;
  /**
   * REV-13：`after` 为空时的**成因**（`no_captor` / `no_entity_and_empty_fallback` / `row_missing` / `failed`）。
   * 缺省 = 调用方没给成因（那时该行落 `identity_incomplete_reason = null`，读作「标了但原因不可考」——
   * 如实，而不是拿一个默认值冒充已知）。
   */
  afterReason?: CaptureUnavailableReason | null;
}

/** B 路径外部副作用撤销执行器 token（AiModule 提供 ProxyToolRevokerService） */
export const EXTERNAL_REVOKER = 'EXTERNAL_REVOKER';

/** 级联补偿汇总（docs/cascade-compensation.spec.md §5；wire v3 revokeResult.cascade） */
export type RevokeCascadeSummary = {
  groupId: string;
  total: number;
  revoked: number;
  skipped: number;
  failed: number;
};

/** G1 会话级批量撤销：单条结果（skipped 时 revoked=false + reason） */
export type RevokeBatchItem = {
  effectId: number;
  revoked: boolean;
  skipped?: boolean;
  reason?: 'already_revoked' | 'compensating' | 'revoke_class_none';
  revokeStatus?: 'revoked' | 'compensating' | 'revoke_failed' | null;
  external?: boolean;
  message?: string;
  error?: string;
  /** 级联补偿（v3）：该结果所属补偿组（null/缺省 = 单目标副作用） */
  compensationGroup?: string | null;
  /**
   * REV-1 / REV-5：该行所属补偿组**不得被读成「这次业务动作已完全撤销」**——REV-1 声明与持有不一致，
   * 或 REV-5 另一个活着的补偿组仍主张本组 effect。逐条计数仍是逐行事实（这一行确实被补偿了）。
   * 批量里没有组级结论位（契约也不允许新增顶层键），故由逐条标记承载这个信号。
   */
  disputed?: boolean;
};

/** G1 会话级批量撤销：汇总 + 逐条结果 */
export type RevokeBatchResult = {
  conversationId: string;
  total: number;
  revoked: number;
  skipped: number;
  failed: number;
  results: RevokeBatchItem[];
};

/** §4 G1：run 级批量撤销结果（同会话级形状，作用域键换成 runId） */
export type RevokeRunBatchResult = Omit<RevokeBatchResult, 'conversationId'> & { runId: string };

/**
 * REV-11: the outcome of claiming a stuck compensation. Everything other than `claimed` is a
 * **refusal**, and each names which refusal it was — `not_stale` and `already_claimed` are different
 * situations for whoever is looking at the console, so they are not collapsed into one `false`.
 * REV-11：认领一条滞留补偿的结果。`claimed` 之外都是**拒绝**，且各自说明是哪一种 ——
 * `not_stale` 与 `already_claimed` 对看台子的人是两回事，故不压成一个 `false`。
 */
export type RevokeClaimOutcome = 'claimed' | 'not_found' | 'not_stale' | 'already_claimed';

/** REV-3：跨组重叠（同一业务对象被拆进多个补偿组）的检出条目 */
export interface SplitGroupFinding {
  resultType: string;
  resultId: number;
  /** 该业务对象出现在哪些补偿组里（> 1 即分裂） */
  groups: string[];
  /** 承载它的**已分组**副作用行 id（与 groups 同口径，按登记序） */
  effectIds: number[];
}

/** REV-5：撤销时判出的「**另一个活着的**补偿组仍主张同一 effect」 */
export interface CrossGroupClaim {
  resultType: string;
  resultId: number;
  /** 仍主张该 effect 的其它补偿组（不含本次撤销的组） */
  groups: string[];
}

/** 撤销结果：本地实体 revoked=true（软删）；B 路径外部（proxy_call）external=true（Java 端补偿 / 或诚实语义） */
export type RevokeResult = {
  revoked: boolean;
  effectId: number;
  external?: boolean;
  compensated?: boolean;
  message?: string;
  /** KB-6：撤销后回写的运维态（revoked=本地软删 / compensating=已请求外部补偿·结果未知 / revoke_failed=补偿失败） */
  revokeStatus?: 'revoked' | 'compensating' | 'revoke_failed';
  /** 单条撤销的幂等跳过标记（已撤销 / 已请求补偿 → 不重复触发） */
  skipped?: boolean;
  reason?: string;
  /** 级联补偿（v3）：该副作用所属补偿组（null/缺省 = 单目标副作用） */
  compensationGroup?: string | null;
  /** 级联补偿（v3）：整组汇总（仅组内成员数 > 1 时返回） */
  cascade?: RevokeCascadeSummary;
  /**
   * REV-16: rows that still point at what this revoke took away, from the edges we have a model for.
   *
   * **Present only when the target's type is in the registry** — an absent field means no reference model
   * (not checked), while an empty array means checked and nothing points at it. Both readings are useful
   * and they are not the same; the verdict does **not** change either way, and nothing is cascaded: this
   * reports what the revoke did not reach, which is exactly what the verdict alone could not say.
   *
   * REV-16：本次撤销拿走的东西，还有哪些行指着它 —— 只覆盖我们有模型的那些边。
   *
   * **只在目标类型已在登记表里时出现**：字段缺席 = 没有引用模型（未检查），空数组 = 查过且没有东西指着它。
   * 两种读数都有用、且不是一回事；**判定不因此改变**，也不级联任何东西 —— 它报的是这次撤销**没够到**的部分，
   * 而那正是单看判定说不出来的东西。
   */
  downstreamReferences?: DerivedReferenceCount[];
};

/**
 * REV-1：争议证据（JSON 存 `revoke_dispute` 列，**链外注解**）。
 * 留存「被拒的那份声明」与双向差集，使「少记录」这一静默失败变成可查的事实。
 */
export interface RevokeDisputeEvidence {
  /** 被拒的那份声明（重试声明的原样内容） */
  declared: DeclaredSideEffect[];
  /** 当时**已持有**的成员 */
  stored: DeclaredSideEffect[];
  /** 声明里有、持有里没有 —— 会被静默丢弃的那几条（撤销该组时补偿不到）**这一侧才触发「未完成」**（ARC-6） */
  onlyDeclared: DeclaredSideEffect[];
  /** 持有里有、声明里没有 —— 重试声明**更少**的情形。**记录但不再单独触发争议**：那几条**已被登记、会被补偿**，报未完成是假警报（ARC-6） */
  onlyStored: DeclaredSideEffect[];
  decidedAt: string;
  /**
   * ARC-6：**显式确认**（管理端动作）。争议标记此前**只写不清** ⇒ 组被永久读成「未完成」。
   * 「声明了却从未登记」的成员按构造**补不上**（重试撞键只会回放既有组，不补登记），故自动清除会把
   * 谎话写进状态；而「有人看过了」是人能给出的真信息。确认**只解除「未了结」**，**证据原样保留**。
   */
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

/**
 * REV-14: the members a revoke **promised** to compare, and the ones it could not.
 *
 * `promised` is knowable *before* the revoke runs: the members the comparison is even defined for
 * (`after_snapshot` present and the captor wired). `uncomparable` is what running it revealed — the
 * promised members the read never reached, each with the reason it could not.
 *
 * The promise is kept beside the difference rather than only the difference: a bare `uncomparable`
 * cannot say how large the promise was, so a reader could not tell a small oversight from a batch that
 * went wholly unchecked. Stored as JSON in `revoke_comparability`, a **chain-external annotation column**.
 *
 * REV-14：本次撤销**承诺**比对的成员，以及其中**没能比到**的那些。
 *
 * `promised` 在撤销跑起来**之前**就能确定：比对本身能定义的那些成员（`after_snapshot` 在、且捕获器已
 * 装配）。`uncomparable` 是跑完才浮现的 —— 承诺了、读取却没能到达的那些，各自带上**成因**。
 *
 * 承诺与差集并列保留、而不是只留差集：一个孤零零的 `uncomparable` 说不出「原本该比多少」，读者便
 * 无法分辨一次小疏漏与整批没查。以 JSON 存 `revoke_comparability`，**链外注解列**。
 */
export interface RevokeComparabilityEvidence {
  /** 撤销前集合快照：本次撤销**打算**比对的成员（`after_snapshot` 在 + 捕获器已装配）。 */
  promised: Array<{ resultType: string; resultId: number }>;
  /** 其中**没能比到**的成员，按成因列（`no_captor` 不会出现：捕获器缺席 ⇒ 本就什么都没承诺）。 */
  uncomparable: Array<{
    resultType: string;
    resultId: number;
    reason: CaptureUnavailableReason;
  }>;
}

/**
 * REV-17: one attempt's entry in a revoke's comparability history.
 *
 * `checked` is what keeps the two readings apart at the source — `diff` carries the promised/uncomparable
 * sets, `clean` records that this attempt reached the comparison and had nothing to report. `at === null`
 * marks the **legacy** entry: the single-column reading written before this history existed, whose moment
 * is not recoverable and is therefore not invented. `legacy` is spelled out rather than inferred from
 * `at === null`, so a row written today with an unparseable timestamp could not masquerade as history.
 *
 * REV-17：一次撤销的可比性历史上的一条记录。
 *
 * `checked` 是让两种读数在源头分开的东西 —— `diff` 带 promised/uncomparable 两个集合，`clean` 记下
 * 「这次走到了比对、无可报」。`at === null` 标记**遗留**条目：本历史存在之前写入的单列读数，其时刻
 * 不可考、故不臆造。`legacy` 明写而不是从 `at === null` 推断，免得日后某条时间戳解析不出的新行冒充历史。
 */
export interface RevokeComparabilityAttempt {
  checked: 'diff' | 'clean';
  promised: RevokeComparabilityEvidence['promised'];
  uncomparable: RevokeComparabilityEvidence['uncomparable'];
  /** 该次尝试的时刻；遗留条目为 `null`（不可考） */
  at: string | null;
  legacy?: true;
}

/**
 * REV-9 / REV-14 share this reading of one target re-read. **Read once**: reading twice would let two
 * paths reach two verdicts about the same state, which is the defect this repo keeps fixing.
 *
 * Three states, not "drift string | null": the old shape pushed "never promised" and "promised but could
 * not compare" into the same `null`, so REV-9's silent skips (`row_missing` / `failed`) were invisible in
 * the reading — which is exactly what REV-14 has to give a home to.
 *
 * REV-9 / REV-14 共用的比对读数（单次读目标，**只读一次**——分两次读会引入两条路两个结论）。
 *
 * 三态而不是「漂移字符串 | null」：旧形态把「没承诺比」与「承诺了却没比成」压进同一个 `null`，
 * 于是 REV-9 的静默跳过（`row_missing` / `failed`）在读数上不可见 —— 那正是 REV-14 要安放的东西。
 */
export type TargetComparison =
  /** 没承诺比对：无捕获器，或该行本就无 `after_snapshot`（身份缺「变更」那半，REV-6 另标）。 */
  | { promised: false }
  /** 承诺了、也真的比完了；`drift` 为 `null` = 逐字段相同。 */
  | { promised: true; compared: true; drift: string | null }
  /** 承诺了、却没比成（REV-9 静默跳过的那些）：`reason` 说清是哪一种「读不到」。 */
  | { promised: true; compared: false; reason: CaptureUnavailableReason };

/**
 * KB-6：可回写的撤销态列（**链外注解列**，不入 `_chainPayload`）。
 *
 * **放在这里而不是各自的 store 里**：撤销与争议两侧写的是同一批列，而写它的实现只有一处
 * （服务上的 `_patchRevoke`，经接缝注入）。同一形状声明两份，正是本仓反复修的那类「同一状态、两处说」
 * 缺陷的温床 —— 一处改、另一处没改，编译器不会出声。
 *
 * The columns a revoke writes back. Declared once because two stores write the same set through one
 * implementation: two identical declarations would let one drift from the other without the compiler
 * noticing.
 */
export type RevokePatch = Partial<
  Pick<
    AiToolSideEffect,
    'revokeStatus' | 'revokeRequestedAt' | 'revokeAcknowledgedAt' | 'revokeDispute' | 'revokeComparability'
  >
>;
