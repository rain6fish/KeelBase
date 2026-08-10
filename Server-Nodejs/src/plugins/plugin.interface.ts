/**
 * PL-11 插件机制：插件清单 + 生命周期钩子 + 能力注入。
 *
 * 轻量方案（不引入动态模块加载）：插件在编译期随宿主一起注册（同 Nest 模块），
 * 通过 PluginsService 统一管理启用状态与生命周期。启停走 FeatureFlags/RG-2，
 * 装配类变更需重启（同 MOD 方案约束）。
 */

/** 插件能力注入：给插件访问宿主服务的能力 */
export interface PluginContext {
  /** 按名称获取宿主服务（如 UsersService / AiService），未找到返回 null */
  getService<T = unknown>(name: string): T | null;
  /** 启用状态检查（对接 FeatureFlags） */
  isFeatureEnabled(key: string): boolean;
  /** 注册一个 HTTP 处理器（插件提供的 REST 端点） */
  registerRoute: (path: string, handler: (req: unknown) => Promise<unknown> | unknown) => void;
}

/** 插件生命周期钩子 */
export interface PluginHooks {
  /** 应用启动完成后调用（数据库就绪后） */
  onAppStart?: (ctx: PluginContext) => Promise<void> | void;
  /** 特性启用/停用回调 */
  onFeatureChange?: (feature: string, enabled: boolean) => Promise<void> | void;
}

/** 插件清单 */
export interface PluginManifest {
  /** 插件名（唯一） */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description: string;
  /** 依赖的宿主能力（服务名列表，供 PluginsService 校验） */
  requires?: string[];
  /** 归属的特性开关 key（空则不参与开关） */
  featureFlag?: string;
  /** 生命周期钩子 */
  hooks?: PluginHooks;
  /** 插件声明的能力标识（供三端 capabilities 展示） */
  capabilities?: string[];
}

/** 插件实例 = manifest + context（由 PluginsService 装配后注入） */
export interface PluginInstance {
  manifest: PluginManifest;
  context: PluginContext;
}
