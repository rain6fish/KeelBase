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
import { createHash } from 'crypto';
import { ToolRegistry } from './tool-registry';
import { ToolGateService } from './tool-gate.service';
import { ExternalToolRegistry } from './external-tool-registry';
import { ProxyTool } from '../proxy/proxy-tool';
// ACT-9b：把这次写的 action key 送给出站写出方（`ProxyTool` 据此发 `Idempotency-Key`）
import { outboundIdempotencyKey } from '../proxy/outbound-idempotency';
import { AuthorizationDeniedError, ToolResult } from '../interfaces/tool.interface';
import { AiToolEffectsService, sortKeys } from '../tool-effects/ai-tool-effects.service';
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

    // ACT-7：执行点**重算审批要求**。上面几条复查覆盖了 enabled / 角色 / 开关 / 字段域 / 目的地，
    // 唯独审批要求只在**决策前**算过一次 —— 于是等待窗口内策略把工具升成 R4 时，一张「操作者本人点的
    // 确认」会把 R4 动作放行，而 R4 要的是**第二个人**点头。凭据本身（确认行有无审批人）在此校验。
    await this.toolGate.assertApprovalRequirementHolds(toolName, userId, opts?.authorizationRef);

    const isExternalWrite = this.externalTools.current?.isExternal(toolName) ?? false;

    // The idempotency probe runs **before** either execution path. The external branch used to
    // return first, so any replay — an LLM retry, a second decision on the same confirmation, a
    // restart — became a real second external write. The anchor row registered below is what makes
    // the key observable at all.
    // 幂等探测提前到两条执行路径**之前**：external 分支原先先返回，任何重放（LLM 重试 / 对同一确认
    // 二次裁决 / 重启）都会变成又一次真实外部写；下面登记的锚行才是让该键可被观测的前提。
    if (this.toolEffectsService) {
      const existing = await this.toolEffectsService.findExisting(
        AiToolEffectsService.buildKey({ userId, conversationId, toolName, args }),
      );
      if (existing.existing && existing.effect) {
        // 复合写工具幂等重放（docs/cascade-compensation.spec.md §4）：基键被**根成员**占用，命中后必须回放**整组**——
        // 只回根 id 会让调用方丢掉组（其余成员永远不会被重新声明）；而若基键不由根占用，本探测将永不命中 → 工具重复执行。
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
                  effects: group.map((e) => ({
                    resultType: e.resultType,
                    resultId: e.resultId,
                  })),
                }
              : {}),
          },
        };
      }
    }

    // ACT-5/6（roadmap §2.1.16）：**两条路径都在执行前认领** —— 使「这次调用是否已在执行」有一个
    // **不依赖「写已完成」**的答案。此前是 check-then-act：并发两份请求都读到「还没有」，于是目标被写
    // 两次，而 `idempotency_key` 的唯一约束只把**账**收成一行 —— 它护的是账，不是动作。
    // 占位走 `claimWrite`，其唯一约束就是仲裁点：先插进去的那个人拥有这次执行。
    //
    // **范围（ACT-6 第 2 片）**：从「仅本地实体写」扩到**代理写 / 外部 MCP 写**。两条路径的**失败政策
    // 不同**，依据是「我们究竟知道什么」—— 见下面 catch 的两支。
    // REV-7：agent 身份仍在**边界处**读一次（与审计行取的是同一个 `actorContext`），随 ctx 传给登记层。
    const effects = this.toolEffectsService;
    const agentId = actorContext.getStore()?.agentId;
    const claimKey = AiToolEffectsService.buildKey({ userId, conversationId, toolName, args });
    if (effects) {
      const claim = await effects.claimWrite({
        userId,
        conversationId,
        runId,
        toolName,
        args,
        agentId,
        // REV-7：这次写依据的那次授权（确认/审批 token）—— 由调用方在边界处读入，落进占位行。
        // 免确认的自动写不传（没有授权，也就没有窗口）。
        authorizationRef: opts?.authorizationRef,
      });
      if (!claim.won) {
        // 已有人持有这次执行 ⇒ **绝不重复执行**。如实报「未执行 + 为什么」——不谎报成功，也不谎报失败。
        // 对**外部写**尤其要紧：目标系统那边发生了什么我们本来就不掌握，重发一次可能是真双写。
        return {
          success: false,
          error:
            `工具 "${toolName}" 的这次调用已由另一请求接管（状态 ${claim.status}）——` +
            `本次未执行；其结果是成功还是失败不由本次调用回答`,
        };
      }
    }

    try {
      if (isExternalWrite) {
        const out = await this.externalTools.current!.callTool(toolName, args, userId);
        if (!out.executed) {
          // ACT-6：外部写**没有执行成功**，而我们**无法知道请求是否已经到达目标** —— 超时 / 不可达 /
          // 目标非 2xx 在传输层分不开（`ProxyTool.execute` 把它们归成一段文字，`ExternalToolCall` 只回
          // 一个布尔），故这里**无可判定的证据**。占位因此**留在 `claimed`**：不释放（释放 = 允许重试 =
          // 邀请一次可能重复的外部写），也不落定（那是对结果下判决）。过阈值后由 `listStaleClaims`
          // 冒出来待人核对 —— 与崩溃残留同一口径：**可见，不自动解决**。
          // ⚠ 边界（不得越说）：这只保证**我们自己**不重复发；目标系统是否收到、是否落了库，真值在那边
          //（端到端幂等要目标系统接受幂等键，见 roadmap §2.1.16 ACT-9）。
          return {
            success: false,
            error:
              `${out.error ?? 'External tool call failed'}；该请求**可能已到达**目标系统，` +
              `结果以目标系统为准 —— 本次不重试`,
          };
        }
        // Anchor row, **success only**: the anchor is the *ledger* row, and a failure must not leave one
        // or a retry would replay a failed result as success. The *claim* does occupy the key on failure
        // by design — see above — which is what stops a second real external write.
        // `revokeClass` is pinned to `none` on purpose — KeelBase has no compensation channel to a
        // third-party MCP server, so this row buys idempotency and traceability and is never a promise
        // that the external write can be taken back (docs/revoke-contract.spec.md 「补充事实」第一条).
        // 仅**成功时**登记锚行：锚行是**账**，失败留一条会让重试把失败回放成成功。而**占位**在失败时
        // 有意占住该键（见上）—— 那正是拦住第二次真实外部写的东西。`revokeClass` 有意钉为 `none`：
        // KeelBase 对第三方 MCP server 没有补偿通道，此行的价值是幂等与可追溯，**不是可撤销承诺**。
        if (effects) {
          const content = (out.content ?? {}) as { id?: unknown };
          const anchor = await effects.record(
            { userId, conversationId, runId, toolName, args, revokeClass: 'none' },
            EXTERNAL_CALL_EFFECT_TYPE,
            typeof content.id === 'number' ? content.id : proxyResultId(userId, toolName, args),
          );
          await effects.settleClaim(claimKey, anchor.id);
        }
        return { success: true, data: out.content ?? {} };
      }

      if (!effects) {
        // 降级装配（无账本）：照旧直接执行 —— 没有账本也就没有占位可言，逐字保持拆分前的行为。
        return this.toolRegistry.execute(toolName, args, userId);
      }

      // ACT-9b：这次写的 action key 就在手上 —— 与本地账本是**同一个键**（`claimKey`）。把它放进作用域，
      // 出站写出方（`ProxyTool`；代理写就从这里往下执行）据此发 `Idempotency-Key`。用作用域而不是加形参
      // 的理由（工具接口是热接口、只有这一个实现读它）见 `outbound-idempotency.ts`。
      const { result, effectId } = await outboundIdempotencyKey.run(claimKey, () =>
        this._executeLocalWrite(toolName, args, userId, conversationId, runId, agentId),
      );
      await effects.settleClaim(claimKey, effectId);
      return result;
    } catch (err) {
      // **两条路径的政策在这里分开**，依据是「我们究竟知道什么」：
      // - 本地实体写抛错 = 事务未提交 ⇒ **确认未落库** ⇒ 释放占位，使重试仍然可用。
      //  （把「校验失败」这类确定性失败也锁成不可重试，是功能倒退，不是安全。）
      // - 外部写抛错 = 请求**可能已经发出**（`fetch` 之后才抛的东西我们无从分辨）⇒ **不释放**：
      //   释放等于允许重试、也就等于邀请一次可能重复的外部写。占位留 `claimed`，待对账。
      if (effects && !isExternalWrite) await effects.releaseClaim(claimKey, 'execute_failed');
      throw err;
    }
  }

  /**
   * 本地实体写的执行体。ACT-5/6 切片1 从 `executeWrite` 抽出（**行为逐字不变**，只是多了返回 effectId），
   * 为的是让「占位 → 执行 → 落定/释放」在**一个**可判定的位置上包住它 ——
   * 否则要在这个方法里四处 `return` 之前各 settle 一次，漏一处就留下永久 claimed 的行。
   */
  private async _executeLocalWrite(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    conversationId?: string,
    runId?: string,
    agentId?: string,
  ): Promise<{ result: ToolResult; effectId: number | null }> {
    // 窄化：`toolEffectsService` 是 `@Optional()`，而「已装配」这个前提在方法边界上会丢。
    // 写成显式抛错而不是 `!`，免得装配真缺时变成一次难查的 undefined 调用。
    const effects = this.toolEffectsService;
    if (!effects) throw new Error('toolEffectsService 未装配（_executeLocalWrite 不应在被判空后调用）');

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
    // REV-7：`agentId` 由调用方在**边界处**读一次后传入（不再在此重复读），
    // 使「哪个 agent 替哪个用户写了这条」由副作用行**自己**回答，不必 join 两个结构再近似配对。
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
          const registeredGroup = await effects.recordGroup(
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
          // effectId 指向**根行**（组身份由根承载；只用于让占位行指回它的副作用，不作它用）
          const groupRoot =
            registeredGroup.find((e) => e.parentEffectId == null) ?? registeredGroup[0];
          return { result, effectId: groupRoot?.id ?? null };
        }
        // #4 副作用类型：proxy → proxy_call；旗舰 create_* → 显式别名；其余 create_* → 由工具名推导（生成模块，撤销走软删）
        const resultType = isProxyWrite ? 'proxy_call' : writeEffectTypeFor(toolName);
        if (!resultType) {
          // 无法推导类型（非 create 且无别名）——fail-closed：不登记副作用，避免错指记录（旧逻辑兜底 'todo' 为 bug）
          return { result, effectId: null };
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
        const recorded = await effects.record(
          { userId, conversationId, runId, toolName, args, agentId, observedWrites },
          resultType,
          resultId,
          { before, after },
        );
        return { result, effectId: recorded?.id ?? null };
      }
    }
    // 未登记副作用的成功写（预审类 / dry-run 预览）⇒ effectId 如实为 null，不假装有一条
    return { result, effectId: null };
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
