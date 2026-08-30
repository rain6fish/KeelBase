import { Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { PluginsService } from './plugins.service';
import { PluginsController } from './plugins.controller';
import { HELLO_PLUGIN } from './plugins/hello.plugin';
import { GITHUB_PLUGIN } from './plugins/github.plugin';
import { FEISHU_PLUGIN } from './plugins/feishu.plugin';
import { WECOM_PLUGIN } from './plugins/wecom.plugin';

/**
 * PL-11 插件模块。
 * 启用插件清单在此声明（编译期注册）。新增插件：import manifest 并加入 PLUGINS 数组。
 * 官方首批插件：github / feishu / wecom（见 docs/manual/plugin-registry.md）。
 */
const PLUGINS = [HELLO_PLUGIN, GITHUB_PLUGIN, FEISHU_PLUGIN, WECOM_PLUGIN];

@Module({
  imports: [FeatureFlagsModule],
  controllers: [PluginsController],
  providers: [
    {
      provide: PluginsService,
      useFactory: (moduleRef: ModuleRef, featureFlags: any) => {
        // serviceResolver 从 Nest DI 容器按 token 名解析宿主服务
        const resolver = (name: string): unknown | null => {
          try {
            // 宿主服务名即类名（如 UsersService）；插件依赖按此解析
            // 实际可改为显式白名单映射，避免任意解析
            return moduleRef.get(name as never, { strict: false });
          } catch {
            return null;
          }
        };
        return new PluginsService(featureFlags, resolver, PLUGINS);
      },
      inject: [ModuleRef, FeatureFlagsService],
    },
  ],
  exports: [PluginsService],
})
export class PluginsModule implements OnModuleInit {
  constructor(private readonly pluginsService: PluginsService) {}

  onModuleInit() {
    // PluginsService 的 onApplicationBootstrap 会触发插件加载与钩子
  }
}
