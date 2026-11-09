// SPDX-License-Identifier: Apache-2.0

/**
 * 授权解释器（§internal.16 A-5 Explainable Authorization）
 *
 * 从 AiService 拆出的「只读授权解释」子域（阶段 2 import 环修复：切断 audit→AiService、
 * auth→AiService 的反向运行时依赖）。只计算「为何允许 / 为何需确认」的结构化依据，
 * 不改变任何业务状态。依赖 ToolRegistry（风险级权威源）+ CaslAbilityFactory + 治理策略。
 */

import { Injectable, Optional } from '@nestjs/common';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { UsersService } from '../users/users.service';
import { ToolRegistry } from './tools/tool-registry';
import {
  RISK_STRATEGY,
  AuthorizationCheck,
  AuthorizationReasons,
  ToolRiskLevel,
} from './interfaces/tool.interface';
import {
  GovernancePolicyService,
  effectiveGateMode,
  sanitizeBoundedFields,
} from '../governance-shared/services/governance-policy.service';
import { ToolGateService } from './tools/tool-gate.service';

/**
 * §internal.16 A-5 / T5 跨入口一致：**放行授权依据快照的单一构造**（JSON 字符串）。
 * 写三种行：**实际放行并成功执行**的行、**被扣下等人**（`outcome=pending`）的行、以及**没发生**的行
 * （`not_executed` / `declined`——窗口到期无人裁决，或有人拒绝）。三者回答的是同一个问题：「凭什么允许它
 * 到这一步」。**被门拒绝**的行不写（它们带的是 deny reasons 数组）→ 列里两种形状由此可分
 * （见 docs/audit-authz-snapshot.spec.md §5.6）。SSE 流式 / 非流式 / MCP / R4 执行器共用本函数，防形状漂移。
 * 注意对外键名为 `strategy`（源字段 riskStrategy）；`allowed/checks/riskLevel/policy` 是读取侧
 * `parseAllowedSnapshot` 依赖的契约字段。
 */
export function buildAllowSnapshot(tool: string, authz: AuthorizationReasons): string {
  return JSON.stringify({
    allowed: true,
    tool,
    riskLevel: authz.riskLevel,
    strategy: authz.riskStrategy,
    checks: authz.checks,
    ...(authz.policy ? { policy: authz.policy } : {}),
  });
}

@Injectable()
export class AuthorizationExplainerService {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly abilityFactory: CaslAbilityFactory,
    @Optional() private readonly governancePolicy?: GovernancePolicyService,
    @Optional() private readonly usersService?: UsersService,
    /**
     * AW-13: destination is resolved by `ToolGateService.destinationOf` — the single source the gate
     * itself uses. Optional so degraded assemblies still explain everything else; absent, the
     * destination check is simply not recorded (readers then report it as uncomparable, never as
     * "unchanged").
     *
     * AW-13：目的地取自 `ToolGateService.destinationOf` —— 门控自己用的那个单一源。降级装配可省；
     * 省了就不记这项检查（读侧如实报「不可比对」，绝不报「没变」）。
     */
    @Optional() private readonly toolGate?: ToolGateService,
  ) {}

  /**
   * W5-⑦ Explainable Authorization（评审四）：生成「为何允许 / 为何需确认」的结构化依据。
   * 由 tool_start / confirmation_request 事件携带，供前端渲染治理可解释性。
   * 调用时机在 _assertToolAllowed 之后，故 tool_enabled / role_allowed 反映已生效的门控。
   */
  async getAuthorizationReasons(
    toolName: string,
    userId: string,
    isWrite: boolean,
    /**
     * 调用方已解析的档位（可选）。**外部工具（`mcp_*`）必须传**：它们只由 `ExternalToolProvider` 解析、
     * 不在本地注册表，而本方法内 `toolRegistry.riskLevel` 对未注册名**抛错**——不传就会把「为何允许」的
     * 解释变成一次抛错。容错归调用方（它才知道外部工具），本服务保持纯解释。
     * 缺省时仍按注册表取，行为与从前一致。
     */
    riskLevelOverride?: ToolRiskLevel,
    /**
     * AW-13: the arguments of *this* call, so the field-domain decision can be recorded together
     * with the inputs it was taken on. Only names are kept (`argKeys`), never values — the values
     * live in the tool-call row's `tool_args` column, as before. Callers that do not have the
     * arguments yet simply omit it; readers then report the item as uncomparable.
     *
     * AW-13：**本次调用**的参数，用于把字段域判定与它依据的输入一起记下。只留参数名
     * （`argKeys`），不留取值 —— 取值仍只在工具调用行的 `tool_args` 列。手上还没有参数的调用方
     * 可以不传；读侧会对该项如实报「不可比对」。
     */
    args?: Record<string, unknown>,
  ): Promise<AuthorizationReasons> {
    const riskLevel = riskLevelOverride ?? this.toolRegistry.riskLevel(toolName);
    const riskStrategy = RISK_STRATEGY[riskLevel];
    const checks: AuthorizationCheck[] = [];
    // §internal.17③ Policy Evidence：单次取策略 → 决策输入（tool_enabled/role_allowed）与决策时策略版本（内容指纹 revision）同源，
    // 快照即冻结「当时是哪一版规则允许的」；无策略行/revision 则不附 policy（默认策略语义，向后兼容旧快照）。
    let policyMeta: { revision: string; updatedAt?: string | null } | undefined;
    if (this.governancePolicy) {
      const policy = await this.governancePolicy.getPolicy();
      // 无策略行（getPolicy 恒返回空 value 的内容指纹 revision）→ 不附 policy（audit-authz-snapshot §5：默认策略语义，
      // 向后兼容旧快照）。updatedAt 作为「策略行存在」信号——无行显式 null，有行由 save 落时间戳。
      if (policy?.revision && policy.updatedAt) {
        policyMeta = {
          revision: policy.revision,
          updatedAt: policy.updatedAt ? new Date(policy.updatedAt).toISOString() : null,
        };
      }
      const cfg = policy.tools?.[toolName] ?? {};
      const enabled = cfg.enabled ?? true;
      checks.push({
        name: 'tool_enabled',
        ok: enabled,
        note: enabled ? '治理策略已启用' : '治理策略禁用',
      });
      const roles = cfg.allowedRoles ?? [];
      if (roles.length > 0) {
        const user = this.usersService
          ? await this.usersService.findOne(Number(userId))
          : null;
        const ok = !!user && !!user.role && roles.includes(user.role);
        checks.push({
          name: 'role_allowed',
          ok,
          note: ok
            ? `角色 ${user.role} ∈ [${roles.join(', ')}]`
            : `需要角色 [${roles.join(', ')}]`,
          detail: { allowedRoles: roles, role: user?.role ?? null },
        });
      } else {
        // No restriction ⇒ the user row is not read (no extra query on the hot path): the decision is
        // already determined by "there was no restriction then". If a later policy revision adds a
        // role restriction, the reader has no role to compare against ⇒ it says "not comparable"
        // rather than guessing.
        //
        // 无限制时**不查用户**（热路径不加一次读）：判定在「当时无限制」这一事实下已是确定的。
        // 若历史版本的策略新增了角色限制，读侧没有当时的角色可比 ⇒ 如实报「不可比对」，而不是猜。
        checks.push({
          name: 'role_allowed',
          ok: true,
          note: '无角色限制',
          detail: { allowedRoles: roles },
        });
      }
      // CONF-1「有界变动」：本工具声明了界限时把它写进快照 —— 那次放行**可被追责到界限本身**，
      // 而不是追责到某一组具体取值（具体值在别的列：工具行 args / 字段域检查）。故这里**不需要** args。
      const bounded = sanitizeBoundedFields(cfg.boundedFields);
      for (const field of Object.keys(bounded).sort()) {
        checks.push({
          name: 'field_bound',
          ok: true,
          note: `${field} 声明界限 ≤ ${bounded[field].max}（本次放行覆盖该界限内的取值）`,
        });
      }
      // AW-13: each of the other four decisions is recorded as "decision + structured inputs". A
      // reader re-runs them against the policy of the recorded revision and compares — "this write
      // was authorized" stops resting on a single source. Only argument *names* are kept; values stay
      // in the tool-call row's `tool_args` column.
      //
      // AW-13：另四项判定各自记成「判定 + 结构化输入」——读侧按记录版本的策略快照重跑这四项再对拍，
      // 「这次写被授权了」由此不再只有单一来源。参数只留**名字**，取值仍在工具调用行的 `tool_args` 列。
      if (args !== undefined) {
        const writable = cfg.writableFields ?? [];
        const argKeys = Object.keys(args ?? {});
        const outside = writable.length > 0 ? argKeys.filter((k) => !writable.includes(k)) : [];
        checks.push({
          name: 'field_domain',
          ok: outside.length === 0,
          note:
            writable.length === 0
              ? '未声明可写字段域'
              : outside.length === 0
                ? `字段 [${argKeys.join(', ')}] ∈ 可写域 [${writable.join(', ')}]`
                : `字段 ${outside.join(', ')} 不在可写域 [${writable.join(', ')}]`,
          detail: { writableFields: writable, argKeys },
        });
      }
      if (this.toolGate) {
        // Destination comes from the gate's own resolver (AUTHZ-1 single source) — no second copy of
        // that rule here.
        //
        // 目的地取自门控的同一个解析（AUTHZ-1 单一源），不在这里另写一份规则。
        const destination = this.toolGate.destinationOf(toolName);
        const allowedDestinations = cfg.allowedDestinations ?? [];
        const ok = allowedDestinations.length === 0 || allowedDestinations.includes(destination);
        checks.push({
          name: 'destination_allowed',
          ok,
          note:
            allowedDestinations.length === 0
              ? `目的地 ${destination}（未声明白名单）`
              : ok
                ? `目的地 ${destination} ∈ [${allowedDestinations.join(', ')}]`
                : `目的地 ${destination} 不在白名单 [${allowedDestinations.join(', ')}]`,
          detail: { destination, allowedDestinations },
        });
      }
      // Approval requirement: the effective gate mode. The risk level is the tool's own declaration
      // (not in the policy), so it is frozen alongside the decision for the replayer.
      //
      // 审批要求：门控档位与实际风险级（后者来自工具声明，不在策略内，故随判定一起冻结）。
      const gateMode = effectiveGateMode(cfg, riskLevel);
      checks.push({
        name: 'approval_required',
        ok: gateMode === 'approval',
        note: `门控档位 ${gateMode}（策略覆盖/声明的风险级 ${riskLevel} 推导）`,
        detail: { mode: gateMode, riskLevel },
      });
    }
    checks.push({
      name: 'user_scoped',
      ok: true,
      note: '执行时注入调用者 userId，仅操作本人数据',
    });
    checks.push({
      name: 'risk_policy',
      ok: isWrite,
      note: `风险级 ${riskLevel}（${riskStrategy}）${isWrite ? '→ 需人工确认' : '→ 自动执行'}`,
    });
    return {
      tool: toolName,
      riskLevel,
      riskStrategy,
      requiresConfirmation: isWrite,
      checks,
      ...(policyMeta ? { policy: policyMeta } : {}),
    };
  }

  /** §internal.16 A-5 授权链：放行场景的「为什么允许」依据（tool 治理 checks + 角色 CASL 决策） */
  async explainAuthorization(toolName: string, userId: string): Promise<{
    tool: string;
    riskLevel?: string;
    riskStrategy?: string;
    requiresConfirmation?: boolean;
    checks: AuthorizationCheck[];
    casl?: { action: string; subject: string; allowed: boolean; reason: string; deniedBy?: string | null };
  }> {
    const isWrite = RISK_STRATEGY[this.toolRegistry.riskLevel(toolName)] !== 'auto';
    const reasons = await this.getAuthorizationReasons(toolName, userId, isWrite);
    let casl: { action: string; subject: string; allowed: boolean; reason: string; deniedBy?: string | null } | undefined;
    try {
      const user = this.usersService ? await this.usersService.findOne(Number(userId)) : null;
      casl = this.abilityFactory.explainForTarget(
        { role: (user?.role as any) ?? 'user', sub: Number(userId) },
        'manage',
        toolName,
      );
    } catch {
      casl = undefined;
    }
    return { ...reasons, casl };
  }

  /** §internal.16 A-5 授权链图：按用户聚合完整授权链（角色→CASL 资源 + 工具策略 + 生效期） */
  async getAuthorizationChain(user: { role: 'admin' | 'user'; sub: number; username?: string | null }): Promise<{
    user: { id: number; username: string | null; role: string };
    grants: Array<{ policy: string; resource: string; scope: string }>;
    toolPolicies: Array<{ toolName: string; enabled: boolean; allowedRoles: string[]; riskLevel?: string }>;
    effectiveSince: Date | string | null;
  }> {
    const described = this.abilityFactory.describeForUser({ sub: user.sub, role: user.role } as never);
    const grants = (described.resources ?? []).map((r) => ({
      policy: described.basis ?? '角色授权',
      resource: r.subject,
      scope: r.scope,
    }));
    let toolPolicies: Array<{ toolName: string; enabled: boolean; allowedRoles: string[]; riskLevel?: string }> = [];
    let effectiveSince: Date | string | null = null;
    try {
      const policy = await this.governancePolicy?.getPolicy();
      if (policy) {
        effectiveSince = policy.updatedAt ?? null;
        toolPolicies = Object.entries(policy.tools ?? {}).map(([toolName, cfg]) => ({
          toolName,
          enabled: cfg.enabled ?? true,
          allowedRoles: cfg.allowedRoles ?? [],
          riskLevel: this.toolRegistry.riskLevel(toolName) || undefined,
        }));
      }
    } catch {
      // 策略不可用时工具策略空（授权链图仍显示角色级 grants）
    }
    return {
      user: { id: user.sub, username: user.username ?? null, role: user.role },
      grants,
      toolPolicies,
      effectiveSince,
    };
  }
}
