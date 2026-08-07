# 通用操作审计（PL-2）功能规格

## 1. 概述

记录用户写操作（who/when/what），便于合规追溯。由全局 `OperationAuditInterceptor` 自动捕获所有 POST/PATCH/PUT/DELETE 请求，无需侵入各业务 service。

## 2. 数据模型

`operation_audit_logs` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | |
| userId | int | 操作者（登录/注册前可能为 null） |
| action | varchar(32) | CREATE/UPDATE/DELETE/LOGIN/LOGOUT/UPLOAD |
| method | varchar(8) | HTTP 方法 |
| path | varchar(255) | 请求路径（去 query） |
| targetId | varchar(64) | 从路径参数提取（如 /events/123 → 123） |
| requestBody | text | 请求体 JSON（截断 2000 字符） |
| ip | varchar(64) | 来源 IP |
| userAgent | varchar(255) | UA（截断 255） |
| statusCode | int | 响应状态码 |
| createdAt | datetime | |

index：`userId + createdAt`。

## 3. 捕获规则

| 规则 | 说明 |
|------|------|
| 触发 | POST/PATCH/PUT/DELETE 自动记录；GET 不记录 |
| action 推导 | POST→CREATE、PATCH/PUT→UPDATE、DELETE→DELETE；`/auth/login`→LOGIN、`/auth/logout`→LOGOUT、`/upload`→UPLOAD |
| @SkipAudit() | 排除端点：`/auth/refresh`、`/auth/forgot-password`、`/auth/reset-password`、`/auth/verify-email`、`/auth/resend-verification`、notifications 的 PATCH/DELETE（幂等读操作）、AI chat/stream/insights（已被 AI 审计覆盖） |
| 失败静默 | 审计落库失败不影响业务请求（service 内部 try/catch + 拦截器 `.catch()` 双重兜底） |
| 异步 | `tap()` fire-and-forget，不阻塞响应 |

## 4. API 规格（admin-only）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | /api/v1/audit/operations/logs?page=&limit=&userId= | admin | 分页查询审计日志，可按 userId 过滤 |
| GET | /api/v1/audit/operations/stats | admin | 按 action 分组的计数统计 |

端点用 `@CheckPolicies(manage all)`（CASL 管理员权限），普通用户 403。

## 5. 测试

- 后端单测：service 4 用例（落库截断/失败静默/分页/过滤/统计分组）、interceptor 5 用例（写方法记录/GET 跳过/@SkipAudit 跳过/失败不阻塞/targetId 提取）
- 后端 e2e：3 用例（普通用户 403、写操作产生日志、stats 返回分组）
