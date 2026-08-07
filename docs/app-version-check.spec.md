# 应用版本更新检查 — AppVersionCheck（PL-5）

## 1. 概述

后端暴露版本元数据端点，前端启动时检查并弹更新提示。`settings` 页显示实际版本号替代硬编码。

## 2. 后端

### 2.1 配置（`src/app-version/app-version.config.ts`）

静态导出版本元数据：

```typescript
export const APP_VERSION = {
  latestVersion: '1.1.0',
  minRequiredVersion: '1.0.0',
  updateUrl: 'https://example.com/download',
  changelog: ['新增待办清单', '通知深链跳转', '修复已知问题'],
};
```

> 基座场景静态配置即可；上线运营时改此文件 + 前端常量。

### 2.2 API

`GET /api/v1/app/version`（`@Public()` + `@SkipThrottle()`，同 health）：

```json
{
  "latestVersion": "1.1.0",
  "minRequiredVersion": "1.0.0",
  "updateUrl": "https://example.com/download",
  "changelog": ["新增待办清单", "通知深链跳转", "修复已知问题"]
}
```

模块：`AppVersionModule`（controller + service），注册进 `app.module.ts`。

## 3. 前端

### 3.1 版本号

`AppConstants.appVersion = '1.0.0'`（发布时与 pubspec `version:` 同步）。`settings` 页 `version` 行展示 `AppConstants.appVersion`（替代硬编码）。

### 3.2 版本对比工具（`core/utils/version_utils.dart`）

`int compareVersions(String a, String b)`：语义化版本逐段数值比较，返回 -1/0/1。

### 3.3 feature `version/`

- `data/models/app_version_info.dart`：`AppVersionInfo`（latestVersion/minRequiredVersion/updateUrl/changelog，fromJson）
- `data/repositories/version_repository.dart`：`getVersionInfo()` → GET /app/version
- `presentation/providers/version_check_provider.dart`：`AppUpdateDecision { none, optional, forced }`；`check()` 拉取+对比，网络失败返回 none

### 3.4 启动检查（splash）

`SplashPage.initState`：先 `versionProvider.check()` → 若 `forced` 弹强制更新窗（barrierDismissible:false，仅"前往更新"）并停留；否则继续 `tryAutoLogin()`。`optional` 弹可关闭引导窗。网络失败/无更新直接放行。

### 3.5 settings 手动检查

settings 版本行点击 → `versionProvider.check()` → 有更新弹窗，无更新 toast "已是最新版本"。

### 3.6 更新跳转

`url_launcher` 打开 `updateUrl`。`MainAxisAlignment` 上弹窗按钮：强制窗仅有"前往更新"；引导窗有"前往更新" + "稍后"。

## 4. i18n 文案

`updateAvailable` / `forceUpdateMessage` / `newVersionAvailable` / `updateNow` / `later` / `upToDate`。

## 5. 测试

- 后端：app-version.service.spec + e2e（GET /app/version 返回结构与字段）
- 前端：version_utils 单测（语义化比较边界）+ version_check_provider 单测（最新/强制/失败降级）

## 6. 后续

- 按平台差异化版本（iOS/Android 各自 latest/min）
- 更新日志版本化（每版本独立日志）
- 强制更新版本号持久化到本地（多次启动不重复提示已处理）
