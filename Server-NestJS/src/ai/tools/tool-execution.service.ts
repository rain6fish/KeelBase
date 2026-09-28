// SPDX-License-Identifier: Apache-2.0

/**
 * 工具执行（从 `AiService` 拆出的第二个领域，健康清单 §3 阶段 3「主战场」）。
 *
 * 回答的是：**这个工具、这句参数，现在真的跑起来**——读工具（内置/外部同源）、
 * 写工具（幂等 + 副作用登记 + 前后快照）、plan/子代理的只读执行器。
 *
 * 与 `ToolGateService` 的分工：门控判「能不能跑 / 要不要确认」，本服务只管「跑」。
 * 写工具执行前仍要过门控——从发起到执行之间有等待窗口（R3 确认 / R4 审批），
 * 期间策略可能变化，故执行点必须复查（见 `executeWrite` 头注）。
 *
 * 拆它的顺序理由（同门控）：对话主循环与 R4 审批域都要调它，先于 R4 域拆出。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { ToolRegistry } from './tool-registry';
import { AiToolExecution } from './ai-tool-execution.entity';
// ACT-5：执行轴的判断单源（与 R4 审批轴刻意分开，见该文件头注）
import { deriveToolExecutionState, toolExecutionRefusal } from './tool-execution-claim';
import { ToolGateService } from './tool-gate.service';
import { ExternalToolRegistry } from './external-tool-registry';
import { ProxyTool } from '../proxy/proxy-tool';
import { AuthorizationDeniedError, ToolResult } from '../interfaces/tool.interface';
import { AiToolEffectsService, isUniqueViolation, sortKeys } from '../tool-effects/ai-tool-effects.service';
import { writeEffectTypeFor, EXTERNAL_CALL_EFFECT_TYPE } from '../tool-effects/write-effect-type';
import { declaredEffects } from '../tool-effects/effect-composition';
import { SideEffectSnapshotCaptor } from '../tool-effects/side-effect-snapshot-captor';
// REV-7：agent 身份与审计行同源，在此边界处读一次
import { actorContext } from '../actor-context';
// REV-10：把工具执行包进写入采集窗口（数据层实际写了什么）
import { withWriteCapture } from '../../common/write-capture/write-capture';

/**
 * B 路径：外部写无目标 id 时，用它作为副作用的 resultId（正整数，48bit）。
 *
 * The id names **this external write by this user**, not "that tool with those arguments". Both
 * properties are load-bearing, and both are about stability rather than secrecy: without the user
 * dimension, two users calling the same tool with the same arguments land on one
 * resultType+resultId and a lookup keyed on that pair mixes their rows; without canonical argument
 * order, two spellings of one logical call yield two ids and split a single effect across two
 * identities, while the idempotency key — which already serialises through `sortKeys` — counts them
 * as one.
 *
 * B 路径：外部写无目标 id 时，用它作为副作用的 resultId（正整数，48bit）。
 * 该 id 命名的是「**这个用户的这一次外部写**」，不是「那个工具加那些参数」。两条性质都是承重的，
 * 且都关乎稳定性而非保密：缺了用户维度，两个用户同工具同参数会落在同一个 resultType+resultId 上，
 * 按该二元组取行就会把两人的行混在一起；缺了参数序规范，同一逻辑调用的两种写法会产出两个 id，
 * 把一次 effect 拆成两个身份，而幂等键（本就用 `sortKeys` 序列化）把它们当作同一件事。
 */
function proxyResultId(userId: string, toolName: string, args: Record<string, unknown>): number {
  const h = createHash('sha256')
    .update(`${userId}:${toolName}:${JSON.stringify(sortKeys(args))}`)
    .digest('hex')
    .slice(0, 12);
  return Number(BigInt('0x' + h));
}

@Injectable()
export class ToolExecutionService {
  private readonly logger = new Logger(ToolExecutionService.name);

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly toolGate: ToolGateService,
    private readonly externalTools: ExternalToolRegistry,
    @Optional() private readonly toolEffectsService?: AiToolEffectsService,
    @Optional() private readonly snapshotCaptor?: SideEffectSnapshotCaptor,
    /**
     * ACT-5：执行身份仓储（认领/落定）。**@Optional** —— 单测 / 降级装配可省；省则退化为拆分前的行为
     * （探测 + 事后登记），并发与崩溃窗口仍在。部署态恒有（`ai.module` 已注册）。
     */
    @Optional() @InjectRepository(AiToolExecution)
    private readonly executions?: Repository<AiToolExecution>,
  ) {}

  /** HS-10：读工具执行（内置走 toolRegistry，外部走 provider）。 */
  async executeRead(
    name: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    if (this.externalTools.current?.isExternal(name)) {
      const out = await this.externalTools.current.callTool(name, args, userId);
      if (!out.executed) {
        return { success: false, error: out.error ?? 'External tool call failed' };
      }
      return { success: true, data: out.content ?? {} };
    }
    return this.toolRegistry.execute(name, args, userId);
  }

  /**
   * HS-3 写工具执行（幂等 + 副作用记录）：
   * - 同会话同工具同参数重复调用返回已有结果（防 LLM 重试/并发重复创建）
   * - 成功后记录副作用（resultType/resultId），管理台可软删撤销（衔接 RG-3）
   * toolEffectsService 未注入（单测/降级）时直接执行，跳过幂等。
   * HS-10：外部 MCP 写工具经 provider 执行（跳过幂等/副作用——外部工具不创建 KeelBase 实体）。
   *
   * ACT-5：执行点先**认领**（写一行执行身份）再跑工具，跑完**落定**。幂等因此不再只是探测：同键并发
   * 只有一个认领成功，崩溃后的重试读到那条认领而不是再执行一次 —— FP-10 的那个窗口就此关闭。
   *
   * `opts.authorizationRef` = 这次写依据的那次授权（确认 / 审批 token），落进执行行；免确认的自动写
   * 不传（没有授权，也就没有窗口 —— 这正是 REV-7 要的那个答案）。
   */
  async executeWrite(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    conversationId?: string,
    runId?: string,
    opts?: { audience?: string; authorizationRef?: string },
  ): Promise<ToolResult> {
    // §HS-9「工具门控（执行前）」：门控须在**执行点**成立，而非只在发起点成立。
    // 写工具从「发起」到「执行」之间有等待窗口——R3 确认（TTL 内由本人点批准）、R4 审批（跨请求、可达小时/天级），
    // 期间策略 `enabled` / 角色白名单 / 特性开关可能变化（策略「实时生效」，见 hs9 spec §0/§5）。此前仅发起时断言：
    // 已被禁用的工具仍会因「早先批准」而执行，kill-switch 对在途审批失效。此处复查，使执行点与发起点同门。
    await this.toolGate.assertToolAllowed(toolName, userId);

    // AUTHZ-2：策略声明的可写字段域 / destination 白名单，同样在**执行点**按实际请求校验
    //（与上面同一理由：声明可在等待窗口内被收紧，执行点才是它必须成立的地方）。
    await this.toolGate.assertWithinDeclaredScope(toolName, args, userId);

    // AUTHZ-1：确认 artifact 的目的地绑定。artifact 在签发时记下它被批准写往哪个系统，
    // 这里拿它和**此刻**该工具的目的地比对——等待窗口内目的地可被改指（Settings 热重载换代理
    // 目标、外部 server 重新注册），那时「批准写往 A」的 artifact 会静默落到 B。
    // 没有 artifact 的写（免确认自动写 / 本轮信任）不传 audience，故不受此约束——受约束的是 artifact，
    // 不是每一次写。
    if (opts?.audience) {
      const destination = this.toolGate.destinationOf(toolName);
      if (destination !== opts.audience) {
        throw new AuthorizationDeniedError(
          `Tool "${toolName}" destination changed since the confirmation was issued (confirmed for "${opts.audience}", now "${destination}")`,
          [
            {
              name: 'destination_binding',
              ok: false,
              note: `确认绑定目的地 ${opts.audience}，当前 ${destination} —— 跨目标复用被拒`,
            },
          ],
        );
      }
    }

    // 幂等回放（ACT-5 之后它是**快路径**）：这个键已经登记过 ⇒ 直接回放既有结果。认领撞上
    // 「已落定」时走的是**同一条**回放，故两处共用 `_replayExisting`，免得同一件事有两个实现。
    if (this.toolEffectsService) {
      const replay = await this._replayExisting(
        AiToolEffectsService.buildKey({ userId, conversationId, toolName, args }),
      );
      if (replay) return replay;
    }

    // ACT-5：**认领** —— 在执行**之前**把这次执行落定，幂等键由此从「探测」变成「闸门」。
    //
    // 位置两头都有讲究：必须在门控**之后**（一次门控拒绝不该占用键，否则一次拒绝会把该键毒化成
    // 「永远拒绝重试」），也必须在 `execute` **之前**（那正是 FP-10 那条 `check → execute` 的窗口）。
    const claim = await this._claimExecution({
      userId,
      conversationId,
      runId,
      toolName,
      args,
      destination: this.toolGate.destinationOf(toolName),
      authorizationRef: opts?.authorizationRef,
    });

    // 键已被占用：按**状态**如实回报。只有「已落定」才谈得上回放既有结果；其余三种一律**不执行**
    //（不可逆的写宁可少执行一次，也不多写一次 —— 口径同 ARC-3 的派发认领）。
    if (claim.outcome === 'taken') {
      const state = deriveToolExecutionState(claim.row);
      const replay = state === 'succeeded' ? await this._replayExisting(claim.key) : null;
      if (replay) return replay;
      return { success: false, error: toolExecutionRefusal(state, claim.row.error) };
    }

    // **落定只有一个出口**：所有执行路径都收在 `_executeClaimed` 里，故新加一条分支不可能忘了落定
    //（同 `ToolGateService._refuse` 的单出口理由：结构保证，不靠每条分支各自记得）。
    const result = await this._executeClaimed(toolName, args, userId, conversationId, runId);
    await this._settleExecution(claim.row, result);
    return result;
  }

  /**
   * 已认领的这次执行（ACT-5）：从「两条执行路径」到「登记副作用」的全部行为，**拆分前逐字未动**
   *（只把幂等探测移到了 `executeWrite` 里、换成了 `_replayExisting`）。
   * 它**只被** `executeWrite` 在认领成功之后调用，故这里出口虽多，落定仍只有一处。
   */
  private async _executeClaimed(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    conversationId?: string,
    runId?: string,
  ): Promise<ToolResult> {
    const isExternalWrite = this.externalTools.current?.isExternal(toolName) ?? false;

    if (isExternalWrite) {
      const out = await this.externalTools.current!.callTool(toolName, args, userId);
      if (!out.executed) {
        return { success: false, error: out.error ?? 'External tool call failed' };
      }
      // Anchor row, **success only**: a failure must not occupy the key, or every retry would
      // replay the failed result. `revokeClass` is pinned to `none` on purpose — KeelBase has no
      // compensation channel to a third-party MCP server, so this row buys idempotency and
      // traceability and is never a promise that the external write can be taken back
      // (docs/revoke-contract.spec.md 「补充事实」第一条).
      // 仅**成功时**登记锚行：失败不得占用该键，否则重试会回放失败结果。`revokeClass` 有意钉为 `none`
      // ——KeelBase 对第三方 MCP server 没有补偿通道，故此行的价值是幂等与可追溯，**不是可撤销承诺**。
      if (this.toolEffectsService) {
        const content = (out.content ?? {}) as { id?: unknown };
        await this.toolEffectsService.record(
          { userId, conversationId, runId, toolName, args, revokeClass: 'none' },
          EXTERNAL_CALL_EFFECT_TYPE,
          typeof content.id === 'number' ? content.id : proxyResultId(userId, toolName, args),
        );
      }
      return { success: true, data: out.content ?? {} };
    }

    if (!this.toolEffectsService) {
      return this.toolRegistry.execute(toolName, args, userId);
    }
    // §internal.16 A-1：update 类写工具 execute 前抓 before（本地实体重查 / proxy 用 args 摘要）；create 类返回 null
    const before = this.snapshotCaptor ? await this.snapshotCaptor.captureBefore(toolName, args) : null;
    // REV-10：把工具执行**包进采集窗口** —— 只有这一段是「这次调用真正写下的东西」。
    // 窗口开在 `execute` 上、关在登记之前：登记自己写的账本行因此不在窗内（它也不是可撤业务行）。
    const { result, writes: observedWrites } = await withWriteCapture(() =>
      this.toolRegistry.execute(toolName, args, userId),
    );
    const isProxyWrite = this.isProxyTool(toolName);
    // FP-8：B 路径写即使响应空体/未知结果也记 proxy_call 副作用锚（stable proxyResultId），不假装有 data——撤销/证据可定位
    const proxyAnchor = isProxyWrite && result.success;
    // 级联补偿（docs/cascade-compensation.spec.md §3）：复合写工具在 data.effects 声明跨表多目标；
    // 形状非法 → declaredEffects 返回 null（fail-closed）→ 回落既有单目标路径，绝不猜。
    const declared = result.success && !isProxyWrite ? declaredEffects(result.data) : null;
    // REV-7：agent 身份在**边界处**读一次（与审计行取的是同一个 `actorContext`），随 ctx 传给登记层，
    // 使「哪个 agent 替哪个用户写了这条」由副作用行**自己**回答，不必 join 两个结构再近似配对。
    const agentId = actorContext.getStore()?.agentId;
    if (
      result.success &&
      (proxyAnchor || declared || (result.data && (result.data as any).id !== undefined))
    ) {
      // 状态变更型写工具（AI 预审）与 dry-run 只读预览（create_module）不创建可撤销记录，仅确认 + 审计
      if (!['review_approval_request', 'create_module'].includes(toolName)) {
        // 复合组：一行一目标、同组（组 = 该次调用的幂等基键）→ 撤销任一条即补偿整组
        if (declared) {
          const snapshots = await Promise.all(
            declared.map(async (e) => {
              // REV-13：没有捕获器时也要**说清是哪一种「没有」** —— `no_captor` 是设计上的可选，
              // 与「实体在、行不在」那类异常必须分得开，否则读数里两者同形。
              const captured = this.snapshotCaptor
                ? await this.snapshotCaptor.captureAfter(e.resultType, e.resultId, result.data)
                : { json: null, reason: 'no_captor' as const };
              return { before, after: captured.json, afterReason: captured.reason };
            }),
          );
          const registeredGroup = await this.toolEffectsService.recordGroup(
            { userId, conversationId, runId, toolName, args, agentId, observedWrites },
            declared,
            snapshots,
          );
          // ARC-4：返回值不再被忽略。声明了 N 条却**一行都没登记**（幂等键被非本组成员占用）时，业务写
          // 已经发生、而它的副作用**不可撤** —— 这不是成功，也不能静默。证据（声明 vs 持有的双向差集）
          // 已写在占键那行的 `revokeDispute` 上、管理端可读；此处如实报一条警告。
          if (registeredGroup.length === 0 && declared.length > 0) {
            this.logger.warn(
              `[ToolExecution] ${toolName}: 声明的 ${declared.length} 条副作用一行都没登记（幂等键被非本组成员占用）——本次写不可撤`,
            );
          }
          return result;
        }
        // #4 副作用类型：proxy → proxy_call；旗舰 create_* → 显式别名；其余 create_* → 由工具名推导（生成模块，撤销走软删）
        const resultType = isProxyWrite ? 'proxy_call' : writeEffectTypeFor(toolName);
        if (!resultType) {
          // 无法推导类型（非 create 且无别名）——fail-closed：不登记副作用，避免错指记录（旧逻辑兜底 'todo' 为 bug）
          return result;
        }
        const resultId = isProxyWrite
          ? typeof (result.data as any)?.id === 'number'
            ? (result.data as any).id
            : proxyResultId(userId, toolName, args)
          : (result.data as any).id;
        // E-1 字段级变更审计：抓写操作目标记录 after 快照（本地实体全量 / 外部写用返回数据兜底）
        // REV-13 起返回 `{ json, reason }`；单目标行**不置** `identity_incomplete`（它不属于任何组），
        // 故此处只取 `json`，成因归组路径承载。
        const after = this.snapshotCaptor
          ? (await this.snapshotCaptor.captureAfter(resultType, resultId, result.data)).json
          : null;
        await this.toolEffectsService.record(
          { userId, conversationId, runId, toolName, args, agentId, observedWrites },
          resultType,
          resultId,
          { before, after },
        );
      }
    }
    return result;
  }

  /**
   * 这个键**已经登记**过吗？是则回放既有结果，否则 `null`。
   *
   * 复合写工具幂等重放（docs/cascade-compensation.spec.md §4）：基键被**根成员**占用，命中后必须回放
   * **整组** —— 只回根 id 会让调用方丢掉组（其余成员永远不会被重新声明）；而若基键不由根占用，本探测
   * 将永不命中 → 工具重复执行。
   *
   * 两个调用点共用它：执行前的快路径探测，与认领撞上「已落定」时的回放。
   */
  private async _replayExisting(key: string): Promise<ToolResult | null> {
    if (!this.toolEffectsService) return null;
    const existing = await this.toolEffectsService.findExisting(key);
    if (!existing.existing || !existing.effect) return null;
    const group = existing.effect.compensationGroup
      ? await this.toolEffectsService.listGroup(existing.effect.compensationGroup)
      : [];
    return {
      success: true,
      data: {
        id: existing.effect.resultId,
        idempotent: true,
        ...(group.length > 1
          ? {
              effects: group.map((e) => ({ resultType: e.resultType, resultId: e.resultId })),
            }
          : {}),
      },
    };
  }

  /**
   * ACT-5：**认领**这次执行 —— 在执行之前插一行，唯一键就是仲裁点。
   *
   * 插入成功 ⇒ 本次调用拥有这个键。撞唯一键 ⇒ **回读**那一行交调用方按状态如实回报：认领的语义是
   * 「这一次执行由谁落定」，故拿真实状态说话，不猜、不改写、不重试。
   *
   * 降级装配（无仓储）⇒ 跳过认领，退化为拆分前的行为（并发与崩溃窗口仍在）—— 这一点如实写在
   * `executions` 的注里，**不假装认领发生过**。
   */
  private async _claimExecution(input: {
    userId: string;
    conversationId?: string;
    runId?: string;
    toolName: string;
    args: Record<string, unknown>;
    destination?: string;
    authorizationRef?: string;
  }): Promise<
    | { outcome: 'owned'; key: string; row: AiToolExecution | null }
    | { outcome: 'taken'; key: string; row: AiToolExecution }
  > {
    const key = AiToolEffectsService.buildKey({
      userId: input.userId,
      conversationId: input.conversationId,
      toolName: input.toolName,
      args: input.args,
    });
    // 降级：没有仓储就没有认领可言，调用方照旧执行。
    if (!this.executions) return { outcome: 'owned', key, row: null };

    const draft = {
      idempotencyKey: key,
      userId: input.userId,
      conversationId: input.conversationId ?? null,
      runId: input.runId ?? null,
      toolName: input.toolName,
      destination: input.destination ?? null,
      // ACT-5 / REV-7：这次执行依据的那次授权（确认 / 审批 token）。没有授权的（免确认自动写）为 null
      // ——「没有审批，也就没有窗口」本身就是答案，不拿占位值冒充。
      authorizationRef: input.authorizationRef ?? null,
      // 与审计行同一来源（`actorContext`），在**边界处**读一次。
      agentId: actorContext.getStore()?.agentId ?? null,
    };

    try {
      const saved = await this.executions.save(this.executions.create(draft));
      return { outcome: 'owned', key, row: saved };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const row = await this.executions.findOne({ where: { idempotencyKey: key } });
      // 极罕见的竞态（占用者随后被删）：不静默吞，也不冒充「我拥有它」。
      if (!row) throw err;
      return { outcome: 'taken', key, row };
    }
  }

  /**
   * ACT-5：**落定**这次执行。
   *
   * - 成功 ⇒ 写 `settled_at`；
   * - 工具**报了失败** ⇒ 写 `error` —— 那是有记录的失败，与「认领了却从未落定」是两回事，不许混；
   * - 抛出 / 进程崩掉 ⇒ **什么都不写** ⇒ 认领过期后读作 `unknown`：我们无从分辨崩溃与挂起，谎报
   *   成功或失败都是支撑不起的断言（见 `tool-execution-claim.ts`）。
   */
  private async _settleExecution(row: AiToolExecution | null, result: ToolResult): Promise<void> {
    if (!this.executions || !row?.id) return;
    const patch = result.success
      ? { settledAt: new Date(), error: null }
      : { error: result.error ?? '工具返回失败（未给原因）' };
    try {
      await this.executions.update(row.id, patch);
    } catch (err) {
      // 落定失败不改「这次执行确实发生过」这件事；留给租约过期读作 unknown（保守方向）。
      this.logger.warn(
        `[ToolExecution] ACT-5 settle failed (execution ${row.id}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * ACT-5：把这次执行的**审计行**挂到执行身份行上 —— 证据根据此**精确**配对，不再在会话里的同名
   * 调用之间猜（ACT-2 立的「不唯一就不归因」因此有了一条精确支路）。
   *
   * 按**幂等键**定位执行行：调用方手上是工具名与原始参数串（审计行本来就是照它写的），键由同一个
   * `buildKey` 算出，故两处不可能指向不同的行。
   *
   * 找不到执行行（降级装配 / 这次写没走认领 / 旧数据）⇒ **静默跳过**：旧数据继续走保守配对，
   * 不假装精确。参数串解析不出来同样跳过 —— 宁可少一条链接，也不挂到错误的执行上。
   */
  async attachAuditRow(
    ref: { userId: string; conversationId?: string; toolName: string; argsJson: string },
    auditRowId: number,
  ): Promise<void> {
    if (!this.executions) return;
    let args: Record<string, unknown>;
    try {
      const parsed = JSON.parse(ref.argsJson) as unknown;
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      args = parsed as Record<string, unknown>;
    } catch {
      return;
    }
    const key = AiToolEffectsService.buildKey({
      userId: ref.userId,
      conversationId: ref.conversationId,
      toolName: ref.toolName,
      args,
    });
    try {
      await this.executions.update({ idempotencyKey: key }, { auditRowId });
    } catch (err) {
      // 挂链失败既不改变「这次执行发生过」，也不改变证据根能否回退到保守配对 ⇒ 只告警。
      this.logger.warn(
        `[ToolExecution] ACT-5 attach audit row failed (key ${key}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * NC-3 plan/子代理只读执行器：注入 plan-execute 与 sub-agent（同 gate + 只读强制）。
   * - 与主循环同 gate：_assertToolAllowed（R5 / 治理策略 enabled / 角色白名单 / featureFlag / adminOnly）
   * - 只读强制：写/需确认工具（R3/R4，含外部非只读）直接拒——子代理/plan 不得绕过确认与副作用登记执行写工具
   * - 通过后走 executeRead（内置/外部 provider 同源）
   * 内部读不单落 tool_call 行（对话级 delegate/plan 审计行已取证；此处只堵授权旁路，不改变审计语义）。
   */
  async executeAgentRead(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    await this.toolGate.assertToolAllowed(toolName, userId);
    if (await this.toolGate.requiresConfirmation(toolName)) {
      throw new AuthorizationDeniedError(
        `Tool "${toolName}" is write/confirmation-gated; plan and sub-agent steps are read-only`,
        [
          {
            name: 'agent_read_only',
            ok: false,
            note: 'plan/子代理仅执行只读工具；写操作请在主对话发起并人工确认',
          },
        ],
      );
    }
    return this.executeRead(toolName, args, userId);
  }

  /** B 路径：工具是否为 ProxyTool（读注册表判型，安全兜底） */
  isProxyTool(toolName: string): boolean {
    try {
      return this.toolRegistry.getTool(toolName) instanceof ProxyTool;
    } catch {
      return false;
    }
  }

  /** HS-10：工具是否由外部 MCP provider 提供（影响预览与执行路径共用同一判据，防两处漂移）。
   *  Whether the tool is served by an external MCP provider — the impact preview and the execution
   *  path must use one predicate, or the card and the registered row would disagree. */
  isExternalTool(toolName: string): boolean {
    return this.externalTools.current?.isExternal(toolName) ?? false;
  }
}
