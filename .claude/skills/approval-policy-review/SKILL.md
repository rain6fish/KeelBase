---
name: approval-policy-review
description: AI Approval 旗舰——审批政策分级预审规则（金额阈值 + 自动通过/转人工复核）。从旗舰应用拆出的可复用业务 Skill（Phase 2 生态）。
---

# 审批政策分级预审 / Policy-gated Review

从 AI Approval 旗舰应用（`src/approval/`）拆出的业务规则 Skill。当用户需要「审批请求该自动通过还是转人工复核」时使用。

## 数据来源

- `ApprovalPolicy`：审批政策（name / threshold / autoApprove / role）
- `ApprovalRequest`：审批请求（title / amount / reason / status）

## 预审规则 / Review Rules

对每个请求按匹配政策判断：

1. **金额 ≤ 政策 threshold 且 autoApprove** → 低风险，**自动通过**（`approved`）
2. **金额 > 政策 threshold** → 高风险，**转人工复核**（`needs_review`）
3. **无匹配政策** → 默认转人工复核

AI 预审产出 `aiSuggestion`（建议 + 理由），供人工复核参考。

## 落地 API / AI 工具

- 读工具：`query_approval_requests` / `query_approval_policies`
- 写工具：`submit_approval_request`（需确认 + 副作用可撤销）
- 预审：`review_approval_request`（AI 按政策分级，状态变更型不记副作用）
- 人工复核：`POST /approval/requests/:id/decide`
- 演示：提交报销 → AI 预审分级 → 低风险自动通过 / 高风险人工复核
