// SPDX-License-Identifier: Apache-2.0

/**
 * 授权解释器（§22.16 A-5 Explainable Authorization）
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
} from './interfaces/tool.interface';
import { GovernancePolicyService } from './governance/governance-policy.service';

@Injectable()
export class AuthorizationExplainerService {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly abilityFactory: CaslAbilityFactory,
    @Optional() private readonly governancePolicy?: GovernancePolicyService,
    @Optional() private readonly usersService?: UsersService,
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
  ): Promise<AuthorizationReasons> {
    const riskLevel = this.toolRegistry.riskLevel(toolName);
    const riskStrategy = RISK_STRATEGY[riskLevel];
    const checks: AuthorizationCheck[] = [];
    // §22.17 ③ Policy Evidence：单次取策略 → 决策输入（tool_enabled/role_allowed）+ 决策时策略版本同源，
    // 快照落库即冻结「当时是哪一版规则允许的」（无策略行 → policyVersion null，语义等同「默认策略」）。
    let policyVersion: string | null = null;
    if (this.governancePolicy) {
      const policy = await this.governancePolicy.getPolicy();
      policyVersion = policy.updatedAt ? new Date(policy.updatedAt).toISOString() : null;
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
        });
      } else {
        checks.push({ name: 'role_allowed', ok: true, note: '无角色限制' });
      }
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
      policyVersion,
    };
  }

  /** §22.16 A-5 授权链：放行场景的「为什么允许」依据（tool 治理 checks + 角色 CASL 决策） */
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

  /** §22.16 A-5 授权链图：按用户聚合完整授权链（角色→CASL 资源 + 工具策略 + 生效期） */
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
