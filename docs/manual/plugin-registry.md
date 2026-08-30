# Plugin Registry / 插件注册表规范

> KeelBase 官方插件目录 + 社区投稿通道（P1-7 Plugin Ecosystem 的 Registry 部分）。
> 运行时清单由 `GET /api/v1/admin/plugins` 提供；本文件是**内置官方索引**（编译期注册的插件在此登记）。
> Plugin Registry spec for the official plugin catalog + community contribution path.

## 一、定位 / Positioning

插件机制（PL-11）让社区扩展宿主，而不是不断膨胀 Core。Registry 是**官方插件的目录 + 契约**：

- **运行时清单**：`GET /api/v1/admin/plugins`（管理员）返回已加载插件的 `name / version / description / capabilities`
- **内置官方索引**：本文件维护的官方插件表（与 `src/plugins/plugins/` 下编译期注册的 manifest 一一对应）
- **发现/启用**：插件经统一入口 `POST /api/v1/plugins/:path` 暴露端点；`capabilities` 供三端展示与权限判断

## 二、官方插件索引 / Official Plugins

| 插件 | name | 版本 | capabilities | 端点（POST /api/v1/plugins/...） | 配置 |
|---|---|---|---|---|---|
| 示例 | `hello-plugin` | 1.0.0 | `plugin.hello` | `/plugins/hello` | — |
| GitHub | `github-plugin` | 1.0.0 | `plugin.github.status` / `.repos` | `/plugins/github/status`、`/plugins/github/repos` | `GITHUB_TOKEN`（可选） |
| 飞书 | `feishu-plugin` | 1.0.0 | `plugin.feishu.status` / `.send` | `/plugins/feishu/status`、`/plugins/feishu/send` | `FEISHU_APP_ID` / `FEISHU_APP_SECRET` |
| 企业微信 | `wecom-plugin` | 1.0.0 | `plugin.wecom.status` / `.send` | `/plugins/wecom/status`、`/plugins/wecom/send` | `WECOM_CORP_ID` / `WECOM_AGENT_ID` / `WECOM_SECRET` |

**契约（官方插件统一遵循）**：
1. 每个插件提供 `/plugins/<name>/status`——返回 `{ plugin, configured, hint }`，未配置时给出 `howToConfigure` 引导（不静默失败）。
2. 写操作（发消息等）未配置凭据 → 返回 `{ ok:false, message, howToConfigure }`，不产生外部副作用。
3. 端点经统一入口 `POST /api/v1/plugins/:path` 访问，请求参数放 body。

## 三、发现与使用 / Discovery

```bash
# 运行时已加载插件清单（管理员）
GET /api/v1/admin/plugins

# 调用某插件端点（示例：GitHub 列仓库）
POST /api/v1/plugins/github/repos
{ "owner": "rain6fish" }

# 查看配置状态（未配置 → 引导如何配）
POST /api/v1/plugins/feishu/status   # body 可空
```

## 四、投稿新插件 / Contribute a plugin

1. 在 `Server-NestJS/src/plugins/plugins/` 新建 `<name>.plugin.ts`（`PluginManifest`，见 [plugin-development.md](plugin-development.md)）。
2. 用 CLI 或手写接线到 `plugins.module.ts` 的 `PLUGINS` 数组：`node scripts/keelbase-plugin.mjs add <source.ts>`。
3. 在本文件官方索引表登记一行（name/版本/capabilities/端点/配置）。
4. 提交 PR——插件经 Review 合入后随宿主发布（编译期注册，装配变更需重启）。

## 五、约束 / Constraints

- **编译期注册**：插件与宿主同编译，无运行时动态加载（安全与可审计优先）
- **配置即契约**：`capabilities` 供三端展示与权限判断，新增能力需同步前端
- **依赖校验**：`requires` 列出的宿主服务不存在时 PluginsService 跳过并告警
- 开发插件：见 [plugin-development.md](plugin-development.md)；测试参考 `src/plugins/plugins.integration.spec.ts`
