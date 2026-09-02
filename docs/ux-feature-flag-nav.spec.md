# UX Feature-Flag Nav Hiding — 前端 feature flag 导航隐藏收口（P0-6 / EASY-5 配套）

> 规格 + 探索结论。状态：✅ 完成（机制已实现 + 工作台快捷卡片缺口补齐）。日期：2026-09-01。

## 1. 目标

small/lite preset（EASY-5 首启引导）下，关闭的功能入口在 UI 中隐藏——「开箱所见即所得」，不显示点进去才知不可用的入口。

## 2. 机制盘点（探索结论：核心已完整）

| 层 | 机制 | 状态 |
|----|------|------|
| 后端能力清单 | `/app/capabilities` 返回 `preset` + `features: Record<key,boolean>` + `businessModules`（`MODULES_MANIFEST` 按 `flags[id] !== false` 过滤，单一事实源） | ✅ |
| 工作台/管理台导航 | 导航项标 `module` + `caps.isModuleEnabled(id)` 过滤（`AdminLayout` workbench + consoleNavGroups） | ✅ |
| 登录页 OAuth/SSO | `/auth/oauth/providers` 后端按配置过滤（small 关 oauth → 空 → 不显示） | ✅ |
| 全局搜索 | Web 端无独立 /search 导航项（搜索是移动端 /api/v1/search 模块；各视图 DebouncedSearch 是列表内过滤，非全局 search feature） | ✅ 无对应入口 |
| push/sms | Web 端无对应导航项 | ✅ 无对应入口 |

## 3. 本次补齐缺口

**工作台首页快捷卡片**（`WorkbenchHomeView.vue`）：AI 业务洞察卡片（→ /workbench/crm-dashboard）未按 crm module 过滤——lite preset 关 crm 时仍显示。

- `ShortcutCard` 加 `module?: string`
- AI 洞察卡片标 `module: 'crm'`
- `shortcutCards` 末尾 `.filter((c) => !c.module || caps.isModuleEnabled(c.module))`
- caps 未加载时 isModuleEnabled 默认 true（不误隐藏）

## 4. 相关

- `Server-NestJS/src/feature-flags/feature-flags.constants.ts` PRESETS（small 关 push/sms/oauth；lite 再关 search/生成模块/三旗舰）
- `Server-NestJS/src/app-version/capabilities.service.ts` businessModules 过滤
- `docs/security-showcase.spec.md` / `docs/manual/README.md`
