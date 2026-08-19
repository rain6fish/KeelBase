# Changelog / 更新日志

This file records all notable changes to KeelBase. The format follows [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/), and versioning follows [Semantic Versioning](https://semver.org/lang/zh-CN/).

本文件记录 KeelBase 所有值得关注的变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased] / 未发布

Flagship AI applications, Private AI Golden Path, plugin ecosystem CLI, generic OIDC SSO, Web-Admin Element Plus migration. / 三旗舰 AI 应用、私有 AI 全链路验证、插件生态 CLI、通用 OIDC SSO、管理台 Element Plus 迁移。

### Added / 新增

- **AI CRM flagship (backend + Flutter/Web UI)**: Customer/Order/Activity/Task/Risk entities, CRUD/CASL, 5 AI tools (query_customers / query_customer_orders / query_customer_activities / analyze_customer_risk read + create_followup_task write-with-confirmation, revocable `crm_task` side effect), risk scoring (overdue / amount / open-risk tiers), real seed (8 customers / overdue orders / risks), feature flag `crm`
  **AI CRM 旗舰（后端 + Flutter/Web UI）**：客户/订单/跟进/任务/风险实体，CRUD/CASL，5 个 AI 工具（4 读 + 写需确认可撤销 `create_followup_task`，副作用 `crm_task`）、风险打分（逾期/金额/未解决风险分级）、真实 Seed（8 客户/逾期订单/风险）、feature flag `crm`
- **AI Project Management flagship (backend + Flutter/Web UI)**: Project/Member/Milestone/Task/Risk entities, CRUD/CASL, 4 AI tools (query_projects / query_project_tasks / analyze_project_risk read + create_project_task write-with-confirmation, revocable `pm_task` side effect), delay-risk scoring, real seed (4 projects / milestones / delayed tasks), feature flag `pm`
  **AI Project 旗舰（后端 + Flutter/Web UI）**：项目/成员/里程碑/任务/风险实体，CRUD/CASL，4 个 AI 工具（3 读 + 写需确认可撤销 `create_project_task`，副作用 `pm_task`）、延期风险打分、真实 Seed（4 项目/里程碑/延期任务）、feature flag `pm`
- **AI Approval flagship (backend + Flutter/Web UI)**: ApprovalRequest/ApprovalPolicy entities, CRUD/CASL, AI pre-review with policy-tiered rules (low-risk amount ≤ threshold auto-approve / over-threshold → human review) + manual decide, 4 AI tools, real seed (3 policies / 3 requests), feature flag `approval`
  **AI Approval 旗舰（后端 + Flutter/Web UI）**：审批请求/政策实体，CRUD/CASL，AI 预审按政策分级（金额≤阈值低风险自动通过 / 超阈值转人工复核）+ 人工 decide，4 个 AI 工具，真实 Seed（3 政策/3 请求），feature flag `approval`
- **Private AI Golden Path (W1 / POV-1)**: `scripts/verify-private-ai.sh` proves the "data never leaves the perimeter" chain end-to-end — Cloud OFF → local Ollama chat (provider=ollama) → local bge-m3 embedding → CRM read → AI audit `provider=ollama` → audit hash chain `valid`; evidence pack `private-ai-report.md` + `benchmarks/private-ai.json`; Release Gate Private dimension ✅
  **私有 AI 全链路验证（W1 / POV-1）**：`scripts/verify-private-ai.sh` 端到端证明「数据不出域」闭环——Cloud OFF → 本地 Ollama 对话（provider=ollama）→ 本地 bge-m3 embedding → CRM 读 → AI 审计 provider=ollama → 审计哈希链 valid；证据包 `private-ai-report.md` + `benchmarks/private-ai.json`；Release Gate Private 维度 ✅
- **Plugin ecosystem CLI (P1-7)**: `keelbase-plugin` add / remove / list / verify — host-independent manifest validation (name kebab-case / version semver / description / requires / featureFlag / capabilities), self-containment check (host-relative imports → portability warning), real third-party install cycle (approval-intake example)
  **插件生态 CLI（P1-7）**：`keelbase-plugin` add/remove/list/verify——宿主外 manifest 校验（结构/一致性/featureFlag 对照）、自包含检测（宿主相对导入→可移植性警告）、真实第三方安装闭环（approval-intake 示例）
- **Generic OIDC SSO backend (P2-4)**: dynamic `.well-known` discovery → token exchange → id_token signature verification (issuer/audience/JWKS, anti-confusion) → userinfo fallback to claims; enterprise provider group appears when `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` are configured
  **通用 OIDC SSO 后端（P2-4）**：动态发现 `.well-known` → token 交换 → id_token 签名验证（issuer/audience/JWKS，防混淆）→ userinfo 降级 id_token 声明；配齐 `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` 后 `/auth/oauth/providers` 出现 oidc（enterprise 组）
- **Web-Admin-Vue migrated to Element Plus**: Vuetify fully removed (zero `v-*` tags) — 12 shared components + 37 pages + layout migrated (el-table / el-form / el-menu / el-tag / el-dialog …), Vuetify tokens → EP CSS variables (incl. dark), on-demand tree-shaken import
  **管理台迁移到 Element Plus**：Vuetify 完全移除（零 `v-*` 残留）——12 个共享组件 + 37 个页面 + 布局迁移（el-table/el-form/el-menu/el-tag/el-dialog…），Vuetify token → EP CSS 变量（含 dark），按需 tree-shake 引入
- **Agent Decision Trace (P0-14)**: `GET /ai/conversations/:id/trace` aggregates messages / audit / tool-effects into a timeline (tool calls / confirmation decisions / side effects / results); Web workbench AiTraceView + Flutter AiTracePage; live tool cards show read/write badges + "needs confirmation" / "confirmed · revocable"
  **AI 决策执行轨迹（P0-14）**：`GET /ai/conversations/:id/trace` 聚合消息/审计/副作用为时间线（工具调用/确认决策/副作用/结果）；Web 工作台 AiTraceView + Flutter AiTracePage；实时工具卡显示「读/写」徽标 + 「需确认」/「已确认 · 可撤销」
- **Self-service AI side-effect revocation (P0-15)**: users revoke their own AI-created records (`DELETE /ai/my/tool-effects/:id`, ownership-checked, soft-delete → restorable from recycle bin); trace effect steps carry `effectId`
  **用户侧 AI 副作用撤销（P0-15）**：本人可撤销 AI 创建的记录（`DELETE /ai/my/tool-effects/:id`，所有权校验，软删可经回收站恢复）；轨迹 effect 步骤带 `effectId`
- **Existing-system AIization (P0-12)**: `keelbase init --import-openapi` (OpenAPI 3 / Swagger 2) + `--import-schema` (SQL CREATE TABLE — CHECK IN → enum, long VARCHAR → text) turn a legacy schema into a Protocol → generated module; `--out` writes only the Protocol JSON for later `--spec` reuse
  **已有系统 AI 化（P0-12）**：`keelbase init --import-openapi`（OpenAPI 3/Swagger 2）+ `--import-schema`（SQL 建表——CHECK IN→enum、长 VARCHAR→text）把老 schema 转成 Protocol → 生成模块；`--out` 只写协议 JSON 供 `--spec` 复用
- **AI-consumable module metadata (P1-3)**: `/app/capabilities` businessModules expose a `description` so AI agents know what each module does at a glance
  **AI 可消费模块元数据（P1-3）**：`/app/capabilities` businessModules 透出 `description`，AI 读模块地图即知每个模块做什么
- **Flagship demo templates (P1-9)**: template market gains `crm-demo` / `pm-demo` / `approval-demo` — one-click import of flagship scenario seeds (at-risk customers / delayed projects / approval policies)
  **旗舰演示模板（P1-9）**：模板市场新增 `crm-demo`/`pm-demo`/`approval-demo`——一键导入旗舰场景种子（流失风险客户/延期项目/审批政策）
- **Protocol reverse-engineering + business protocol specs**: generator supports `enum` fields (@IsIn / defaults + Flutter dropdown + admin/taro type mapping); `specs/` common business protocols (events / todos / books / notes) usable with `keelbase init --spec`
  **协议反推 + 业务协议示例**：生成器支持 enum 字段（`@IsIn`/默认值 + Flutter 下拉 + admin/taro 类型映射）；`specs/` 常用业务协议（events/todos/books/notes）可直接 `--spec` 生成
- **Generated modules ship AI tools + tests (30-min acceptance)**: `keelbase init` auto-attaches `query_<module>` (read) + `create_<module>` (write, requires confirmation + verified email) and registers them in ai.module; generated controller + AI-tool specs; 30-min acceptance script (`docs/manual/30min-acceptance.md`)
  **生成模块自带 AI 工具 + 测试（30min 验收）**：`keelbase init` 自动附带 `query_<module>`（读）+ `create_<module>`（写，需确认 + 已验证邮箱）并注册 ai.module；生成 controller/AI 工具单测；30min 验收脚本（`docs/manual/30min-acceptance.md`）
- **Flagship strict verification (Phase 2-1)**: `scripts/verify-flagships.sh` runs 4 e2e suites (crm / pm / approval / generated-modules — CRUD/CASL/confirmation/audit) with explicit security acceptance points; Release Gate Run dimension gains real LLM evidence (3/3 SUCCESS, DeepSeek)
  **三旗舰严格验证（Phase 2-1）**：`scripts/verify-flagships.sh` 跑 4 个 e2e suite（crm/pm/approval/generated-modules——CRUD/CASL/确认/审计）+ 显式安全验收点；Release Gate Run 维度补真实 LLM 实测证据（3/3 SUCCESS，DeepSeek）
- **Signed-URL upload access control (CR-21)**: `/uploads` files served via HMAC-SHA256 signed URLs with expiry (progressive default; `UPLOAD_REQUIRE_SIGN=1` forces 403) + path-traversal guard; avatar/upload responses return signed URLs
  **上传签名访问（CR-21）**：`/uploads` 经 HMAC-SHA256 签名 URL（含过期时间）访问（渐进默认放行；`UPLOAD_REQUIRE_SIGN=1` 强制 403）+ 路径穿越防护；头像/上传响应返回签名 URL
- **Web root → workbench, Flutter web as `/mobile` preview**: single-container/nginx root redirects to the Web workbench; Flutter web moves to `/mobile` as the mobile-app preview (Web business UI host = workbench)
  **Web 根路径切工作台 + Flutter web 移 `/mobile` 预览**：单容器/nginx 根路径重定向到 Web 工作台；Flutter web 移到 `/mobile` 作移动 App 预览（Web 业务 UI 唯一宿主=工作台）

### Fixed / 修复

- **Private AI chain repairs (W1)**: Joi schema accepts `AI_PROVIDER=ollama`; BullMQ workers register only when `QUEUE_ENABLED` (test env never connects Redis); ollama default model follows `OLLAMA_MODEL`
  **私有 AI 断链修复（W1）**：Joi 放行 `AI_PROVIDER=ollama`；BullMQ worker 条件注册（测试环境不连 Redis）；ollama 默认模型用 `OLLAMA_MODEL`
- **CI repair (6 failure domains)**: migration-consistency job (no-change exits 1 under `bash -e` → `|| true`), 2 flaky e2e timeouts, coverage gates (Flutter 46.1% / web-admin ≥30%), e2e queue stubbing (never connects Redis), email-verified cache clear
  **CI 修复（6 个失败域）**：migration-consistency job（`bash -e` 下无变化退出码 1 → `|| true`）、2 个抖动 e2e 超时、覆盖率门禁（Flutter 46.1% / web-admin ≥30%）、e2e 队列 stub（永不连 Redis）、email-verified 缓存清除
- **Queue disabled in test env**: BullMQ no longer hangs e2e when Redis is absent (conditional registration + stub overrides); `.env.test` auto-generated when missing
  **测试环境禁用队列**：无 Redis 时 BullMQ 不再挂起 e2e（条件注册 + stub override）；缺 `.env.test` 时自动生成
- **Redis exposed to host loopback**: compose `redis` now maps `127.0.0.1:6379:6379` (loopback-only) so local dev/e2e can reach it without binding 0.0.0.0
  **Redis 暴露到宿主机回环**：compose `redis` 加 `127.0.0.1:6379:6379` loopback-only 映射（本机可用、不绑 0.0.0.0 避免生产外网暴露）
- **Generated-module CASL wiring (30-min acceptance hardening)**: `keelbase init` modules now auto-wire `can('manage','<Module>',{userId})` — owner update/delete previously returned 403
  **生成模块 CASL 接线修复（30min 验收加固）**：`keelbase init` 生成模块自动接线 `can('manage','<Module>',{userId})`——此前本人更新/删除全 403
- **TypeORM logging type**: `app.module` logging `string[]` → `LogLevel[]` (build blocker from read/write-split)
  **TypeORM logging 类型**：`app.module` logging `string[]`→`LogLevel[]`（读写分离遗留的 build 阻塞）

## [0.9.2] - 2026-08-17

Preset guidance & capabilities-driven navigation, streaming resilience, WeChat mini-app, enterprise login security (MFA / forced password change), deployment scale-out. / 首启预设引导 + capabilities 三端导航联动、流式韧性与 SSE 重连、微信小程序、企业登录安全（TOTP / 强制改密）、部署扩展（读写分离 / K8s / 蓝绿）。

### Added / 新增

- **Audit hash chain (HS-11)**: `ai_audit_logs` & `operation_audit_logs` gain `prev_hash`/`hash` (HMAC chain, key domain-separated); tamper-evident and verifiable via `GET /audit/logs/verify` + `GET /audit/operations/logs/verify`
  **审计哈希链（HS-11）**：AI/操作审计表加 `prev_hash`/`hash`（HMAC 链，密钥域分离）；防篡改可验证，`GET /audit/logs/verify` + `/audit/operations/logs/verify`
- **MCP adapter (HS-10)**: export built-in AI tools as an MCP server (`POST /api/v1/mcp`, JSON-RPC) with the same governance (permission + confirmation + audit); entry gateway (`/admin/mcp/*`) registers external MCP servers via Settings and calls their tools through the same governance layer (tool key `mcp_<server>_<tool>`, non-read-only defaults to confirmation); agent chat integration (`ExternalToolProvider`) merges external tools into the LLM tool flow
  **MCP 适配（HS-10）**：内置 AI 工具出口为 MCP server（`POST /api/v1/mcp`，JSON-RPC）且过同一治理层（权限+确认+审计）；入口 gateway（`/admin/mcp/*`）经 Settings 注册外部 MCP server 并让其工具强制过治理层（工具键 `mcp_<server>_<tool>`，非只读默认需确认）；Agent 对话集成（`ExternalToolProvider`）把外部工具并入 LLM 工具流
- **Per-module coverage gate (T.5)**: `scripts/check-security-coverage.mjs` enforces statements ≥60% for critical modules (auth / casl / audit / ai-tools / governance / headless) after `test:cov`
  **关键模块覆盖率分档门控（T.5）**：`scripts/check-security-coverage.mjs` 在 `test:cov` 后按模块门控 statements ≥60%（auth/casl/audit/ai-tools/governance/headless）
- **Webhook subscriptions (PL-14)**: users register callback URLs for platform events (`feedback.created`, `todo.created`); delivery is HMAC-SHA256 signed, 5s-timeout non-blocking; self-service endpoints (subscribe / list / enable / delete / test delivery)
  **Webhook 订阅投递（PL-14）**：用户为平台事件（`feedback.created`、`todo.created`）注册回调 URL；投递 HMAC-SHA256 签名、5s 超时不阻断；自助端点（订阅/列表/启停/删除/测试投递）
- **Admin governance policy editor (HS-9)**: Web-Admin-Vue「AI Tools」page gains a governance editor — per-tool enabled / confirmation / allowed-roles toggles + audit granularity (all / write / off), saved to `ai_governance_policy` and effective immediately (no redeploy)
  **管理台治理策略编辑器（HS-9）**：Web-Admin-Vue「工具与副作用」页新增治理策略编辑——每工具启用/需确认/允许角色开关 + 审计粒度（全部/仅写/关闭），保存即写入 `ai_governance_policy` 实时生效
- **MCP integration admin page (HS-10)**: register / remove MCP servers, discover external tools (30s cache, force refresh), and call tools with a JSON argument template pre-filled from `inputSchema` — all through the governance layer (permission + confirmation + audit)
  **MCP 集成管理页（HS-10）**：注册/移除 MCP Server、发现外部工具（30s 缓存 + 强制刷新）、调用工具（按 `inputSchema` 预填 JSON 参数模板），全部过治理层
- **Flutter AI i18n hardening (T.8)**: AI chat error messages no longer hardcoded Chinese — injected i18n callbacks into the provider; stable keys on suggested-question chips; `UserModel.copyWith` can clear nullable fields; `ToolStepModel` extracted to a domain model
  **Flutter AI i18n 加固（T.8）**：AI 对话错误文案不再硬编码中文——向 provider 注入 i18n 回调；建议问题 chips 补稳定 key；`UserModel.copyWith` 支持清空可空字段；`ToolStepModel` 抽取到领域模型
- **Preset guidance & capabilities navigation (EASY-5 / MOD-4)**: Flutter shows a one-time first-login dialog for the active preset (full / small / lite) and hides the search entry when the `search` feature is disabled; Web-Admin-Vue filters console routes & nav by `businessModules` (route `meta.module` + guard interception + nav filtering)
  **首启预设引导 + capabilities 导航联动（EASY-5 / MOD-4）**：Flutter 首次登录弹一次性预设说明（full/small/lite），`search` 禁用时隐藏搜索入口；Web-Admin-Vue 按 `businessModules` 过滤控制台路由与导航（`meta.module` + 守卫拦截 + 导航过滤）
- **WeChat mini-app login + subscribe messages (MINI-3 / MINI-2)**: `/auth/oauth` supports `providerType: miniapp` (code2Session → openid), one-tap WeChat login in Taro + subscribe-message reminder authorization (`WxSubscribeService`, template messages on event reminders)
  **微信小程序登录 + 订阅消息（MINI-3 / MINI-2）**：`/auth/oauth` 支持 `providerType: miniapp`（code2Session→openid）；Taro 微信一键登录 + 订阅消息授权（`WxSubscribeService` 事件提醒模板消息）
- **Enterprise login security (WEB-FRONT-4)**: TOTP two-factor auth (RFC 6238, zero-dependency `MfaService` — setup / verify / disable endpoints + login integration with unified `MFA_REQUIRED` anti-enumeration) and forced password change (`/auth/change-password` + admin `must-change-password` marker)
  **企业登录安全（WEB-FRONT-4）**：TOTP 双因素（RFC 6238 零依赖 `MfaService`——setup/verify/disable 端点 + 登录集成，统一 `MFA_REQUIRED` 防枚举）+ 强制改密（`/auth/change-password` + admin 强制标记）
- **DB read/write splitting + K8s + blue-green/canary (3.3 / D.2 / D.3)**: TypeORM replication (`DB_READ_REPLICAS`), `infra/k8s/` manifests (rolling update / HPA / Ingress), and compose blue-green script + canary ingress with weight switching
  **读写分离 + K8s + 蓝绿/金丝雀（3.3 / D.2 / D.3）**：TypeORM 主从复制（`DB_READ_REPLICAS`）、`infra/k8s/` 清单（滚动更新/HPA/Ingress）、compose 蓝绿脚本 + 金丝雀 Ingress 权重切换
- **Webhook reliability (PL-14)**: exponential-backoff retry on delivery failure (default 3 attempts, injectable) + `event.created` trigger (3 real events now: feedback / todo / event)
  **Webhook 可靠性（PL-14）**：投递失败指数退避重试（默认 3 次，可注入）+ `event.created` 触发点（现覆盖 feedback/todo/event 三个真实事件）
- **Todos bulk import (POV-2)**: `POST /admin/import/todos` + admin page card with CSV template download (BOM + formula-injection guard)
  **待办批量导入（POV-2）**：`POST /admin/import/todos` + 管理台待办导入卡 + CSV 模板下载（BOM + 公式注入防护）
- **Online demo site (PM-1)**: `deploy/demo.sh` one-command read-only demo (Taro H5 + seeded backend + static hosting) + README Live Demo block
  **在线演示站（PM-1）**：`deploy/demo.sh` 一键起只读体验站（Taro H5 + 种子数据后端 + 静态托管）+ README Live Demo 区块
- **Org-dimension AI audit (ORG-5 v3)**: `GET /audit/logs?orgId=X` filters AI audit by organization (org_members subquery) for admin per-org oversight
  **AI 审计组织维度（ORG-5 v3）**：`GET /audit/logs?orgId=X` 按组织过滤 AI 审计（org_members 子查询），管理台按组织看 AI 行为

### Fixed / 修复

- **Streaming provider fallback (CR-28)**: `chatStreamImpl` now falls back to the next provider when the primary errors before emitting any content (previously a broken primary failed the whole stream); `tryFallback` keeps the actually-successful provider
  **流式 provider fallback（CR-28）**：`chatStreamImpl` 在主 provider 未产出内容即失败时自动切换下一个 provider（此前主 provider 故障整个流失败）；`tryFallback` 用实际成功的 provider
- **SSE reconnect + 401 refresh (CR-17)**: `SseClient.postStream` gains exponential-backoff reconnect (opt-in, max attempts) and refresh-then-retry on 401 via `ApiClient.refreshNow()` (single-flight); notifications SSE fallback enables reconnect
  **SSE 断流重连 + 401 刷新（CR-17）**：`SseClient.postStream` 加指数退避重连（可选、限次）+ 401 经 `ApiClient.refreshNow()`（single-flight）刷新后重试；通知 SSE 兜底开启重连
- **Eval isolation (CR-18)**: eval runs use a per-run identity `eval:<ts>` instead of the shared system account `'0'` — no longer polluting quota / memory / audit
  **评测隔离（CR-18）**：评测跑批用每次独立身份 `eval:<ts>` 替代共享系统账号 `'0'`——不再污染配额/记忆/审计
- **Provider race cleanup (CR-26)**: Flutter `AiChatProvider` dispose-guard (`_safeNotify`), day/week calendar scroll hijack fixed (once per date); Taro search request-seq guard + notification-store try/catch
  **Provider 竞态清理（CR-26）**：Flutter `AiChatProvider` dispose 守卫（`_safeNotify`）、日历日/周视图抢滚动修复（每日期一次）；Taro 搜索请求序号守卫 + 通知 store try/catch
- **Streaming tool-round apology (CR-29)** + **PII log removal / non-streaming fallback (CR-28/CR-30)**
  **流式超轮次道歉（CR-29）** + **PII 日志移除 / 非流式 fallback（CR-28/CR-30）**

- Migration schema consistency: named/placeholder constraint names (post_likes, user_follows, ai_daily_usage, …) caused CI `migration:generate` drift; `AddSchemaConsistencyConstraints` reconciles the chain (fresh-DB generate → "No changes")
  **迁移一致性**：可读/占位约束名（post_likes、user_follows、ai_daily_usage 等）导致 CI 迁移一致性校验漂移；`AddSchemaConsistencyConstraints` 修正迁移收敛（全新库 generate → No changes）
- MCP admin DTO validation: `RegisterServerDto` / `CallExternalToolDto` lacked class-validator decorators, so the global `whitelist + forbidNonWhitelisted` pipe stripped them and `POST /admin/mcp/servers` / `POST /admin/mcp/call` returned 400 (service unit tests bypass the HTTP pipe, so this was a blind spot); added decorators + DTO spec
  **MCP 管理 DTO 校验**：`RegisterServerDto`/`CallExternalToolDto` 缺 class-validator 装饰器，被全局 `whitelist + forbidNonWhitelisted` 管道整条剥掉致 register/call 400（service 单测直调绕过 HTTP 层所以是盲区）；补装饰器 + DTO 单测

## [0.9.1] - 2026-08-15

Quality & governance release: full-codebase review with two independent audit tools, 281 findings fixed, all tests green. / 质量与治理版：两套独立审计全仓审查，281 条发现全部修复，测试全绿。

### Added / 新增

- **AI governance as policy (HS-9)**: tool switches / confirmation rules / role allow-list / audit granularity as runtime policy via `ai_governance_policy` setting, wired into gating, confirmation, inventory and audit
  **AI 治理策略化（HS-9）**：工具开关 / 确认规则 / 角色白名单 / 审计粒度由 `ai_governance_policy` 动态配置，接入门控、确认、清单与审计
- **Points / check-in / achievements (GROWTH-3)**: daily check-in with streak bonus, masked leaderboard, rule-driven achievements (backend + Flutter page)
  **积分 / 签到 / 成就（GROWTH-3）**：每日签到 + 连签加成，脱敏排行榜 + 规则成就（后端 + Flutter 页面）
- **Health dependency details (D.9)**: `GET /health?detail=true` reports db/redis/queue/storage status, rate-limited 60/min
  **健康检查依赖详情（D.9）**：`/health?detail=true` 返回依赖状态，限流 60/min
- **Org-level todos isolation (ORG-3 v2)**: member-visible org todos, consistent list/detail/update/delete permissions
  **待办组织级隔离（ORG-3 v2）**：组织成员可见同组待办，列表/详情/更新/删除权限一致
- **Web-Admin-React preview (MUI)**: React 19 + MUI preview console aligned page-by-page with the Vue admin (Vue remains primary)
  **Web-Admin-React 预览版（MUI）**：React 19 + MUI 预览控制台逐页对齐 Vue 管理台（Vue 保持主版本）

### Fixed / 修复

- Check-in race: `(user_id, checkin_date)` unique constraint prevents double points on concurrent check-ins
  **签到竞态**：`(user_id, checkin_date)` 唯一约束防止并发签到双倍积分
- AI daily quota decoupled from audit granularity (independent `ai_daily_usage` counter) — `off`/`write` audit no longer disables the quota
  **AI 每日限额与审计粒度解耦**（独立 `ai_daily_usage` 计数）——审计粒度 `off`/`write` 不再关闭限额
- 401 refresh hardened: single-flight, transport errors no longer log users out, retry propagates real error; SSE line buffering + leak-free cleanup
  **401 刷新加固**：single-flight、瞬断网络不再误登出、重试传播真实错误；SSE 行缓冲 + 连接无泄漏
- Provider race cleanup: in-flight guards / generation tokens / dispose guards across ai/events/books/announcements/push
  **Provider 竞态清理**：AI/事件/图书/公告/推送均加在途守卫 / 代际 token / dispose 守卫
- Admin console: React 401→login wiring, snackbar infinite-refetch loop, org first-load timing; localized audit detail fields
  **管理台**：React 401 跳登录接线、snackbar 无限重取循环、首组织加载时序；审计详情双语化
- i18n: 20+ hardcoded strings migrated; plural forms and zh_TW/zh_HK variants corrected
  **i18n**：20+ 硬编码文案接入 AppLocalizations；复数与 zh_TW/zh_HK 变体修正

### Quality / 质量

- Coverage gates raised (NestJS ≥65/55/60/65; Flutter CI ≥45% lines); 838 backend + 273 Flutter tests green; new SSE loopback, rate-limit and refresh boundary tests
  覆盖率门槛提升（NestJS ≥65/55/60/65；Flutter CI ≥45% 行）；838 后端 + 273 Flutter 用例全绿；新增 SSE 真连、限流、刷新边界测试

## [0.9.0] - 2026-08-13

First public release (milestone). / 首个公开版本（里程碑发布）。

### Milestones / 里程碑

- **Business-safe AI Agent harness**: AI tool calls scoped to the user's data, human confirmation for writes, reversible side effects, eval loop, CASL row-level permissions wired into AI tools
  **业务安全的 AI Agent harness**：AI 工具调用限定用户数据范围、写操作人工确认、副作用可撤销、评测闭环、CASL 行级权限与 AI 工具打通
- **Consistent across three ends**: Flutter App (iOS/Android/Web) + Taro mini-program/H5 + PC Web admin console (Vue3 + Vuetify3) — one backend, three ends
  **三端一致**：Flutter App（iOS/Android/Web）+ Taro 小程序/H5 + PC Web 管理台（Vue3 + Vuetify3），一套后端三端出
- **Production-grade engineering**: CASL permissions, full audit trails, static encryption of sensitive data, OTel/Prometheus/Loki observability, green CI, one-click deploy & single-container delivery
  **生产级工程化**：CASL 权限、全链路审计、敏感数据静态加密、OTel/Prometheus/Loki 可观测、CI 全绿、一键部署与单容器交付

### Added / 新增

**AI & Agent / AI 与 Agent**

- AI chat (non-streaming + SSE streaming), tool-call process visualization (tool_start/tool_end)
  AI 对话（非流式 + SSE 流式），工具调用过程可视化（tool_start/tool_end）
- Actionable tools + human-confirmation protocol (create_event/create_todo), side-effect preview + one-click revoke + confirmation decisions logged to audit
  可操作工具 + 人工确认协议（create_event/create_todo），副作用预览 + 一键撤销 + 确认决策落审计
- Long-term user memory, context compaction, sub-agent delegation + skills (SkillsRegistry)
  长程用户记忆、上下文压缩、子代理委托 + 技能（SkillsRegistry）
- RAG knowledge base: document upload/chunking/vector search (pgvector), retrieval debugging & chunk preview
  RAG 知识库：文档上传/切块/向量检索（pgvector），检索调试与切块预览
- web_search browsing, multimodal image understanding, image generation
  web_search 联网、多模态图片理解、图像生成
- Proactive AI services (daily digest), conversation-feedback loop, AI eval set, cost dashboard, headless API, admin AI assistant
  主动 AI 服务（每日摘要）、对话反馈闭环、AI 评测集、成本看板、headless API、管理端 AI 助手
- AI behavior replay: admin-console timeline view (tool calls / confirmation decisions / side effects / errors)
  AI 行为回放：管理台时间线视图（工具调用 / 确认决策 / 副作用 / 错误）

**Three Ends / 三端**

- Flutter main app: event calendar, todos, notification center, global search, upload, profile, Onboarding, offline cache, data visualization, first-run experience pack
  Flutter 主 App：事件日历、待办、通知中心、全局搜索、上传、个人中心、Onboarding、离线缓存、数据可视化、首次体验三件套
- Taro mini-program/H5: AI chat, todos, search, notification center, session management
  Taro 小程序/H5：AI 对话、待办、搜索、通知中心、会话管理
- PC Web admin console: users/events/knowledge/notifications/both audits/sessions/monitoring/trash/import/template market/AI eval/tool effects/platform stats
  PC Web 管理台：用户/事件/知识库/通知/两类审计/会话/监控/回收站/导入/模板市场/AI 评测/工具副作用/平台统计

**Security & Compliance / 安全与合规**

- CASL row-level permissions, JWT rotation + login lockout, email/phone verification, AES-256-GCM static encryption of sensitive fields
  CASL 行级权限、JWT 轮换 + 登录锁定、邮箱/手机号验证、敏感字段 AES-256-GCM 静态加密
- Operation audit + AI audit + confirmation-decision audit, admin-side data masking (privacy red line)
  操作审计 + AI 审计 + 确认决策审计，管理端数据脱敏（隐私红线）
- Enumeration/timing-attack protection, SSRF protection, OAuth signature verification, tightened production CORS, upload magic-byte validation
  防枚举/防时序、SSRF 防护、OAuth 验签、CORS 生产收紧、上传魔数校验

**Platform Capabilities / 平台能力**

- Low-code forms (JSON Schema dynamic rendering), plugin mechanism, template market, data import/migration
  低代码表单（JSON Schema 动态渲染）、插件机制、模板市场、数据导入迁移
- Notification center (SSE realtime + push abstraction), dynamic config center, soft-delete trash
  通知中心（SSE 实时 + 推送抽象层）、动态配置中心、软删除回收站
- Scheduled-task framework, feature flags, unified error codes + i18n
  定时任务框架、特性开关、统一错误码 + i18n

**Engineering & Ops / 工程化与运维**

- GitHub Actions CI: lint / unit / e2e / coverage thresholds / migration consistency / three-end builds
  GitHub Actions CI：lint / 单测 / e2e / 覆盖率门槛 / 迁移一致性 / 三端构建
- One-click deploy, single-container `docker run` full-stack delivery, offline/air-gapped deploy, on-prem AI (Ollama)
  一键部署、单容器 `docker run` 全栈交付、离线/内网部署、私有化 AI（Ollama）
- OTel tracing, Prometheus alerts, Loki logs, alert webhooks, ops health inspection
  OTel 链路追踪、Prometheus 告警、Loki 日志、告警 Webhook、运维健康巡检
- Data backup/restore, sqlite/postgres dual migration baselines, module manifest & dependency graph
  数据备份/恢复、sqlite/postgres 双迁移基线、模块清单与依赖图谱

### Fixed / 修复

- Initial release — no prior fix history; security/deployment hardening is tracked in git history and the DEP/CR series of the internal roadmap.
  初始版本，无历史修复记录；安全/部署硬伤治理见 git history 与项目内部 roadmap 的 DEP/CR 系列。
