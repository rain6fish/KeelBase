// SPDX-License-Identifier: Apache-2.0

/**
 * 工具对外面（从 `AiService` 拆出的第五个领域，健康清单 §3 阶段 3「主战场」）。
 *
 * 回答的是：**系统外部看得到什么、能用什么**——
 * - 目录：`getToolInventory`（管理台工具清单）/ `getToolFingerprint`（公开 provenance 指纹）/
 *   `listMcpTools`（MCP 客户端可见的工具与治理契约）/ `buildToolDefs`（喂给 LLM 的内置+外部工具定义）
 * - 出口：`executeToolForExternal`（MCP 出口执行，过同一治理层）/ `getProxyIntegrationStatus`（B 路径集成诊断）
 * - 接缝：`registerExternalToolProvider`（网关注册自身）
 *
 * 拆它的理由：这些方法**都在服务外部世界**（HTTP 控制器、MCP 客户端、公开端点），
 * 与「对话内部怎么跑」是两回事；且 `executeToolForExternal` 复用同一套门控与注册表，
 * 是「对外出口 ≠ 另开一条执行路径」的落地处。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { Injectable, Optional } from '@nestjs/common';
import { ToolRegistry } from './tool-registry';
import { ToolGateService } from './tool-gate.service';
import { ExternalToolRegistry } from './external-tool-registry';
import { ToolDefinition, ToolResult, RISK_STRATEGY, resolveRevokeClass } from '../interfaces/tool.interface';
import { ExternalToolProvider, ExternalToolDef } from '../external-tool-provider.interface';
import { GovernancePolicyService, effectiveGateMode } from '../governance/governance-policy.service';
import { SettingsService, SETTING_KEYS } from '../../settings/settings.service';

@Injectable()
export class ToolExposureService {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly toolGate: ToolGateService,
    private readonly externalTools: ExternalToolRegistry,
    @Optional() private readonly governancePolicy?: GovernancePolicyService,
    @Optional() private readonly settingsService?: SettingsService,
  ) {}

  /**
   * HS-10：注入外部工具提供者（McpGatewayService 实现；启动时调用）。
   * 状态本身在共享的 `ExternalToolRegistry` 里（执行/门控/清单面共用），此处是唯一注册入口。
   */
  registerExternalToolProvider(provider: ExternalToolProvider): void {
    this.externalTools.register(provider);
  }

  /**
   * HS-10：内置 + 外部工具定义合并（供 LLM 工具流）。外部工具发现失败静默降级为内置。
   */
  async buildToolDefs(): Promise<ToolDefinition[]> {
    const builtin = this.toolRegistry.getToolDefinitions();
    if (!this.externalTools.current) return builtin;
    try {
      const external: ExternalToolDef[] = await this.externalTools.current.listExternalTools();
      if (external.length === 0) return builtin;
      return [
        ...builtin,
        ...external.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      ];
    } catch {
      return builtin;
    }
  }

  /**
   * HS-10 MCP 出口：现有工具暴露为 MCP 工具（尊重治理策略 enabled 开关）。
   */
  async listMcpTools(): Promise<
    Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      /** A2 Secure MCP Gateway：工具风险分级（R0-R5）与确认策略声明，客户端可见治理契约 */
      riskLevel: string;
      riskStrategy: string;
      requiresConfirmation: boolean;
    }>
  > {
    const defs = this.toolRegistry.getToolDefinitions();
    const tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      riskLevel: string;
      riskStrategy: string;
      requiresConfirmation: boolean;
    }> = [];
    for (const d of defs) {
      const name = d.function.name;
      if (this.governancePolicy && !(await this.governancePolicy.isToolEnabled(name))) {
        continue;
      }
      const riskLevel = this.toolRegistry.riskLevel(name);
      tools.push({
        name,
        description: d.function.description,
        inputSchema: d.function.parameters as Record<string, unknown>,
        riskLevel,
        riskStrategy: RISK_STRATEGY[riskLevel],
        requiresConfirmation: this.toolRegistry.requiresConfirmation(name),
      });
    }
    return tools;
  }

  /**
   * HS-10 MCP 出口执行入口：过同一治理层（权限门控 → 确认规则 → 执行）。
   * - 读工具：直接执行（权限通过后）
   * - 写工具（requiresConfirmation）：不自动执行，返回需确认信号，由调用方处理
   */
  async executeToolForExternal(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<{ executed: boolean; requiresConfirmation: boolean; result?: ToolResult }> {
    await this.toolGate.assertToolAllowed(toolName, userId);
    if (await this.toolGate.requiresConfirmation(toolName)) {
      return { executed: false, requiresConfirmation: true };
    }
    return {
      executed: true,
      requiresConfirmation: false,
      result: await this.toolRegistry.execute(toolName, args, userId),
    };
  }

  /**
   * Runtime provenance 工具指纹（§13.1 后置项①，公开命名 provenance）：
   * 只暴露「多少个工具 / 读写分类 / 风险级分布」的汇总指纹，不含参数/权限详情（admin 专属）。
   * 供 GET /app/provenance（公开）回答「这个 AI 系统有哪些能力」。
   */
  getToolFingerprint(): { total: number; read: number; write: number; byRisk: Record<string, number> } {
    const tools = this.toolRegistry.getAllTools();
    const byRisk: Record<string, number> = {};
    let write = 0;
    for (const t of tools) {
      const lv = this.toolRegistry.riskLevel(t.name);
      byRisk[lv] = (byRisk[lv] ?? 0) + 1;
      if (t.requiresConfirmation) write++;
    }
    return { total: tools.length, read: tools.length - write, write, byRisk };
  }

  /**
   * HS-2 + HS-9 工具清单（管理台可见）：名称/描述/参数/权限/是否需确认。
   * 供 GET /ai/tools（admin）展示工具与权限，便于审计与治理。
   * HS-9：反映治理策略实际生效的开关/确认规则。
   */
  async getToolInventory() {
    const policy = this.governancePolicy
      ? await this.governancePolicy.getPolicy()
      : null;
    const tools = policy?.tools ?? {};
    return this.toolRegistry.getAllTools().map((tool) => {
      const override = tools[tool.name] ?? {};
      const riskLevel = this.toolRegistry.riskLevel(tool.name);
      // §internal.15(4)：生效门控档位（策略 mode > legacy 布尔 > 声明风险级）；R5 恒 'blocked'
      const mode = effectiveGateMode(override, riskLevel);
      return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          required: p.required,
        })),
        enabled: override.enabled ?? true,
        requiresConfirmation: mode === 'confirm' || mode === 'approval',
        requiresApproval: mode === 'approval',
        gateMode: mode,
        allowedRoles: override.allowedRoles ?? [],
        permissions: tool.permissions ?? null,
        riskLevel,
        riskStrategy: RISK_STRATEGY[riskLevel],
        // KB-6：撤销能力档位（none / local_compensate / governed_external / transactional）——工具治理面可见分档
        revokeClass: resolveRevokeClass(tool),
      };
    });
  }

  /**
   * B-proxy 外部系统（Java 集成）接入诊断：读 Settings ai_proxy_tools 的 baseUrl，
   * 拉取 Java example 的 /keelbase/status 健康度面板，供管理台监控中心聚合显示。
   * 未配置 → { configured:false }；非 Java 源（OpenAPI 代理等无 status 端点）→ statusEnabled:false。
   * Secret 不外泄（面板本就只给布尔/状态）。baseUrl 限定 http(s)，防 SSRF。
   */
  async getProxyIntegrationStatus(): Promise<Record<string, unknown>> {
    const raw = this.settingsService
      ? await this.settingsService.getWithDefault(SETTING_KEYS.PROXY_TOOLS, null)
      : null;
    if (!raw) return { configured: false };
    let cfg: Record<string, unknown>;
    try {
      cfg = typeof raw === 'string' ? JSON.parse(raw) : (raw as object);
    } catch {
      return { configured: false };
    }
    const baseUrl = String(cfg?.baseUrl ?? '');
    const audience = String(cfg?.audience ?? '');
    const configuredTools = Array.isArray(cfg?.tools) ? (cfg.tools as unknown[]).length : 0;
    if (!/^https?:\/\//i.test(baseUrl)) {
      return { configured: true, error: 'baseUrl 非法（仅 http(s)）', reachable: false };
    }
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/keelbase/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        return {
          configured: true, baseUrl, audience, configuredTools,
          reachable: true, statusEnabled: false, error: `HTTP ${res.status}`,
        };
      }
      const status = await res.json().catch(() => ({}));
      return {
        configured: true, baseUrl, audience, configuredTools,
        reachable: true, statusEnabled: true, fetchedAt: new Date().toISOString(),
        ...(status as object),
      };
    } catch (err) {
      return {
        configured: true, baseUrl, audience, configuredTools,
        reachable: false, error: (err as Error).message,
      };
    }
  }
}
