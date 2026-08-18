# KeelBase 插件开发指南 / Plugin Development Guide

> KeelBase 插件机制（PL-11 / P1-7）让第三方以**编译期声明式清单**扩展宿主能力：注册 HTTP 端点、响应生命周期钩子、按名称访问宿主服务——不引入动态模块加载，装配类变更需重启生效（与 MOD 方案约束一致）。
>
> KeelBase's plugin mechanism (PL-11 / P1-7) lets third parties extend the host with **compile-time declarative manifests**: register HTTP routes, react to lifecycle hooks, access host services by name — no dynamic module loading; assembly changes require a restart.

---

## 1. 机制概览 / How it works

- 插件 = 一个 `PluginManifest` 常量（`src/plugins/plugin.interface.ts`）
- 编译期随宿主一起注册（同 Nest 模块），由 `PluginsService` 统一管理启用状态与生命周期
- 启用/停用走 FeatureFlags（RG-2），装配类变更需重启

```
PluginManifest
  ├─ name / version / description
  ├─ capabilities   → 声明能力（三端可展示）
  ├─ requires       → 依赖的宿主服务名（校验用）
  ├─ featureFlag    → 归属特性开关 key
  └─ hooks          → onAppStart / onFeatureChange
        └─ ctx      → PluginContext（getService / isFeatureEnabled / registerRoute）
```

---

## 2. 写一个插件 / Write a plugin

在 `Server-NestJS/src/plugins/plugins/` 下新建 `<name>.plugin.ts`：

```ts
import { PluginManifest } from '../plugin.interface';

export const GITHUB_PLUGIN: PluginManifest = {
  name: 'github-plugin',
  version: '1.0.0',
  description: '示例插件：注册一个端点并访问宿主服务',
  capabilities: ['plugin.github'],
  requires: ['UsersService'],
  hooks: {
    onAppStart: (ctx) => {
      // 1) 注册 HTTP 端点（POST /api/v1/plugins/<path> 统一入口）
      ctx.registerRoute('/plugins/github', (req) => {
        const users = ctx.getService('UsersService'); // 访问宿主服务（未找到返回 null）
        return {
          ok: true,
          aiEnabled: ctx.isFeatureEnabled('ai'),
          usersAvailable: !!users,
        };
      });
    },
    // onFeatureChange: (feature, enabled) => { ... }  // 特性启停回调
  },
};
```

### PluginContext 能力 / Capabilities

| 方法 | 说明 |
|------|------|
| `getService<T>(name): T \| null` | 按类名取宿主服务（如 `UsersService` / `AiService`） |
| `isFeatureEnabled(key): boolean` | 特性开关状态（对接 FeatureFlags） |
| `registerRoute(path, handler)` | 注册插件 HTTP 端点，经 `POST /api/v1/plugins/:path` 访问 |

---

## 3. 接线 / Wire in

1. **注册**：在 `src/plugins/plugins.module.ts` 把 manifest 加入 `PLUGINS` 数组并 import：

```ts
import { GITHUB_PLUGIN } from './plugins/github.plugin';
const PLUGINS = [HELLO_PLUGIN, GITHUB_PLUGIN];
```

2. **CLI（推荐）**：`node scripts/keelbase-plugin.mjs add <source.ts>` 自动复制插件 TS 并接线；`remove <name>` 移除；`list` 查看。

3. **启停**：插件 `featureFlag` 与 FeatureFlags 关联，`APP_PRESET` / `FEATURE_<KEY>_ENABLED` 控制。

---

## 4. 约束 / Constraints

- **编译期注册**：插件与宿主同编译，无运行时动态加载
- **装配变更需重启**：增删插件后需重启后端
- **能力即契约**：`capabilities` 供三端（Flutter/Taro/管理台）展示与权限判断
- **依赖校验**：`requires` 列出的宿主服务不存在时 PluginsService 校验告警

---

## 5. 测试 / Testing

- 插件单测：`src/plugins/plugins.service.spec.ts` 覆盖 manifest 加载、路由注册、生命周期
- 端点集成：`POST /api/v1/plugins/:path`（见 `plugins.controller.ts`）
- 参考：`src/plugins/plugins/hello.plugin.ts`（最小示例）+ `plugins.module.spec.ts`（引导测试）
