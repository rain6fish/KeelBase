# 通用操作审计（PL-2）功能规格 / Generic Operation Audit (PL-2) Feature Specification

## 1. 概述 / 1. Overview

记录用户写操作（who/when/what），便于合规追溯。由全局 `OperationAuditInterceptor` 自动捕获所有 POST/PATCH/PUT/DELETE 请求，无需侵入各业务 service。

Records user write operations (who/when/what) for compliance tracing. The global `OperationAuditInterceptor` automatically captures all POST/PATCH/PUT/DELETE requests without intruding into each business service.

## 2. 数据模型 / 2. Data Model

`operation_audit_logs` 表：

The `operation_audit_logs` table:

| 字段 / Field | 类型 / Type | 说明 / Description |
|------|------|------|
| id | int PK | |
| userId | int | 操作者（登录/注册前可能为 null） / Operator (may be null before login/registration) |
| action | varchar(32) | CREATE/UPDATE/DELETE/LOGIN/LOGOUT/UPLOAD |
| method | varchar(8) | HTTP 方法 / HTTP method |
| path | varchar(255) | 请求路径（去 query） / Request path (query stripped) |
| targetId | varchar(64) | 从路径参数提取（如 /events/123 → 123） / Extracted from path params (e.g. /events/123 → 123) |
| requestBody | text | 请求体 JSON（截断 2000 字符） / Request body JSON (truncated to 2000 chars) |
| changes | text | A-1 字段级变更留痕（[{field,before,after}] JSON，截断 4000；敏感字段打码） / A-1 field-level change trail ([{field,before,after}] JSON, truncated to 4000; sensitive fields redacted) |
| businessEvent | varchar(128) | A-1 业务事件归一化（CustomerUpdated 等） / A-1 normalized business event (e.g. CustomerUpdated) |
| ip | varchar(64) | 来源 IP / Source IP |
| userAgent | varchar(255) | UA（截断 255） / UA (truncated to 255) |
| statusCode | int | 响应状态码 / Response status code |
| createdAt | datetime | |

index：`userId + createdAt`。

Index: `userId + createdAt`.

## 3. 捕获规则 / 3. Capture Rules

| 规则 / Rule | 说明 / Description |
|------|------|
| 触发 / Trigger | POST/PATCH/PUT/DELETE 自动记录；GET 不记录 / POST/PATCH/PUT/DELETE are recorded automatically; GET is not recorded |
| action 推导 / action derivation | POST→CREATE、PATCH/PUT→UPDATE、DELETE→DELETE；`/auth/login`→LOGIN、`/auth/logout`→LOGOUT、`/upload`→UPLOAD / POST→CREATE, PATCH/PUT→UPDATE, DELETE→DELETE; `/auth/login`→LOGIN, `/auth/logout`→LOGOUT, `/upload`→UPLOAD |
| @SkipAudit() | 排除端点：`/auth/refresh`、`/auth/forgot-password`、`/auth/reset-password`、`/auth/verify-email`、`/auth/resend-verification`、notifications 的 PATCH/DELETE（幂等读操作）、AI chat/stream/insights（已被 AI 审计覆盖） / Excluded endpoints: `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/resend-verification`, notifications PATCH/DELETE (idempotent read operations), AI chat/stream/insights (already covered by AI audit) |
| 失败静默 / Silent failure | 审计落库失败不影响业务请求（service 内部 try/catch + 拦截器 `.catch()` 双重兜底） / Audit write failure does not affect the business request (double fallback: try/catch inside the service + `.catch()` in the interceptor) |
| 异步 / Async | `tap()` fire-and-forget，不阻塞响应 / `tap()` fire-and-forget; does not block the response |
| A-1 字段 diff | PATCH/PUT 对可解析资源执行前查 before 快照，落 `changes`（敏感字段打码；无快照退化记录 after 值）；`businessEvent` 统一业务语言 / A-1 field diff: for PATCH/PUT on resolvable resources, query a before snapshot before execution and write `changes` (sensitive fields redacted; without a snapshot falls back to recording after values); `businessEvent` normalizes the business language |

## 4. API 规格（admin-only）/ 4. API Specification (admin-only)

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| GET | /api/v1/audit/operations/logs?page=&limit=&userId= | admin | 分页查询审计日志，可按 userId 过滤 / Paginated audit log query, filterable by userId |
| GET | /api/v1/audit/operations/stats | admin | 按 action 分组的计数统计 / Counts grouped by action |

端点用 `@CheckPolicies(manage all)`（CASL 管理员权限），普通用户 403。

Endpoints use `@CheckPolicies(manage all)` (CASL admin permission); regular users get 403.

## 5. 测试 / 5. Tests

- 后端单测：service 4 用例（落库截断/失败静默/分页/过滤/统计分组）、interceptor 5 用例（写方法记录/GET 跳过/@SkipAudit 跳过/失败不阻塞/targetId 提取）
  Backend unit tests: 4 service cases (persist truncation / silent failure / pagination / filtering / stats grouping), 5 interceptor cases (write-method recording / GET skip / @SkipAudit skip / failure does not block / targetId extraction)
- 后端 e2e：3 用例（普通用户 403、写操作产生日志、stats 返回分组）
  Backend e2e: 3 cases (regular user 403, write operations produce logs, stats returns groupings)
