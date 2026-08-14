# 应用版本更新检查（PL-5）需求确认书 / App Version Update Check (PL-5) Requirements Confirmation

> 需求确认日期：2026-08-06
> Confirmation date: 2026-08-06
> 状态：已确认
> Status: Confirmed

## 1. 背景与目标 / Background and Goals

settings 页已显示版本号（硬编码 `1.0.0`），但无更新机制。移动端标配需要：启动时检查服务端最新版本，引导用户升级；旧版本强制升级。

The settings page already shows a version number (hard-coded `1.0.0`), but there is no update mechanism. A standard mobile requirement: check the latest server version on startup, guide users to upgrade, and force upgrades for old versions.

**目标**：后端提供版本元数据端点，前端启动时检查并弹更新提示（引导/强制），settings 显示真实版本号。

**Goals**: The backend provides a version metadata endpoint; the frontend checks on startup and shows an update prompt (guided/forced); the settings page displays the real version number.

**不在范围**：应用内自动下载安装（需原生热更新，如腾讯 Bugly/阿里热修复）、iOS/Android 商店自动跳转审核流程、多平台差异化版本（同一套版本号）。

**Out of scope**: In-app automatic download and installation (requires native hot-update, e.g., Tencent Bugly / Alibaba Hotfix), automatic app-store review redirection for iOS/Android, and platform-differentiated versions (a single shared version set).

## 2. 功能需求 / Functional Requirements

| # | 需求 / Requirement | 说明 / Description | 优先级 / Priority |
|---|------|------|--------|
| F1 | 版本元数据端点 / Version metadata endpoint | GET /api/v1/app/version：最新版本 / 最低版本 / 更新日志 / 更新链接 / latest version / minimum version / changelog / update link | P0 |
| F2 | 启动版本检查 / Startup version check | App 启动（splash 阶段）拉取版本元数据，与本地版本对比 / The app fetches version metadata on startup (splash stage) and compares it with the local version | P0 |
| F3 | 强制更新 / Forced update | 本地版本 < 最低版本 → 弹窗不可关闭，必须去更新 / Local version < minimum version → non-dismissible dialog, update is mandatory | P0 |
| F4 | 引导更新 / Guided update | 本地版本 < 最新版本 → 弹窗可关闭（稍后再说） / Local version < latest version → dismissible dialog ("Remind me later") | P1 |
| F5 | 版本号展示 / Version display | settings 页显示实际版本号（替代硬编码） / The settings page shows the actual version number (replacing the hard-coded one) | P1 |

## 3. 非功能需求 / Non-Functional Requirements

- 网络失败/后端不可达：不阻塞启动，视为无更新（静默跳过）
  Network failure / backend unreachable: does not block startup; treated as no update (silently skipped)
- 版本比较：语义化版本（x.y.z），逐段数值比较
  Version comparison: semantic versions (x.y.z), compared segment by segment numerically
- 端点公开（无需登录）、跳过限流（同 health）
  The endpoint is public (no login required) and skips rate limiting (same as health)

## 4. 版本策略 / Version Strategy

- 后端 `app-version.config.ts` 静态配置版本元数据，改版本号需更新该文件（基座场景足够）
  The backend statically configures version metadata in `app-version.config.ts`; changing the version requires updating this file (sufficient for the base-platform scenario)
- 更新链接指向应用商店（iOS App Store / Android 应用市场），前端点击跳转
  The update link points to the app store (iOS App Store / Android app marketplace); the frontend opens it on tap

## 5. 验收标准 / Acceptance Criteria

- GET /api/v1/app/version 返回结构化版本元数据
  GET /api/v1/app/version returns structured version metadata
- 前端启动检查：低于最低版本弹强制窗（不可关）、低于最新版本弹引导窗（可关）
  Frontend startup check: below the minimum version → forced dialog (non-dismissible); below the latest version → guided dialog (dismissible)
- settings 显示实际版本号
  The settings page shows the actual version number
- 网络失败不阻塞启动
  Network failure does not block startup
