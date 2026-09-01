// SPDX-License-Identifier: Apache-2.0

import {
  BadRequestException,
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FEATURE_KEYS,
  FeatureKey,
  AppPreset,
  PRESETS,
} from './feature-flags.constants';
import { SettingsService } from '../settings/settings.service';

/**
 * 特性开关服务：按环境变量 `FEATURE_<KEY>_ENABLED` 判定功能开合。
 * EASY-3：支持 `APP_PRESET`（full/small/lite）预设——预设关闭清单里的模块默认关，
 * 显式 env 优先于预设。缺省全开，保证未配置时行为不变。
 * EASY-5（v1.1 P0-6 首启引导）：支持运行时动态覆盖——`applyPreset` 把关闭清单写入
 * 内存 `overrides` + 持久化到 Settings（`feature_<key>`），重启后 `loadOverrides` 恢复。
 * 判定优先级：运行时覆盖（Settings） > 显式 env > 预设。
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagsService.name);

  /** 运行时动态覆盖（preset 应用后写入；持久化于 Settings，重启加载） */
  private readonly overrides = new Map<FeatureKey, boolean>();

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(SettingsService)
    private readonly settings?: SettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadOverrides();
  }

  /** 当前预设（full/small/lite，默认 full） */
  getPreset(): AppPreset {
    const preset = this.configService.get<string>('APP_PRESET', 'full');
    return PRESETS[preset as AppPreset] ? (preset as AppPreset) : 'full';
  }

  isEnabled(key: FeatureKey): boolean {
    // 1. 运行时覆盖（首启引导 preset / Settings 持久化）优先
    if (this.overrides.has(key)) return this.overrides.get(key)!;
    // 2. 显式 env 优先于预设
    const envKey = `FEATURE_${key.toUpperCase()}_ENABLED`;
    const explicit = this.configService.get<boolean | string>(envKey);
    if (explicit !== undefined && explicit !== '') {
      return explicit === true || explicit === 'true';
    }
    // 3. 未显式配置：按预设关闭清单判定
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

  /** 是否已做过首启 preset 选择（Settings 有记录则跳过弹窗） */
  async isPresetSelected(): Promise<boolean> {
    const selected = await this.settings?.get('feature_flags_selected');
    return selected !== undefined && selected !== null && selected !== '';
  }

  /**
   * EASY-5 应用预设：按关闭清单计算每个 feature 开关 → 内存覆盖 + 持久化 Settings。
   * 返回应用后的全量 flags（供前端确认）。
   */
  async applyPreset(preset: string): Promise<Record<FeatureKey, boolean>> {
    const valid = PRESETS[preset as AppPreset];
    if (!valid) throw new BadRequestException(`preset 非法：${preset}（可选 full/small/lite）`);
    const disabled = PRESETS[preset as AppPreset];
    for (const key of Object.values(FEATURE_KEYS)) {
      const enabled = !disabled.includes(key);
      this.overrides.set(key, enabled);
      await this.settings?.set(`feature_${key}`, enabled, 'boolean');
    }
    await this.settings?.set('feature_flags_selected', preset, 'string');
    this.logger.log(`preset applied: ${preset}（${disabled.length} 个模块关闭）`);
    return this.getFlags();
  }

  /** 启动时从 Settings 加载持久化覆盖（重启后首启选择的 preset 仍生效） */
  private async loadOverrides(): Promise<void> {
    if (!this.settings) return;
    try {
      const all = await this.settings.findAll();
      for (const s of all) {
        if (!s.key.startsWith('feature_') || s.key === 'feature_flags_selected') continue;
        // Settings 键为 feature_<KEY>（KEY 大写）；FEATURE_KEYS 键大写、值小写——映射回值作 override 键
        const flagKey = s.key.slice('feature_'.length).toUpperCase() as keyof typeof FEATURE_KEYS;
        if (Object.prototype.hasOwnProperty.call(FEATURE_KEYS, flagKey)) {
          this.overrides.set(FEATURE_KEYS[flagKey], s.value === 'true');
        }
      }
      if (this.overrides.size > 0) {
        this.logger.log(`loaded ${this.overrides.size} feature overrides from Settings`);
      }
    } catch (e) {
      this.logger.warn(`loadOverrides failed: ${(e as Error).message}`);
    }
  }
}
