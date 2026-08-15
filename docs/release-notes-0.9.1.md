## KeelBase v0.9.1 — Quality & Governance Release / 质量与治理版

v0.9.1 builds on the business-safe agent base with a hardened review pass: two independent code-audit tools (Alibaba OpenCodeReview + five-axis review) swept the codebase, 281 findings were triaged and fixed, all tests green.

v0.9.1 在业务安全基座之上完成一轮代码审查加固：两套独立审计（阿里 OpenCodeReview + 五轴审查）全仓扫描，281 条发现经交叉评审后全部修复，测试全绿。

### New in v0.9.1 / 新增

- **AI governance as policy (HS-9)**: tool switches / confirmation rules / role allow-list / audit granularity are now runtime policy via `ai_governance_policy` setting, wired into gating, confirmation, inventory and audit.
  **AI 治理策略化（HS-9）**：工具开关 / 确认规则 / 角色白名单 / 审计粒度由 `ai_governance_policy` 动态配置，接入门控、确认、清单与审计。
- **Points / check-in / achievements (GROWTH-3)**: daily check-in with streak bonus, balance + leaderboard (masked) + rule-driven achievements; Flutter page with ranking and achievements.
  **积分 / 签到 / 成就（GROWTH-3）**：每日签到 + 连签加成，余额 + 排行榜（脱敏）+ 规则成就；Flutter 页面含排行榜与成就。
- **Health dependency details (D.9)**: `GET /health?detail=true` reports db/redis/queue/storage status with timeout degradation, now rate-limited 60/min.
  **健康检查依赖详情（D.9）**：`/health?detail=true` 返回 db/redis/queue/storage 状态，超时降级，现限流 60/min。
- **Org-level todos isolation (ORG-3 v2)**: member-visible org todos with consistent read/update/delete across list and detail.
  **待办组织级隔离（ORG-3 v2）**：组织成员可见同组待办，列表/详情/更新/删除权限一致。
- **Web-Admin-React preview (MUI)**: React 19 + MUI preview console aligned page-by-page with the Vue admin (Vue remains the primary version).
  **Web-Admin-React 预览版（MUI）**：React 19 + MUI 预览控制台逐页对齐 Vue 管理台（Vue 仍是主版本）。

### Review & Hardening / 审查加固

- **Check-in race fixed**: `points_entries` gets a `(user_id, checkin_date)` unique constraint — concurrent double taps / retries can no longer earn double points.
  **签到竞态修复**：`points_entries` 增加 `(user_id, checkin_date)` 唯一约束，并发双击/重试不再产生双倍积分。
- **AI daily quota decoupled from audit granularity**: conversation quota now counts on an independent `ai_daily_usage` table, so setting audit granularity to `off`/`write` can no longer silently disable the quota.
  **AI 每日限额独立于审计粒度**：会话配额改由独立 `ai_daily_usage` 表计数，审计粒度设为 `off`/`write` 不再静默关闭限额。
- **401 refresh hardened**: single-flight refresh, transport errors no longer log users out, retry propagates the real error; SSE framing fixed with line buffering and leak-free cleanup.
  **401 刷新加固**：刷新 single-flight、瞬断网络不再误登出、重试传播真实错误；SSE 行缓冲修复跨 chunk 切分、连接无泄漏。
- **Provider race cleanup**: in-flight guards / generation tokens / dispose guards across ai chat, conversations, events, books, announcements, push token.
  **Provider 竞态清理**：AI 对话、会话、事件、图书、公告、推送 token 均加在途守卫 / 代际 token / dispose 守卫。
- **Admin console fixes**: React 401→login wiring, snackbar infinite-refetch loop, org first-load timing; audit detail fields localized.
  **管理台修复**：React 401 跳登录接线、snackbar 无限重取循环、首组织加载时序；审计详情字段双语化。
- **i18n gaps closed**: 20+ hardcoded strings migrated to AppLocalizations; plural / locale variants (zh_TW/zh_HK) corrected.
  **i18n 补齐**：20+ 硬编码文案接入 AppLocalizations；复数形式与 zh_TW/zh_HK 语言变体修正。

### Quality / 质量

- **Tests**: Flutter 273 tests green (coverage 24.6%→45.6%, CI gate ≥45% lines); NestJS 838 tests green with coverage gates (statements ≥65 / branches ≥55 / functions ≥60 / lines ≥65); new SSE loopback tests, rate-limit and refresh boundary tests.
  **测试**：Flutter 273 用例全绿（覆盖率 24.6%→45.6%，CI 门槛 ≥45% 行）；NestJS 838 用例全绿 + 覆盖率门槛（statements≥65 / branches≥55 / functions≥60 / lines≥65）；新增 SSE 真连、限流、刷新边界测试。
- **Audit naming**: `points.*` / `todos.*` semantic keys added to the operation-audit feature map — audit shows real feature names bilingually.
  **审计命名**：操作审计 feature-map 补 `points.*` / `todos.*` 语义键，审计显示真实功能名并双语化。

### Version / 版本

- 0.9.0 → 0.9.1 · Server-NestJS / Front-Flutter / Web-Admin-Vue bumped together.
  0.9.0 → 0.9.1 · Server-NestJS / Front-Flutter / Web-Admin-Vue 版本号同步更新。
