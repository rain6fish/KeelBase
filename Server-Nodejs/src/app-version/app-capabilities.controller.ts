import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/guards/public.decorator';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { MODULES_MANIFEST } from '../common/modules/modules-manifest';

/**
 * MOD-4 capabilities 端点：返回当前预设 + 启用模块清单。
 * 三端（Flutter/Taro/管理台）按此隐藏未启用模块的导航入口。
 */
@ApiTags('能力清单')
@SkipThrottle()
@Controller({ path: 'app/capabilities', version: '1' })
export class AppCapabilitiesController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '当前预设 + 启用模块（前端据此隐藏导航）' })
  getCapabilities() {
    const flags = this.featureFlagsService.getFlags();
    // 业务模块：从 manifest 过滤，feature key 对应模块 id
    const businessModules = MODULES_MANIFEST.filter(
      (m) => m.category === 'business',
    )
      .filter((m) => flags[m.id as keyof typeof flags] !== false)
      .map((m) => ({ id: m.id, label: m.label }));

    return {
      preset: this.featureFlagsService.getPreset(),
      features: flags,
      businessModules,
    };
  }
}
