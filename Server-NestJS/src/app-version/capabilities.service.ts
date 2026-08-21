import { Injectable } from '@nestjs/common';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { MODULES_MANIFEST } from '../common/modules/modules-manifest';

/**
 * 能力清单单一事实源：前端导航（/app/capabilities）与 System AI Assistant
 * 系统上下文共用同一份模块过滤逻辑，保证 AI 看到的模块集 = 前端真实可用模块集。
 */
@Injectable()
export class CapabilitiesService {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  getCapabilities() {
    const flags = this.featureFlagsService.getFlags();
    // 业务模块：从 manifest 过滤，feature key 对应模块 id
    const businessModules = MODULES_MANIFEST.filter(
      (m) => m.category === 'business',
    )
      .filter((m) => flags[m.id as keyof typeof flags] !== false)
      .map((m) => ({ id: m.id, label: m.label, description: m.description }));

    return {
      preset: this.featureFlagsService.getPreset(),
      features: flags,
      businessModules,
    };
  }
}
