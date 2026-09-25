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
import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { ToolRegistry } from './tool-registry';
import { ToolGateService } from './tool-gate.service';
import { ExternalToolRegistry } from './external-tool-registry';
import { ProxyTool } from '../proxy/proxy-tool';
import { AuthorizationDeniedError, ToolResult } from '../interfaces/tool.interface';
import { AiToolEffectsService, sortKeys } from '../tool-effects/ai-tool-effects.service';
import { writeEffectTypeFor, EXTERNAL_CALL_EFFECT_TYPE } from '../tool-effects/write-effect-type';
import { declaredEffects } from '../tool-effects/effect-composition';
import { SideEffectSnapshotCaptor } from '../tool-effects/side-effect-snapshot-captor';

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
    opts?: { audience?: string },
  ): Promise<ToolResult> {
    // §HS-9「工具门控（执行前）」：门控须在**执行点**成立，而非只在发起点成立。
    // 写工具从「发起」到「执行」之间有等待窗口——R3 确认（TTL 内由本人点批准）、R4 审批（跨请求、可达小时/天级），
    // 期间策略 `enabled` / 角色白名单 / 特性开关可能变化（策略「实时生效」，见 hs9 spec §0/§5）。此前仅发起时断言：
    // 已被禁用的工具仍会因「早先批准」而执行，kill-switch 对在途审批失效。此处复查，使执行点与发起点同门。
    await this.toolGate.assertToolAllowed(toolName, userId);

    // AUTHZ-2：策略声明的可写字段域 / destination 白名单，同样在**执行点**按实际请求校验
    //（与上面同一理由：声明可在等待窗口内被收紧，执行点才是它必须成立的地方）。
    await this.toolGate.assertWithinDeclaredScope(toolName, args);

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
    const result = await this.toolRegistry.execute(toolName, args, userId);
    const isProxyWrite = this.isProxyTool(toolName);
    // FP-8：B 路径写即使响应空体/未知结果也记 proxy_call 副作用锚（stable proxyResultId），不假装有 data——撤销/证据可定位
    const proxyAnchor = isProxyWrite && result.success;
    // 级联补偿（docs/cascade-compensation.spec.md §3）：复合写工具在 data.effects 声明跨表多目标；
    // 形状非法 → declaredEffects 返回 null（fail-closed）→ 回落既有单目标路径，绝不猜。
    const declared = result.success && !isProxyWrite ? declaredEffects(result.data) : null;
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
              const after = this.snapshotCaptor
                ? await this.snapshotCaptor.captureAfter(e.resultType, e.resultId, result.data)
                : null;
              return { before, after };
            }),
          );
          await this.toolEffectsService.recordGroup(
            { userId, conversationId, runId, toolName, args },
            declared,
            snapshots,
          );
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
        const after = this.snapshotCaptor
          ? await this.snapshotCaptor.captureAfter(resultType, resultId, result.data)
          : null;
        await this.toolEffectsService.record(
          { userId, conversationId, runId, toolName, args },
          resultType,
          resultId,
          { before, after },
        );
      }
    }
    return result;
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
