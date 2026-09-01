// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Param, HttpCode, HttpStatus, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PluginsService } from './plugins.service';
import { CheckPolicies } from '../common/casl/check-policies.decorator';

/**
 * PL-11 插件宿主端点：插件列表（admin）+ 插件注册的路由统一暴露。
 * 插件路由 path 约定 /plugins/{name}/...，此处按精确 path 转发。
 */
@ApiTags('插件')
@ApiBearerAuth()
@Controller()
export class PluginsController {
  constructor(private readonly pluginsService: PluginsService) {}

  @Get('admin/plugins')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'PL-11 已加载插件列表（管理员）' })
  list() {
    return this.pluginsService.listPlugins();
  }

  /**
   * 插件注册路由的通用入口：/plugins/hello 等。
   * 由插件通过 context.registerRoute 注册，此处统一暴露为 POST（可扩展方法）。
   */
  @Post('plugins/:path')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PL-11 插件路由统一入口' })
  async invoke(@Param('path') path: string, @Body() body: unknown) {
    const route = this.pluginsService
      .getRoutes()
      .find((r) => r.path === `/plugins/${path}`);
    if (!route) {
      return { error: `插件路由 /plugins/${path} 不存在` };
    }
    return route.handler(body);
  }
}
