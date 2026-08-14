import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FEATURE_KEYS,
  FeatureKey,
  AppPreset,
  PRESETS,
} from './feature-flags.constants';

/**
 * 特性开关服务：按环境变量 `FEATURE_<KEY>_ENABLED` 判定功能开合。
 * EASY-3：支持 `APP_PRESET`（full/small/lite）预设——预设关闭清单里的模块默认关，
 * 显式 env 优先于预设。缺省全开，保证未配置时行为不变。
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(private readonly configService: ConfigService) {}

  /** 当前预设（full/small/lite，默认 full） */
  getPreset(): AppPreset {
    const preset = this.configService.get<string>('APP_PRESET', 'full');
    return PRESETS[preset as AppPreset] ? (preset as AppPreset) : 'full';
  }

  isEnabled(key: FeatureKey): boolean {
    const envKey = `FEATURE_${key.toUpperCase()}_ENABLED`;
    // 显式 env 优先
    const explicit = this.configService.get<boolean | string>(envKey);
    if (explicit !== undefined && explicit !== '') {
      return explicit === true || explicit === 'true';
    }
    // 未显式配置：按预设关闭清单判定
    const preset = this.getPreset();
    const disabled = PRESETS[preset];
    return !disabled.includes(key);
  }

  getFlags(): Record<FeatureKey, boolean> {
    const flags = {} as Record<FeatureKey, boolean>;
    for (const key of Object.values(FEATURE_KEYS)) {
      flags[key] = this.isEnabled(key);
    }
    return flags;
  }
}
