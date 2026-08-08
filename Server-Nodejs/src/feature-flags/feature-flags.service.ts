import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FEATURE_KEYS, FeatureKey } from './feature-flags.constants';

/**
 * 特性开关服务：按环境变量 `FEATURE_<KEY>_ENABLED` 判定功能开合。
 * 缺省值 true（默认全开，显式 false 才关闭），保证未配置时行为不变。
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(private readonly configService: ConfigService) {}

  isEnabled(key: FeatureKey): boolean {
    const envKey = `FEATURE_${key.toUpperCase()}_ENABLED`;
    return this.configService.get<boolean>(envKey, true);
  }

  getFlags(): Record<FeatureKey, boolean> {
    const flags = {} as Record<FeatureKey, boolean>;
    for (const key of Object.values(FEATURE_KEYS)) {
      flags[key] = this.isEnabled(key);
    }
    return flags;
  }
}
