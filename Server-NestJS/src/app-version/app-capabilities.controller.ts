import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/guards/public.decorator';
import { CapabilitiesService } from './capabilities.service';

/**
 * MOD-4 capabilities 端点：返回当前预设 + 启用模块清单。
 * 三端（Flutter/Taro/管理台）按此隐藏未启用模块的导航入口。
 * 过滤逻辑在 CapabilitiesService（与 System AI Assistant 共享单一事实源）。
 */
@ApiTags('能力清单')
@SkipThrottle()
@Controller({ path: 'app/capabilities', version: '1' })
export class AppCapabilitiesController {
  constructor(private readonly capabilitiesService: CapabilitiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '当前预设 + 启用模块（前端据此隐藏导航）' })
  getCapabilities() {
    return this.capabilitiesService.getCapabilities();
  }
}
