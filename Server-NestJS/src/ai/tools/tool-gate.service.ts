// SPDX-License-Identifier: Apache-2.0

/**
 * 工具门控（从 `AiService` 拆出的第一个领域，健康清单 §3 阶段 3「主战场」）。
 *
 * 回答的是同一个问题：**这个工具在此时、由这个主体，能不能跑**——
 * 门控（R5 阻断 / 策略开关 / 角色白名单 / 特性开关 / adminOnly / 邮箱验证）与
 * 档位判定（是否需确认、是否走 R4 双人审批、风险级）。
 *
 * 拆它的顺序理由是**依赖**：执行域与 R4 审批域都要调它，它在依赖链最下游。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Injectable, Optional } from '@nestjs/common';
import { ToolRegistry } from './tool-registry';
import { ExternalToolRegistry } from './external-tool-registry';
import { GovernancePolicyService } from '../governance/governance-policy.service';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { UsersService } from '../../users/users.service';
import {
  AiTool,
  AuthorizationCheck,
  AuthorizationDeniedError,
  ToolRiskLevel,
} from '../interfaces/tool.interface';
import { resolveToolDestination } from './tool-destination';
import { BusinessException } from '../../common/errors/business.exception';
import { UserRole } from '../../common/entities/user.entity';
import { MetricsService } from '../../metrics/metrics.service';
import { isFixtureUser } from '../constants/fixture-identity';

@Injectable()
export class ToolGateService {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly externalTools: ExternalToolRegistry,
    @Optional() private readonly governancePolicy?: GovernancePolicyService,
    @Optional() private readonly featureFlagsService?: FeatureFlagsService,
    @Optional() private readonly usersService?: UsersService,
    /**
     * REV-15：拒绝计数（`tool_gate_refusals_total`）。**@Optional** —— 单测/降级装配可省，
     * 省则计数静默跳过（抛出的语义不受影响：计数是证据，不是门控本身）。
     */
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /**
   * REV-15：拒绝的**唯一出口** —— 计数与抛出在同一处，所以「同一闸门、同一计数器」是**结构保证**的，
   * 不靠每个分支各自记得加一行。新加一条门控若绕开它，就直接少了证据（且审查时一眼可见）。
   */
  private _refuse(userId: string, check: AuthorizationCheck, message: string): never {
    this._countRefusal(userId, check.name);
    throw new AuthorizationDeniedError(message, [check]);
  }

  /**
   * 记一次拒绝。`source` 由**夹具身份单源**判读（`ai/constants/fixture-identity.ts`）——
   * 不在本文件里另写一份前缀，否则「评测在用夹具身份而计数器记成生产」这类漂移无人察觉。
   */
  private _countRefusal(userId: string, reason: string): void {
    this.metrics?.toolGateRefusalsTotal.inc({
      reason,
      source: isFixtureUser(userId) ? 'fixture' : 'production',
    });
  }

  /**
   * HS-2 + HS-9 工具执行前权限门控：按工具声明 + 治理策略检查调用资格。
   * - HS-9 策略开关：工具被策略禁用时拒绝
   * - HS-9 角色白名单：allowedRoles 非空时仅列内角色可调（headless 系统账号由 API Key 鉴权，跳过）
   * - featureFlag：对应特性开关关闭时拒绝（对齐 HTTP 层 @FeatureFlag）
   * - requireVerifiedEmail：写操作需已验证邮箱（对齐 EmailVerificationGuard，admin/headless 视为已验证）
   * 无 permissions 声明的工具视为允许（数据隔离已由 execute 的 userId 保证）。
   */
  async assertToolAllowed(
    toolName: string,
    userId: string,
  ): Promise<void> {
    let tool: AiTool | undefined;
    try {
      tool = this.toolRegistry.getTool(toolName);
    } catch {
      // 工具未注册：让后续 execute 抛「not found」，这里不拦截
    }

    // W5 风险模型：R5（不可逆/外部动作）→ 阻断，不进入确认/执行（评审二 §7）
    if (tool && this.toolRegistry.riskLevel(toolName) === 'R5') {
      this._refuse(
        userId,
        { name: 'risk_policy', ok: false, note: `风险级 R5（不可逆/外部动作）→ 阻断` },
        `Tool "${toolName}" is blocked (risk level R5)`,
      );
    }

    // HS-9 治理策略：工具开关 + 角色白名单
    if (this.governancePolicy) {
      const enabled = await this.governancePolicy.isToolEnabled(toolName);
      if (!enabled) {
        this._refuse(
          userId,
          { name: 'tool_enabled', ok: false, note: '治理策略禁用此工具' },
          `Tool "${toolName}" is disabled by governance policy`,
        );
      }
      const allowedRoles = await this.governancePolicy.getAllowedRoles(toolName);
      if (allowedRoles.length > 0 && userId !== '0') {
        // A14：角色白名单每次工具调用实时查库取用户——角色降权对下一次工具调用立即生效；
        // 治理策略本身经 SettingsService 缓存提供（写 settings 即失效重载），非持久缓存，
        // 因此「策略降权不生效」的感知来自设置未落库，而非本层缓存。此处不做额外 TTL 缓存。
        const user = this.usersService
          ? await this.usersService.findOne(Number(userId))
          : null;
        if (!user || !user.role || !allowedRoles.includes(user.role)) {
          this._refuse(
            userId,
            {
              name: 'role_allowed',
              ok: false,
              note: `需要角色 [${allowedRoles.join(', ')}]${user ? `，当前 ${user.role ?? '无角色'}` : ''}`,
            },
            `Tool "${toolName}" is restricted to roles: ${allowedRoles.join(', ')}`,
          );
        }
      }
    }

    const perms = tool?.permissions;
    if (!perms) return;

    if (
      perms.featureFlag &&
      this.featureFlagsService &&
      !this.featureFlagsService.isEnabled(perms.featureFlag as never)
    ) {
      this._refuse(
        userId,
        { name: 'feature_flag', ok: false, note: `特性开关 ${perms.featureFlag} 关闭` },
        `Tool "${toolName}" is disabled (feature flag "${perms.featureFlag}" off)`,
      );
    }

    // System AI Assistant：adminOnly 工具仅管理员（或系统账号 '0'——eval/兼容）可调用。
    // 管理端助手已改为真实管理员身份，故按角色放行（与角色白名单一致实时查库）。
    if (perms.adminOnly && userId !== '0') {
      const user = this.usersService
        ? await this.usersService.findOne(Number(userId))
        : null;
      if (!user || user.role !== UserRole.ADMIN) {
        this._refuse(
          userId,
          { name: 'admin_only', ok: false, note: '仅管理员/系统账号可用' },
          `Tool "${toolName}" is admin-only`,
        );
      }
    }

    // headless 系统账号（userId '0'）：由 headless 层 API Key 鉴权，不重复拦截
    if (userId === '0') return;

    if (perms.requireVerifiedEmail && this.usersService) {
      const user = await this.usersService.findOne(Number(userId));
      // 与 EmailVerificationGuard 一致：admin 视为已验证（headless '0' 已在上面返回）
      if (user && user.role !== UserRole.ADMIN && !user.emailVerified) {
        // 与上面各条**同闸门同计数器**：这里抛的是 BusinessException（错误码路径），但拒绝就是拒绝，
        // 不能因为抛出类型不同就不计入——否则「门在守」的证据会缺一块。
        this._countRefusal(userId, 'email_verified');
        throw new BusinessException('EMAIL_NOT_VERIFIED');
      }
    }
  }

  /**
   * 工具目的地（AUTHZ-1 单一源）：写落到哪个系统。外部 MCP → `mcp:<server>`；声明了 `audience` 的
   * 工具（B 路径 proxy）→ 该 audience；其余 → `local`。
   *
   * 未注册的工具名（LLM 幻觉名 / 外部工具）不抛错——外部工具本就不在本地注册表；两者都按名解析目的地。
   */
  destinationOf(toolName: string): string {
    let tool: AiTool | undefined;
    try {
      tool = this.toolRegistry.getTool(toolName);
    } catch {
      tool = undefined;
    }
    return resolveToolDestination(toolName, tool);
  }

  /**
   * AUTHZ-2：治理策略声明的**可写字段域**与 **destination 白名单**，按**这一次的实际请求**校验。
   *
   * 与「确认绑定精确 args」的关系是**并存**而非取代：精确绑定答「是不是这组参数」（事后不可放宽，
   * 但只能整组接受或整组拒绝），本域答「这类参数可不可以写」——「可以改 status、不可以改 owner」
   * 只有当参数域存在时才表达得出来。
   *
   * 两域都**非空即上限**（空 = 未声明 = 不约束），与 `allowedRoles` 同一约定；越域一律拒，不做截断。
   * 声明来源是治理策略（与 `allowedRoles` 同处），**不是**工具的 `parameters`——后者是给 LLM 读的提示，
   * 不做授权判定，且完全不覆盖 destination。
   */
  async assertWithinDeclaredScope(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<void> {
    if (!this.governancePolicy) return;
    const policy = await this.governancePolicy.getToolPolicy(toolName);

    const allowedDestinations = policy.allowedDestinations;
    if (allowedDestinations.length > 0) {
      const destination = this.destinationOf(toolName);
      if (!allowedDestinations.includes(destination)) {
        this._refuse(
          userId,
          {
            name: 'destination_allowed',
            ok: false,
            note: `目的地 ${destination} 不在白名单 [${allowedDestinations.join(', ')}]`,
          },
          `Tool "${toolName}" is not allowed to write to destination "${destination}" (allowed: ${allowedDestinations.join(', ')})`,
        );
      }
    }

    const writableFields = policy.writableFields;
    if (writableFields.length > 0) {
      const outOfDomain = Object.keys(args ?? {}).filter((k) => !writableFields.includes(k));
      if (outOfDomain.length > 0) {
        this._refuse(
          userId,
          {
            name: 'field_domain',
            ok: false,
            note: `字段 ${outOfDomain.join(', ')} 不在可写域 [${writableFields.join(', ')}]`,
          },
          `Tool "${toolName}" received arguments outside its writable field domain: ${outOfDomain.join(', ')}`,
        );
      }
    }
  }

  /**
   * HS-9 确认规则：治理策略可覆盖工具定义的 requiresConfirmation。
   * HS-10：外部 MCP 工具由 ExternalToolProvider 判定（readOnly 免确认，非只读默认需确认，策略可覆盖）。
   * 未注入 GovernancePolicyService（单测/降级）时沿用工具定义默认。
   */
  async requiresConfirmation(name: string): Promise<boolean> {
    if (this.externalTools.isExternal(name)) {
      return this.externalTools.requiresConfirmation(name);
    }
    const fallback = this.toolRegistry.requiresConfirmation(name);
    if (!this.governancePolicy) return fallback;
    return this.governancePolicy.requiresConfirmation(name, fallback);
  }

  /**
   * §internal.15(4) R4 审批档判定：策略覆盖档位（mode=approval）或声明风险级 R4 都走双人审批。
   * 未注入 GovernancePolicyService（单测/降级）时回落声明风险级 R4。
   */
  async requiresApproval(name: string): Promise<boolean> {
    const riskLevel = await this.riskLevelFor(name);
    if (!this.governancePolicy) return riskLevel === 'R4';
    return this.governancePolicy.requiresApproval(name, riskLevel);
  }

  /**
   * 工具风险级（治理解析用）：**本地注册表为准；取不到时对外部工具容错**。
   *
   * 外部工具（`mcp_*`）只由 `ExternalToolProvider` 解析、**不在本地注册表**，而 `ToolRegistry.riskLevel`
   * 对未注册名**抛错**（`Tool "x" not found`）。此前 `requiresApproval` 与本文件各处解释器调用都裸调它，
   * 于是外部工具在对话里**无论读写都在 tool_start 前抛错**、以「执行失败」收尾（2026-09-17 实测：外部读工具
   * 连 `tool_start` 都发不出），「外部工具过同一治理层（含确认）」的文档承诺实际未生效。
   *
   * 外部工具按其**确认判定**派生档位（与 `resolveRiskLevel` 同口径：确认写→R3、读→R1），与预扫描
   * `?? 'R3'` 同精神。**未注册且非外部（LLM 幻觉名）仍抛**——不给幻觉名发确认卡，保持既有行为。
   */
  async riskLevelFor(toolName: string): Promise<ToolRiskLevel> {
    try {
      return this.toolRegistry.riskLevel(toolName);
    } catch (err) {
      if (this.externalTools.isExternal(toolName)) {
        return (await this.requiresConfirmation(toolName)) ? 'R3' : 'R1';
      }
      throw err;
    }
  }
}
