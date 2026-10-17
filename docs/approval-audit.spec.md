# Approval Into Audit — approval 旗舰审批入审计（A-7 收尾）

> 规格文档：approval 旗舰审批入审计。日期：2026-09-01。

## 1. 问题

approval 旗舰的审批动作（`POST /approval/requests/:id/decide` 人工通过/驳回、`/review` AI 预审复核）走全局 OperationAuditInterceptor，但被误记为资源创建：

- action 派生：POST → `CREATE`（实际是审批决策，非创建）
- businessEvent：`ApprovalRequestCreated`（实际是 Approved/Rejected/Reviewed）

「审批即 Business Action 证据」语义失真——审计/B4 视图看不到「谁批准/驳回了什么」。

## 2. 方案

OperationAuditInterceptor 对 approval 审批动作做语义特例（拦截器有 `req.body.decision`，不污染纯 path+method 的 `deriveBusinessEvent`）：

| 端点 | action | businessEvent |
|------|--------|--------------|
| POST `/approval/requests/:id/decide` body {decision:'approved'} | `DECIDE` | `ApprovalRequestApproved` |
| POST `/approval/requests/:id/decide` body {decision:'rejected'} | `DECIDE` | `ApprovalRequestRejected` |
| POST `/approval/requests/:id/decide`（decision 缺失/非法） | `DECIDE` | `ApprovalRequestDecided` |
| POST `/approval/requests/:id/review` | `REVIEW` | `ApprovalRequestReviewed` |

- 改动：`operation-audit.interceptor.ts` `_deriveAction` 加 decide/review 特例；`intercept` businessEvent 行改 `_deriveApprovalBusinessEvent(...) ?? deriveBusinessEvent(...)`
- 其余模块审计不受影响（正则限定 `/approval/requests/:id/`）
- **取值单一来源（2026-10-17 修）**：裁决词表 = `approval-request.entity.ts` 的 `APPROVAL_DECISIONS`（`approved` / `rejected`），DTO 校验、服务入参与本拦截器共用。初版本文档与拦截器测试写的是 `approve` / `reject`（接口根本不接受的形状）⇒ 真实请求恒落 `ApprovalRequestDecided`，测试常绿。现由 `operation-audit.interceptor.spec.ts` 的「共享裁决词表与 wire 契约一致」用例钉死。

## 3. 复用现状

approval 请求创建/政策 CRUD 仍走通用审计 + businessEvent（ApprovalRequestCreated/Updated）；AI 预审（AI tools）已走 ai_audit_logs；A-7 审批链可视化已联用户表。本项只修审批决策的语义。

## 4. 测试

- operation-audit.interceptor.spec：decide approved/rejected → DECIDE + Approved/Rejected；review → REVIEW + Reviewed；另有「共享裁决词表与 wire 契约一致」用例
- approval.e2e-spec（2026-10-17 补）：真实 HTTP `review` → `decide`，随后读 `operation_audit_logs` 成对断言——裁决前**无** DECIDE 行；裁决后有 `DECIDE` + `ApprovalRequestApproved` / `ApprovalRequestRejected`、`featureKey`、`userId`、`targetId`、`statusCode`、`requestBody`；`review` 另有 `REVIEW` + `ApprovalRequestReviewed`
- 全量回归确认拦截器改动不破坏其它模块审计

## 5. 相关

- [audit-lifecycle-elsteps.spec.md](audit-lifecycle-elsteps.spec.md) — A-3 生命周期
- [audit-authz-snapshot.spec.md](audit-authz-snapshot.spec.md) — A-5 放行快照
- [adversarial-proof.md](benchmark/adversarial-proof.md) — Gate 2 证据链
