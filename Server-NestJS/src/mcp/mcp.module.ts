import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { McpExportController } from './mcp.controller';

/**
 * HS-10 MCP 出口：现有 AI 工具暴露为 MCP server（HTTP JSON-RPC 子集：
 * initialize / ping / tools/list / tools/call），JWT 认证，工具以调用者身份
 * 执行并过同一治理层（权限 + 确认 + 审计）。完整 Streamable HTTP 会话/SSE 后续迭代。
 */
@Module({
  imports: [AiModule],
  controllers: [McpExportController],
})
export class McpModule {}
