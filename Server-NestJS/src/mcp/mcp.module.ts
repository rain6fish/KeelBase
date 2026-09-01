// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SettingsModule } from '../settings/settings.module';
import { McpExportController } from './mcp.controller';
import { McpGatewayService } from './gateway/mcp-gateway.service';
import { McpGatewayController } from './gateway/mcp-gateway.controller';

/**
 * HS-10 MCP 适配层：
 * - 出口：现有 AI 工具暴露为 MCP server（HTTP JSON-RPC 子集），工具以调用者身份过治理层。
 * - 入口：McpGatewayService 注册外部 MCP server（Settings）、发现/调用其工具并强制过治理层。
 * 完整 Streamable HTTP 会话/SSE 与 Agent 对话集成后续迭代。
 */
@Module({
  imports: [AiModule, SettingsModule],
  controllers: [McpExportController, McpGatewayController],
  providers: [McpGatewayService],
  exports: [McpGatewayService],
})
export class McpModule {}
