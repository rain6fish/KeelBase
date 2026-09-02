# Approval Into Audit — approval 旗舰审批入审计（A-7 收尾）

> 规格文档。对应 roadmap「approval 旗舰审批入审计」。日期：2026-09-01。

## 1. 问题

approval 旗舰的审批动作（`POST /approval/requests/:id/decide` 人工通过/驳回、`/review` AI 预审复核）走全局 OperationAuditInterceptor，但被误记为资源创建：

- action 派生：POST → `CREATE`（实际是审批决策，非创建）
- businessEvent：`ApprovalRequestCreated`（实际是 Approved/Rejected/Reviewed）

「审批即 Business Action 证据」语义失真——审计/B4 视图看不到「谁批准/驳回了什么」。

## 2. 方案

OperationAuditInterceptor 对 approval 审批动作做语义特例（拦截器有 `req.body.decision`，不污染纯 path+method 的 `deriveBusinessEvent`）：

| 端点 | action | businessEvent |
|------|--------|--------------|
| POST `/approval/requests/:id/decide` body {decision:'approve'} | `DECIDE` | `ApprovalRequestApproved` |
| POST `/approval/requests/:id/decide` body {decision:'reject'} | `DECIDE` | `ApprovalRequestRejected` |
| POST `/approval/requests/:id/decide`（decision 缺失） | `DECIDE` | `ApprovalRequestDecided` |
| POST `/approval/requests/:id/review` | `REVIEW` | `ApprovalRequestReviewed` |

- 改动：`operation-audit.interceptor.ts` `_deriveAction` 加 decide/review 特例；`intercept` businessEvent 行改 `_deriveApprovalBusinessEvent(...) ?? deriveBusinessEvent(...)`
- 其余模块审计不受影响（正则限定 `/approval/requests/:id/`）

## 3. 复用现状

approval 请求创建/政策 CRUD 仍走通用审计 + businessEvent（ApprovalRequestCreated/Updated）；AI 预审（AI tools）已走 ai_audit_logs；A-7 审批链可视化已联用户表。本项只修审批决策的语义。

## 4. 测试

- operation-audit.interceptor.spec：decide approve/reject → DECIDE + Approved/Rejected；review → REVIEW + Reviewed（3 新增，15/15 全过）
- 全量回归确认拦截器改动不破坏其它模块审计

## 5. 相关

- [audit-lifecycle-elsteps.spec.md](audit-lifecycle-elsteps.spec.md) — A-3 生命周期
- [audit-authz-snapshot.spec.md](audit-authz-snapshot.spec.md) — A-5 放行快照
- [adversarial-proof.md](benchmark/adversarial-proof.md) — Gate 2 证据链
