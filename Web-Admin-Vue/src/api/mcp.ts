import { api } from './client'

export interface McpServerConfig {
  name: string
  url: string
}

export interface ExternalMcpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  /** readOnlyHint=true 视为只读；否则默认需确认（第三方工具安全默认） */
  readOnly: boolean
  /** A2 风险声明：readOnly→R1(auto)，非只读→R3(confirmation) */
  riskLevel?: string
  riskStrategy?: string
}

export interface McpDiscoverResult {
  server: string
  tools: ExternalMcpTool[]
  error?: string
}

export interface McpCallOutcome {
  executed: boolean
  requiresConfirmation: boolean
  result?: { content: Array<{ type: string; text?: string }>; isError?: boolean }
  error?: string
}

export const mcpApi = {
  servers(): Promise<McpServerConfig[]> {
    return api.get<McpServerConfig[]>('/admin/mcp/servers')
  },
  register(name: string, url: string): Promise<McpServerConfig[]> {
    return api.post<McpServerConfig[]>('/admin/mcp/servers', { name, url })
  },
  remove(name: string): Promise<McpServerConfig[]> {
    return api.delete<McpServerConfig[]>(`/admin/mcp/servers/${encodeURIComponent(name)}`)
  },
  discover(force = false): Promise<McpDiscoverResult[]> {
    return api.get<McpDiscoverResult[]>('/admin/mcp/tools', force ? { force: 'true' } : undefined)
  },
  call(serverName: string, toolName: string, args: Record<string, unknown>): Promise<McpCallOutcome> {
    return api.post<McpCallOutcome>('/admin/mcp/call', { serverName, toolName, arguments: args })
  },
}
