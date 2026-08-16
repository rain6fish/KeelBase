import { Injectable, Logger, Optional } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SettingsService } from '../../settings/settings.service';
import { GovernancePolicyService } from '../../ai/governance/governance-policy.service';
import { AuditService } from '../../ai/audit/audit.service';

export interface McpServerConfig {
  name: string;
  url: string;
}

export interface ExternalMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** readOnlyHint=true 视为只读；否则默认需确认（第三方工具安全默认） */
  readOnly: boolean;
}

export interface ExternalToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export interface ExternalToolOutcome {
  executed: boolean;
  requiresConfirmation: boolean;
  result?: ExternalToolCallResult;
  error?: string;
}

/** 连接器接口：真实实现走 SDK StreamableHTTPClientTransport，测试可注入 InMemoryTransport */
export type McpTransportFactory = (server: McpServerConfig) => Promise<{ transport: unknown; close: () => void }>;

const defaultTransportFactory: McpTransportFactory = async (server) => {
  const transport = new StreamableHTTPClientTransport(new URL(server.url));
  return { transport, close: () => transport.close() };
};

/**
 * HS-10 MCP 入口 gateway：注册外部 MCP server（Settings key=mcp_servers），
 * 发现其工具并调用，每次调用强制过治理层（HS-9 权限/确认 + 审计）。
 * 外部工具键：mcp_<server>_<tool>（写入 ai_governance_policy 可配置 enabled/requiresConfirmation/allowedRoles）。
 * 安全默认：readOnlyHint!=true 的工具要求确认；策略可覆盖。
 * Agent 对话集成（外部工具并入 LLM 工具流）为下一步，本版暴露 admin 端点。
 */
@Injectable()
export class McpGatewayService {
  static readonly SETTING_KEY = 'mcp_servers';
  private static readonly CACHE_TTL_MS = 30_000;
  private readonly logger = new Logger(McpGatewayService.name);
  private readonly cache = new Map<string, { tools: ExternalMcpTool[]; at: number }>();

  constructor(
    private readonly settings: SettingsService,
    private readonly governance: GovernancePolicyService,
    private readonly audit: AuditService,
    @Optional() private readonly transportFactory?: McpTransportFactory,
  ) {}

  async listServers(): Promise<McpServerConfig[]> {
    const raw = await this.settings.get(McpGatewayService.SETTING_KEY);
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
      return Array.isArray(parsed) ? (parsed as McpServerConfig[]) : [];
    } catch {
      return [];
    }
  }

  async registerServer(name: string, url: string): Promise<McpServerConfig[]> {
    const servers = await this.listServers();
    if (servers.some((s) => s.name === name)) {
      throw new Error(`MCP server "${name}" already registered`);
    }
    const next = [...servers, { name, url }];
    await this.settings.set(McpGatewayService.SETTING_KEY, JSON.stringify(next));
    return next;
  }

  async removeServer(name: string): Promise<McpServerConfig[]> {
    const next = (await this.listServers()).filter((s) => s.name !== name);
    await this.settings.set(McpGatewayService.SETTING_KEY, JSON.stringify(next));
    this.cache.delete(name);
    return next;
  }

  /** 发现所有已注册 server 的工具（每 server 缓存 30s；force 强制刷新）。 */
  async discoverTools(force = false): Promise<
    Array<{ server: string; tools: ExternalMcpTool[]; error?: string }>
  > {
    const servers = await this.listServers();
    const results: Array<{ server: string; tools: ExternalMcpTool[]; error?: string }> = [];
    for (const server of servers) {
      const cached = this.cache.get(server.name);
      if (cached && !force && Date.now() - cached.at < McpGatewayService.CACHE_TTL_MS) {
        results.push({ server: server.name, tools: cached.tools });
        continue;
      }
      try {
        const tools = await this._listTools(server);
        this.cache.set(server.name, { tools, at: Date.now() });
        results.push({ server: server.name, tools });
      } catch (e) {
        this.logger.warn(`[McpGateway] discover ${server.name} failed: ${(e as Error).message}`);
        results.push({ server: server.name, tools: [], error: (e as Error).message });
      }
    }
    return results;
  }

  /**
   * 调用外部 MCP 工具（强制过治理层）：
   * 1) HS-9 策略 enabled 检查（工具键 mcp_<server>_<tool>）
   * 2) 确认规则：readOnly 默认不确认；非只读默认需确认；策略可覆盖
   * 3) 审计（provider=mcp）
   * 4) 转发给外部 server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ExternalToolOutcome> {
    const extKey = `mcp_${serverName}_${toolName}`;
    const server = (await this.listServers()).find((s) => s.name === serverName);
    if (!server) {
      return { executed: false, requiresConfirmation: false, error: `MCP server "${serverName}" not registered` };
    }

    if (!(await this.governance.isToolEnabled(extKey))) {
      return { executed: false, requiresConfirmation: false, error: `Tool "${extKey}" is disabled by governance policy` };
    }

    const readOnly = (await this._findTool(server, toolName))?.readOnly ?? false;
    const defaultRequires = !readOnly;
    const requiresConfirmation = await this.governance.requiresConfirmation(extKey, defaultRequires);
    if (requiresConfirmation) {
      return { executed: false, requiresConfirmation: true };
    }

    await this.audit.log({
      userId,
      action: 'tool_call',
      detail: `mcp:${serverName}:${toolName}(${JSON.stringify(args).slice(0, 500)})`,
      provider: 'mcp',
    });

    try {
      const result = await this._callRemote(server, toolName, args);
      return { executed: true, requiresConfirmation: false, result };
    } catch (e) {
      return { executed: true, requiresConfirmation: false, error: (e as Error).message };
    }
  }

  private async _findTool(server: McpServerConfig, toolName: string): Promise<ExternalMcpTool | undefined> {
    const cached = this.cache.get(server.name);
    const tools = cached ? cached.tools : await this._listTools(server);
    return tools.find((t) => t.name === toolName);
  }

  private async _listTools(server: McpServerConfig): Promise<ExternalMcpTool[]> {
    const { transport, close } = await this._makeTransport(server);
    const client = new Client({ name: 'keelbase-gateway', version: '0.9.1' });
    try {
      await client.connect(transport as never);
      const { tools } = await client.listTools();
      return tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown> | undefined,
        readOnly: t.annotations?.readOnlyHint ?? false,
      }));
    } finally {
      await client.close().catch(() => undefined);
      close();
    }
  }

  private async _callRemote(
    server: McpServerConfig,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ExternalToolCallResult> {
    const { transport, close } = await this._makeTransport(server);
    const client = new Client({ name: 'keelbase-gateway', version: '0.9.1' });
    try {
      await client.connect(transport as never);
      const res = (await client.callTool({ name: toolName, arguments: args })) as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };
      const content = (res.content ?? []).map((c) => ({
        type: c.type,
        text: (c as { text?: string }).text,
      }));
      return { content, isError: res.isError ?? false };
    } finally {
      await client.close().catch(() => undefined);
      close();
    }
  }

  private async _makeTransport(server: McpServerConfig): Promise<{ transport: unknown; close: () => void }> {
    if (this.transportFactory) {
      return this.transportFactory(server);
    }
    return defaultTransportFactory(server);
  }
}
