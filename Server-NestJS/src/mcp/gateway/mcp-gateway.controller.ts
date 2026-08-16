import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { McpGatewayService } from './mcp-gateway.service';
import { CheckPolicies } from '../../common/casl/check-policies.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

class RegisterServerDto {
  name!: string;
  url!: string;
}

class CallExternalToolDto {
  serverName!: string;
  toolName!: string;
  arguments!: Record<string, unknown>;
}

/**
 * HS-10 MCP 入口管理端点（admin）：注册/移除外部 MCP server、发现工具、调用工具。
 * 调用强制过治理层（HS-9 权限/确认 + 审计）。
 */
@ApiTags('MCP Gateway')
@ApiBearerAuth()
@Controller({ path: 'admin/mcp', version: '1' })
export class McpGatewayController {
  constructor(private readonly gateway: McpGatewayService) {}

  @Get('servers')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '已注册的外部 MCP server 列表（admin）' })
  listServers() {
    return this.gateway.listServers();
  }

  @Post('servers')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '注册外部 MCP server（admin，写入 Settings）' })
  register(@Body() dto: RegisterServerDto) {
    return this.gateway.registerServer(dto.name, dto.url);
  }

  @Delete('servers/:name')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '移除外部 MCP server（admin）' })
  remove(@Param('name') name: string) {
    return this.gateway.removeServer(name);
  }

  @Get('tools')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '发现外部 MCP 工具（admin，缓存 30s；?force=true 强制刷新）' })
  discover(@Query('force') force?: string) {
    return this.gateway.discoverTools(force === 'true');
  }

  @Post('call')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '调用外部 MCP 工具（admin，强制过治理层：权限+确认+审计）' })
  async call(@CurrentUser() user: JwtPayload, @Body() dto: CallExternalToolDto) {
    return this.gateway.callTool(dto.serverName, dto.toolName, dto.arguments ?? {}, String(user.sub));
  }
}
