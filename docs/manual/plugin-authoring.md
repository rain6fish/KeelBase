# KeelBase 插件作者指南（Plugin Authoring）

> 2026-08-18（Phase 2 生态：Extension API 作者化）。给第三方开发者：写一个**自包含**的 KeelBase 插件，用 `keelbase-plugin` CLI 校验并接入宿主。

## 1. 插件是什么

KeelBase 插件是**编译期注册**的源码级扩展（`Server-NestJS/src/plugins/`）：导出 `PluginManifest`，随宿主编译，由 `PluginsService` 统一加载（依赖校验 / 特性开关 / 生命周期钩子 / HTTP 路由）。

一个插件能拿到宿主注入的 `PluginContext`：

| API | 能力 |
|---|---|
| `ctx.getService<T>(name)` | 按宿主服务类名获取服务（如 `UsersService`），未找到返回 null |
| `ctx.isFeatureEnabled(key)` | 特性开关状态（对接 FeatureFlags）|
| `ctx.registerRoute(path, handler)` | 注册 HTTP 端点（`POST /api/v1/plugins/<path>` 统一入口）|
| `hooks.onAppStart(ctx)` | 应用启动后回调 |
| `hooks.onFeatureChange(feature, enabled)` | 特性启用/停用回调 |

## 2. 自包含模式（推荐给第三方作者）

宿主内插件（如 `hello.plugin.ts`）会 `import { PluginManifest } from '../plugin.interface'`（宿主相对导入）——**宿主内合法，但不可移植**。第三方插件应**自包含**：

- **不 import 宿主相对路径**（`../plugin.interface` 等）；
- **`PluginManifest` 注解可省略**——`export const X_PLUGIN = { ... }` 即可（类型注解只是编译期提示，运行时 manifest 是普通对象）；
- 只用 `PluginContext` 的公开 API + 宿主服务的公开方法。

> `keelbase-plugin verify` 会检测宿主相对导入并给出可移植性警告（不阻断——宿主内插件合法）。

## 3. 作者化流程

```bash
# 1. 写插件源文件（见 §4 模板）
my-plugin.ts

# 2. 宿主外校验（约定/结构/requires 对照宿主服务/featureFlag 对照 FEATURE_KEYS）
node scripts/keelbase-plugin.mjs verify my-plugin.ts
#   ✓ 插件 MY_PLUGIN（1.0.0）校验通过

# 3. 接入宿主（复制源文件 + 接线 PluginsModule PLUGINS 数组）
node scripts/keelbase-plugin.mjs add my-plugin.ts
#   ✓ 已接线插件 MY_PLUGIN

# 4. 重建生效
cd Server-NestJS && npm run build

# 5. 调用插件路由（如注册了 /plugins/<path>）
curl -X POST http://localhost:3000/api/v1/plugins/my-hello \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{}'
```

## 4. 自包含插件模板

```ts
/**
 * 自包含插件示例：不 import 宿主相对路径，仅用 PluginContext 公开 API。
 */
export const MY_PLUGIN = {
  name: 'my-plugin',
  version: '1.0.0',
  description: '示例：注册一个读取宿主服务统计的端点',
  // requires: ['UsersService'],   // 可选：依赖宿主服务（verify 会对照服务类名校验）
  // featureFlag: 'ai',            // 可选：特性开关
  capabilities: ['plugin.my'],
  hooks: {
    onAppStart: (ctx) => {
      ctx.registerRoute('/plugins/my-stats', async () => {
        const users = ctx.getService<any>('UsersService');
        const count = users ? await users.count() : 'unavailable';
        return { plugin: 'my-plugin', userCount: count, aiEnabled: ctx.isFeatureEnabled('ai') };
      });
    },
  },
};
```

## 5. 生命周期与约束

- **依赖校验**：`requires` 声明的宿主服务解析不到 → 插件被跳过（`PluginsService` 警告）；
- **特性开关**：`featureFlag` 关闭 → 插件不启用（`notifyFeatureChange` 通知 `onFeatureChange`）；
- **启停**：装配类变更（新增插件）需重建；启停走 FeatureFlags/RG-2 实时生效；
- **安全**：插件 HTTP 路由走 `POST /api/v1/plugins/:path` 统一入口（需登录）；插件内业务逻辑同样受 CASL 约束——建议通过 `ctx.getService` 调用宿主服务，而非直连数据源。

## 6. 校验与自包含

```bash
# 校验（宿主外即可跑；在仓库根目录才做 requires/featureFlag 一致性对照）
node scripts/keelbase-plugin.mjs verify my-plugin.ts
node scripts/keelbase-plugin.mjs list    # 已接线插件
node scripts/keelbase-plugin.mjs remove <NAME_PLUGIN>   # 移除接线（源文件保留）
```

> Extension API 现状（详见 `ecosystem-pack.md` §三）：插件 CLI 四件套成熟；剩余缺口 = 插件 Registry / 依赖版本解析（v1.0 后）。
