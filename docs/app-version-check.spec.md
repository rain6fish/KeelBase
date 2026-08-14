# 应用版本更新检查 — AppVersionCheck（PL-5）/ App Version Update Check — AppVersionCheck (PL-5)

## 1. 概述 / Overview

后端暴露版本元数据端点，前端启动时检查并弹更新提示。`settings` 页显示实际版本号替代硬编码。

The backend exposes a version metadata endpoint; the frontend checks on startup and shows an update prompt. The `settings` page displays the actual version number instead of a hard-coded one.

## 2. 后端 / Backend

### 2.1 配置（`src/app-version/app-version.config.ts`）/ Configuration

静态导出版本元数据：

Exports version metadata statically:

```typescript
export const APP_VERSION = {
  latestVersion: '1.1.0',
  minRequiredVersion: '1.0.0',
  updateUrl: 'https://example.com/download',
  changelog: ['新增待办清单', '通知深链跳转', '修复已知问题'],
};
```

> 基座场景静态配置即可；上线运营时改此文件 + 前端常量。
> Static configuration is sufficient for the base-platform scenario; when going into production, update this file plus the frontend constant.

### 2.2 API

`GET /api/v1/app/version`（`@Public()` + `@SkipThrottle()`，同 health）：

`GET /api/v1/app/version` (`@Public()` + `@SkipThrottle()`, same as health):

```json
{
  "latestVersion": "1.1.0",
  "minRequiredVersion": "1.0.0",
  "updateUrl": "https://example.com/download",
  "changelog": ["新增待办清单", "通知深链跳转", "修复已知问题"]
}
```

模块：`AppVersionModule`（controller + service），注册进 `app.module.ts`。

Module: `AppVersionModule` (controller + service), registered in `app.module.ts`.

## 3. 前端 / Frontend

### 3.1 版本号 / Version Number

`AppConstants.appVersion = '1.0.0'`（发布时与 pubspec `version:` 同步）。`settings` 页 `version` 行展示 `AppConstants.appVersion`（替代硬编码）。

`AppConstants.appVersion = '1.0.0'` (kept in sync with the pubspec `version:` at release time). The `version` row on the `settings` page displays `AppConstants.appVersion` (replacing the hard-coded value).

### 3.2 版本对比工具（`core/utils/version_utils.dart`）/ Version Comparison Utility

`int compareVersions(String a, String b)`：语义化版本逐段数值比较，返回 -1/0/1。

`int compareVersions(String a, String b)`: compares semantic versions segment by segment numerically and returns -1/0/1.

### 3.3 feature `version/` / Frontend Feature `version/`

- `data/models/app_version_info.dart`：`AppVersionInfo`（latestVersion/minRequiredVersion/updateUrl/changelog，fromJson）
  `data/models/app_version_info.dart`: `AppVersionInfo` (latestVersion/minRequiredVersion/updateUrl/changelog, with fromJson)
- `data/repositories/version_repository.dart`：`getVersionInfo()` → GET /app/version
  `data/repositories/version_repository.dart`: `getVersionInfo()` → GET /app/version
- `presentation/providers/version_check_provider.dart`：`AppUpdateDecision { none, optional, forced }`；`check()` 拉取+对比，网络失败返回 none
  `presentation/providers/version_check_provider.dart`: `AppUpdateDecision { none, optional, forced }`; `check()` fetches and compares, returning none on network failure

### 3.4 启动检查（splash）/ Startup Check (splash)

`SplashPage.initState`：先 `versionProvider.check()` → 若 `forced` 弹强制更新窗（barrierDismissible:false，仅"前往更新"）并停留；否则继续 `tryAutoLogin()`。`optional` 弹可关闭引导窗。网络失败/无更新直接放行。

In `SplashPage.initState`: first run `versionProvider.check()` → if `forced`, show a forced update dialog (`barrierDismissible: false`, only "Go to update") and stay; otherwise continue with `tryAutoLogin()`. If `optional`, show a dismissible guided dialog. On network failure / no update, proceed directly.

### 3.5 settings 手动检查 / Manual Check in Settings

settings 版本行点击 → `versionProvider.check()` → 有更新弹窗，无更新 toast "已是最新版本"。

Tapping the version row in settings → `versionProvider.check()` → shows a dialog if an update exists, otherwise toasts "Already up to date".

### 3.6 更新跳转 / Update Redirection

`url_launcher` 打开 `updateUrl`。`MainAxisAlignment` 上弹窗按钮：强制窗仅有"前往更新"；引导窗有"前往更新" + "稍后"。

`url_launcher` opens `updateUrl`. Dialog buttons on `MainAxisAlignment`: the forced dialog has only "Go to update"; the guided dialog has "Go to update" + "Later".

## 4. i18n 文案 / i18n Copy

`updateAvailable` / `forceUpdateMessage` / `newVersionAvailable` / `updateNow` / `later` / `upToDate`。

## 5. 测试 / Testing

- 后端：app-version.service.spec + e2e（GET /app/version 返回结构与字段）
  Backend: app-version.service.spec + e2e (GET /app/version returns structure and fields)
- 前端：version_utils 单测（语义化比较边界）+ version_check_provider 单测（最新/强制/失败降级）
  Frontend: version_utils unit tests (semantic comparison boundaries) + version_check_provider unit tests (latest/forced/failure fallback)

## 6. 后续 / Future Work

- 按平台差异化版本（iOS/Android 各自 latest/min）
  Platform-differentiated versions (separate latest/min for iOS/Android)
- 更新日志版本化（每版本独立日志）
  Versioned changelogs (an independent log per version)
- 强制更新版本号持久化到本地（多次启动不重复提示已处理）
  Persist the forced-update version number locally (multiple startups won't prompt repeatedly; already handled)
