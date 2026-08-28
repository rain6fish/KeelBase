/**
 * B 路径 ProxyTool 注册（AI Bridge §4）：从 Settings `ai_proxy_tools` 动态创建
 * ProxyTool 实例并注册到 ToolRegistry。配置变更后重启/重载即生效（fire-and-forget 于
 * ai.module useFactory 启动时加载；无运行时热更新——MVP）。
 *
 * 配置形态：
 * {
 *   "baseUrl": "http://localhost:4000/api",
 *   "audience": "legacy-erp",
 *   "tools": [{ "name", "description", "method", "path", "parameters", "riskLevel" }]
 * }
 */
import { SettingsService, SETTING_KEYS } from '../../settings/settings.service';
import { DelegationTokenService } from '../../auth/delegation-token.service';
import { ToolRegistry } from '../tools/tool-registry';
import { ProxyTool, ProxyToolConfig } from './proxy-tool';

export interface ProxyToolsConfig {
  baseUrl?: string;
  audience?: string;
  tools?: ProxyToolConfig[];
}

export class ProxyToolRegistryService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly delegationService: DelegationTokenService,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  /** 读 Settings 配置 → 动态注册 ProxyTool；幂等（已注册名跳过）。返回注册/跳过清单。 */
  async loadAndRegister(): Promise<{ registered: string[]; skipped: string[] }> {
    const raw = await this.settingsService.getWithDefault(SETTING_KEYS.PROXY_TOOLS, null);
    const registered: string[] = [];
    const skipped: string[] = [];
    if (!raw) return { registered, skipped };

    let cfg: ProxyToolsConfig;
    try {
      cfg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return { registered, skipped };
    }
    const { baseUrl, audience, tools = [] } = cfg ?? {};
    if (!baseUrl || !audience || !Array.isArray(tools)) return { registered, skipped };
    if (!isValidHttpUrl(baseUrl)) {
      skipped.push(`<all>(baseUrl "${baseUrl}" 不是合法的 http(s) URL，跳过全部代理工具注册)`);
      return { registered, skipped };
    }

    for (const t of tools) {
      if (!t?.name) continue;
      if (this.toolExists(t.name)) {
        skipped.push(t.name);
        continue;
      }
      try {
        this.toolRegistry.register(
          new ProxyTool(t, this.delegationService, baseUrl, audience),
        );
        registered.push(t.name);
      } catch (err) {
        skipped.push(`${t.name}(${(err as Error).message})`);
      }
    }
    return { registered, skipped };
  }

  private toolExists(name: string): boolean {
    try {
      this.toolRegistry.getTool(name);
      return true;
    } catch {
      return false;
    }
  }
}

/** SSRF 防护（M0）：baseUrl 必须为 http/https URL */
function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
