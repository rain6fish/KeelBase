# KeelBase v0.9.2 — Experience & Resilience Release / 体验与韧性版

v0.9.2 focuses on first-run experience (preset guidance + capabilities-driven navigation), streaming/SSE resilience, WeChat mini-app channel, enterprise login security, and deployment scale-out — plus the full set of review-driven fixes since 0.9.1.

v0.9.2 聚焦首启体验（预设引导 + capabilities 导航联动）、流式与 SSE 韧性、微信小程序渠道、企业登录安全与部署扩展，并收拢 0.9.1 之后的全部审查修复。

## New in v0.9.2 / 新增

- **Preset guidance & capabilities navigation (EASY-5 / MOD-4)**: Flutter shows a one-time first-login dialog explaining the active deployment preset (full / small / lite) and hides the search entry when the `search` feature is disabled; Web-Admin-Vue filters console routes & nav by `businessModules` (route `meta.module` + guard interception + nav filtering) so disabled modules no longer surface in the admin.
  **首启预设引导 + capabilities 导航联动（EASY-5 / MOD-4）**：Flutter 首次登录弹一次性预设说明（full/small/lite），`search` 禁用时隐藏搜索入口；Web-Admin-Vue 按 `businessModules` 过滤控制台路由与导航，禁用模块不再出现在管理台。
- **WeChat mini-app login + subscribe messages (MINI-3 / MINI-2)**: `/auth/oauth` supports `providerType: miniapp` (sns/jscode2session → openid), one-tap WeChat login in the Taro mini-app, and subscribe-message reminders for events (`WxSubscribeService`, template messages, graceful degradation without credentials).
  **微信小程序登录 + 订阅消息（MINI-3 / MINI-2）**：`/auth/oauth` 支持 `providerType: miniapp`；Taro 小程序微信一键登录 + 事件订阅消息提醒（`WxSubscribeService` 模板消息，无凭据优雅降级）。
- **Enterprise login security (WEB-FRONT-4)**: TOTP two-factor auth (RFC 6238, zero-dependency `MfaService` — setup / verify / disable + login integration with unified `MFA_REQUIRED` anti-enumeration) and forced password change (`/auth/change-password` + admin `must-change-password` marker with email-verification flow).
  **企业登录安全（WEB-FRONT-4）**：TOTP 双因素（RFC 6238 零依赖 `MfaService`）+ 强制改密（`/auth/change-password` + admin 强制标记）。
- **DB read/write splitting + K8s + blue-green/canary (3.3 / D.2 / D.3)**: TypeORM replication (`DB_READ_REPLICAS` read-routing), `infra/k8s/` manifests (rolling update, probes, HPA, Ingress), compose blue-green script with Nginx weight switching + canary Ingress.
  **读写分离 + K8s + 蓝绿/金丝雀（3.3 / D.2 / D.3）**：TypeORM 主从复制、`infra/k8s/` 清单、compose 蓝绿脚本 + 金丝雀 Ingress。
- **Webhook reliability (PL-14)**: exponential-backoff delivery retry (default 3 attempts) + `event.created` trigger — feedback / todo / event all publish now.
  **Webhook 可靠性（PL-14）**：投递指数退避重试 + `event.created` 触发点，覆盖 feedback/todo/event 三事件。
- **Todos bulk import (POV-2)**: `POST /admin/import/todos` + admin card with CSV template download (formula-injection guard).
  **待办批量导入（POV-2）**：`POST /admin/import/todos` + 管理台导入卡 + CSV 模板下载（公式注入防护）。
- **Online demo site (PM-1)**: `deploy/demo.sh` one-command read-only demo (Taro H5 + seeded backend + static hosting) — clone → `./scripts/dev.sh demo` → login `alex/123456`.
  **在线演示站（PM-1）**：`deploy/demo.sh` 一键只读体验站，`./scripts/dev.sh demo` 即可体验。
- **Org-dimension AI audit (ORG-5 v3)**: `GET /audit/logs?orgId=X` filters AI audit by organization.
  **AI 审计组织维度（ORG-5 v3）**：`GET /audit/logs?orgId=X` 按组织过滤 AI 审计。

## Resilience & Hardening / 韧性与加固

- **Streaming provider fallback (CR-28)**: streaming chat now falls back to the next provider when the primary errors before any content (previously a broken primary failed the whole stream); non-streaming fallback keeps the actually-successful provider.
  **流式 provider fallback（CR-28）**：流式对话在主 provider 未产出内容即失败时自动切换备用 provider；非流式回退用实际成功的 provider。
- **SSE reconnect + 401 refresh (CR-17)**: `SseClient` gains exponential-backoff reconnect and refresh-then-retry on 401 (single-flight via `ApiClient.refreshNow()`); notifications SSE fallback reconnects automatically.
  **SSE 断流重连 + 401 刷新（CR-17）**：`SseClient` 加指数退避重连 + 401 先刷新再重试；通知 SSE 兜底自动重连。
- **Eval isolation (CR-18)**: eval runs use per-run identity `eval:<ts>` instead of the shared system account `'0'`.
  **评测隔离（CR-18）**：评测跑批用每次独立身份，不再污染系统账号配额/记忆/审计。
- **Provider race cleanup (CR-26)**: Flutter dispose-guard on AI chat, calendar scroll hijack fixed; Taro search request-seq guard + notification-store error handling.
  **Provider 竞态清理（CR-26）**：Flutter AI 对话 dispose 守卫、日历抢滚动修复；Taro 搜索序号守卫 + 通知 store 异常处理。
- **Streaming tool-round apology (CR-29)**, **PII log removal (CR-30)**.
  **流式超轮次道歉（CR-29）**、**PII 日志移除（CR-30）**。

## Governance / Security / Audit (from the previous cycle, folded into 0.9.2)

- Audit hash chain (HS-11), MCP adapter + admin page (HS-10), governance policy editor (HS-9), per-module coverage gate (T.5), webhook subscriptions (PL-14), Flutter AI i18n hardening (T.8).
  **审计哈希链（HS-11）、MCP 适配与集成页（HS-10）、治理策略编辑（HS-9）、模块分档覆盖率门控（T.5）、Webhook 订阅（PL-14）、Flutter AI i18n 加固（T.8）。**

## Quality / 质量

- Tests: NestJS unit suite green with per-module security coverage gate; Flutter AI/SSE/capabilities tests added; Web-Admin-Vue typecheck + 43 vitest green; e2e 126 green (MFA flow, WS realtime, MCP export).
  **测试**：NestJS 单测全绿 + 安全模块分档门控；Flutter 新增 SSE 重连/capabilities 用例；Web-Admin-Vue typecheck + 43 vitest 全绿；e2e 126 全绿（MFA 流、WS 实时、MCP 出口）。

---

**Docs / 文档**：`docs/manual/tutorial.md`（从零到部署）、`docs/enterprise-readiness.md`（企业就绪度）、`docs/manual/blue-green-deploy.md`、`docs/manual/demo-deploy.md`、`docs/manual/admin-deploy.md`；Roadmap V2 已启用（私有仓）。
