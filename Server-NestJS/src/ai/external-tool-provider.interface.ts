/**
 * HS-10 Agent 对话集成：外部工具提供者接口。
 * AiService 不直接依赖 McpGatewayService（避免 AiModule↔McpModule 循环依赖），
 * 而是由 McpModule 在启动时通过 AiService.registerExternalToolProvider() 注入。
 * 外部工具名统一 `mcp_<server>_<tool>`，由实现方解析。
 */
export interface ExternalToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ExternalToolCall {
  executed: boolean;
  requiresConfirmation?: boolean;
  /** 成功时的纯文本结果（由实现方把 MCP content 拼成文本） */
  content?: string;
  error?: string;
}

export interface ExternalToolProvider {
  /** 列出外部工具（OpenAI 格式参数），供 LLM 工具流合并 */
  listExternalTools(): Promise<ExternalToolDef[]>;
  isExternal(name: string): boolean;
  requiresConfirmation(name: string): Promise<boolean>;
  callTool(name: string, args: Record<string, unknown>, userId: string): Promise<ExternalToolCall>;
}
