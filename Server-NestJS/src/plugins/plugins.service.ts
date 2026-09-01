// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { PluginContext, PluginManifest, PluginInstance } from './plugin.interface';

/**
 * PL-11 插件注册表与生命周期管理。
 *
 * 插件通过模块 providers 数组注册到宿主（plugins: [...]），由本服务统一：
 * - 校验依赖（requires 声明的宿主能力存在性）
 * - 按特性开关决定启用
 * - 注入 PluginContext（getService/registerRoute/isFeatureEnabled）
 * - 触发 onAppStart 钩子
 *
 * 动态启停（onFeatureChange）由 FeatureFlags 变化时调用 notifyFeatureChange。
 */
@Injectable()
export class PluginsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PluginsService.name);
  private readonly instances: PluginInstance[] = [];
  private readonly context: PluginContext;
  /** 插件注册的 HTTP 处理器：path -> handler（由宿主 controller 聚合暴露） */
  private readonly routes = new Map<string, (req: unknown) => Promise<unknown> | unknown>();

  constructor(
    private readonly featureFlags: FeatureFlagsService,
    private readonly serviceResolver: (name: string) => unknown | null,
    private readonly enabledPlugins: PluginManifest[],
  ) {
    this.context = {
      getService: <T = unknown>(name: string): T | null => this.serviceResolver(name) as T | null,
      isFeatureEnabled: (key) => this.featureFlags.isEnabled(key as never),
      registerRoute: (path, handler) => {
        if (this.routes.has(path)) {
          this.logger.warn(`[Plugins] route ${path} already registered, overwriting`);
        }
        this.routes.set(path, handler);
      },
    };
  }

  async onApplicationBootstrap() {
    for (const manifest of this.enabledPlugins) {
      await this.loadPlugin(manifest);
    }
    // 触发所有已启用插件的 onAppStart
    for (const inst of this.instances) {
      if (inst.manifest.hooks?.onAppStart) {
        try {
          await inst.manifest.hooks.onAppStart(inst.context);
        } catch (err) {
          this.logger.warn(`[Plugins] ${inst.manifest.name}.onAppStart failed: ${(err as Error).message}`);
        }
      }
    }
    this.logger.log(`[Plugins] loaded ${this.instances.length} plugins`);
  }

  private async loadPlugin(manifest: PluginManifest) {
    // 依赖校验：requires 声明的宿主能力需能解析
    if (manifest.requires) {
      const missing = manifest.requires.filter((s) => !this.serviceResolver(s));
      if (missing.length) {
        this.logger.warn(`[Plugins] ${manifest.name} missing deps: ${missing.join(', ')} — 跳过`);
        return;
      }
    }
    // 特性开关：featureFlag 且被关闭 → 不启用
    if (manifest.featureFlag && !this.featureFlags.isEnabled(manifest.featureFlag as never)) {
      this.logger.log(`[Plugins] ${manifest.name} disabled by feature flag ${manifest.featureFlag}`);
      return;
    }
    this.instances.push({ manifest, context: this.context });
    this.logger.log(`[Plugins] loaded ${manifest.name} v${manifest.version}`);
  }

  /** 特性开关变化时通知插件（由 FeatureFlags 变更方调用） */
  async notifyFeatureChange(feature: string, enabled: boolean) {
    for (const inst of this.instances) {
      if (inst.manifest.featureFlag === feature && inst.manifest.hooks?.onFeatureChange) {
        try {
          await inst.manifest.hooks.onFeatureChange(feature, enabled);
        } catch (err) {
          this.logger.warn(`[Plugins] ${inst.manifest.name}.onFeatureChange failed: ${(err as Error).message}`);
        }
      }
    }
  }

  listPlugins() {
    return this.instances.map((i) => ({
      name: i.manifest.name,
      version: i.manifest.version,
      description: i.manifest.description,
      capabilities: i.manifest.capabilities ?? [],
    }));
  }

  /** 插件注册的 HTTP 路由（供宿主 controller 统一暴露） */
  getRoutes(): Array<{ path: string; handler: (req: unknown) => Promise<unknown> | unknown }> {
    return Array.from(this.routes.entries()).map(([path, handler]) => ({ path, handler }));
  }
}
