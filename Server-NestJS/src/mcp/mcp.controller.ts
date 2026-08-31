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

/** listMcpTools() 返回的治理契约字段（A2 风险分级 + 确认策略） */
interface McpToolGovernance {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  riskLevel: string;
  riskStrategy: string;
  requiresConfirmation: boolean;
}

const MCP_SERVER_INFO = { name: 'keelbase', version: '0.9.1' };
const MCP_PROTOCOL_VERSION = '2025-03-26';

const READ_ONLY_RISKS = ['R0', 'R1', 'R2'];

/**
 * 护城河 2.1「MCP 工具声明治理扩展」（ai-governance-protocol §4.4）：
 * MCP SDK 的 ToolSchema 无 passthrough，顶层 riskLevel 等自定义字段会被 Zod 剥掉；
 * 治理契约经 MCP 标准字段透出——
 *   - `annotations.readOnlyHint / destructiveHint`：MCP 标准提示（粗粒度）
 *   - `_meta.keelbase`：规范扩展槽（z.record 保留），携带权威的 R0-R5 契约
 */
function toMcpTool(tool: McpToolGovernance) {
  const readOnly = READ_ONLY_RISKS.includes(tool.riskLevel);
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: tool.riskLevel === 'R5',
    },
    _meta: {
      keelbase: {
        riskLevel: tool.riskLevel,
        riskStrategy: tool.riskStrategy,
        requiresConfirmation: tool.requiresConfirmation,
      },
    },
  };
}

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
            tools: (await this.aiService.listMcpTools()).map(toMcpTool),
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

    // HS-10：MCP 调用落 AI 审计（provider=mcp 便于区分来源；username 快照 D2-1c——非 actor 路径，显式带出）
    await this.auditService.log({
      userId,
      username: user.username,
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
