import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  CallToolRequestSchema,
  InitializeResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AiService } from '../ai/ai.service';
import { AuditService } from '../ai/audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Raw } from '../common/decorators/raw.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

interface McpJsonRpc {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

const MCP_SERVER_INFO = { name: 'keelbase', version: '0.9.1' };
const MCP_PROTOCOL_VERSION = '2025-03-26';

/**
 * HS-10 MCP 出口（HTTP JSON-RPC 子集）：
 * - POST /api/v1/mcp，JWT 认证（JwtAuthGuard 全局默认）
 * - initialize / ping / tools/list / tools/call
 * - 工具执行走 AiService.executeToolForExternal（权限门控 → 确认规则 → 执行）
 * - 每次调用落 AI 审计（provider=mcp），写工具返回需确认不自动执行
 */
@ApiTags('MCP')
@ApiBearerAuth()
@Controller({ path: 'mcp', version: '1' })
export class McpExportController {
  private readonly logger = new Logger(McpExportController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  // @Raw()：MCP 协议要求原始 JSON-RPC 响应，跳过全局 ResponseInterceptor 包装
  @Raw()
  @ApiOperation({ summary: 'HS-10 MCP 出口：现有 AI 工具暴露为 MCP server（JSON-RPC）' })
  async handle(@CurrentUser() user: JwtPayload, @Body() body: McpJsonRpc): Promise<unknown> {
    const method = body.method ?? '';
    const id = body.id ?? null;
    try {
      switch (method) {
        case 'initialize':
          return this._result(id, InitializeResultSchema.parse({
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: MCP_SERVER_INFO,
          }));
        case 'notifications/initialized':
        case 'notifications/cancelled':
          return {}; // 通知无需响应
        case 'ping':
          return this._result(id, {});
        case 'tools/list':
          return this._result(id, ListToolsResultSchema.parse({
            tools: await this.aiService.listMcpTools(),
          }));
        case 'tools/call':
          return await this._callTool(user, id, body.params);
        default:
          return this._error(id, -32601, `Method not found: ${method}`);
      }
    } catch (e) {
      this.logger.warn(`[Mcp] ${method} failed: ${(e as Error).message}`);
      return this._error(id, -32603, (e as Error).message);
    }
  }

  private async _callTool(
    user: JwtPayload,
    id: number | string | null,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const parsed = CallToolRequestSchema.parse({
      method: 'tools/call',
      params,
    }) as { params?: { name?: string; arguments?: unknown } };
    const toolName = parsed.params?.name ?? '';
    const toolArgs = (parsed.params?.arguments ?? {}) as Record<string, unknown>;
    const userId = String(user.sub);

    const out = await this.aiService.executeToolForExternal(toolName, toolArgs, userId);

    // HS-10：MCP 调用落 AI 审计（provider=mcp 便于区分来源）
    await this.auditService.log({
      userId,
      action: 'tool_call',
      detail: `${toolName}(${JSON.stringify(toolArgs).slice(0, 500)})`,
      provider: 'mcp',
      isError: out.executed ? !out.result?.success : false,
      errorMessage: out.executed && !out.result?.success ? out.result?.error : undefined,
    });

    if (!out.executed) {
      return this._result(id, {
        content: [
          {
            type: 'text',
            text: `Tool "${toolName}" requires confirmation and was not executed.`,
          },
        ],
        isError: false,
      });
    }
    const text = JSON.stringify(out.result?.data ?? out.result?.error ?? {});
    return this._result(id, {
      content: [{ type: 'text', text }],
      isError: !out.result?.success,
    });
  }

  private _result(id: number | string | null, result: unknown): unknown {
    return { jsonrpc: '2.0', id, result };
  }

  private _error(id: number | string | null, code: number, message: string): unknown {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}
