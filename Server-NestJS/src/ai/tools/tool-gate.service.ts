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
import { AiTool, AuthorizationDeniedError, ToolRiskLevel } from '../interfaces/tool.interface';
import { BusinessException } from '../../common/errors/business.exception';
import { UserRole } from '../../common/entities/user.entity';

@Injectable()
export class ToolGateService {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly externalTools: ExternalToolRegistry,
    @Optional() private readonly governancePolicy?: GovernancePolicyService,
    @Optional() private readonly featureFlagsService?: FeatureFlagsService,
    @Optional() private readonly usersService?: UsersService,
  ) {}

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
      throw new AuthorizationDeniedError(
        `Tool "${toolName}" is blocked (risk level R5)`,
        [{ name: 'risk_policy', ok: false, note: `风险级 R5（不可逆/外部动作）→ 阻断` }],
      );
    }

    // HS-9 治理策略：工具开关 + 角色白名单
    if (this.governancePolicy) {
      const enabled = await this.governancePolicy.isToolEnabled(toolName);
      if (!enabled) {
        throw new AuthorizationDeniedError(
          `Tool "${toolName}" is disabled by governance policy`,
          [{ name: 'tool_enabled', ok: false, note: '治理策略禁用此工具' }],
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
          throw new AuthorizationDeniedError(
            `Tool "${toolName}" is restricted to roles: ${allowedRoles.join(', ')}`,
            [
              {
                name: 'role_allowed',
                ok: false,
                note: `需要角色 [${allowedRoles.join(', ')}]${user ? `，当前 ${user.role ?? '无角色'}` : ''}`,
              },
            ],
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
      throw new AuthorizationDeniedError(
        `Tool "${toolName}" is disabled (feature flag "${perms.featureFlag}" off)`,
        [{ name: 'feature_flag', ok: false, note: `特性开关 ${perms.featureFlag} 关闭` }],
      );
    }

    // System AI Assistant：adminOnly 工具仅管理员（或系统账号 '0'——eval/兼容）可调用。
    // 管理端助手已改为真实管理员身份，故按角色放行（与角色白名单一致实时查库）。
    if (perms.adminOnly && userId !== '0') {
      const user = this.usersService
        ? await this.usersService.findOne(Number(userId))
        : null;
      if (!user || user.role !== UserRole.ADMIN) {
        throw new AuthorizationDeniedError(
          `Tool "${toolName}" is admin-only`,
          [{ name: 'admin_only', ok: false, note: '仅管理员/系统账号可用' }],
        );
      }
    }

    // headless 系统账号（userId '0'）：由 headless 层 API Key 鉴权，不重复拦截
    if (userId === '0') return;

    if (perms.requireVerifiedEmail && this.usersService) {
      const user = await this.usersService.findOne(Number(userId));
      // 与 EmailVerificationGuard 一致：admin 视为已验证（headless '0' 已在上面返回）
      if (user && user.role !== UserRole.ADMIN && !user.emailVerified) {
        throw new BusinessException('EMAIL_NOT_VERIFIED');
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
