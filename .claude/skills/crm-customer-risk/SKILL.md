---
name: crm-customer-risk
description: AI CRM 旗舰——客户风险分析规则（打分公式 + 分级阈值）。从旗舰应用拆出的可复用业务 Skill（Phase 2 生态）。
---

# CRM 客户风险分析 / Customer Risk Scoring

从 AI CRM 旗舰应用（`src/crm/`）拆出的业务规则 Skill。当用户需要「判断哪些客户值得跟进 / 客户风险等级」时使用。

## 数据来源

- `CrmOrder`：金额（amount）、状态（pending/paid/overdue）、截止日（dueDate）
- `CrmTask`：跟进任务，逾期未完成
- `CrmRisk`：未解决风险记录

## 打分公式 / Scoring

| 触发 | 加分 |
|------|------|
| 订单逾期且金额 > 100 万 | +5 |
| 订单逾期（任意金额） | +3 |
| 订单总额 > 50 万 | +2 |
| 未解决风险记录 | +2 |
| 逾期跟进任务 | +2 |

## 分级阈值 / Tiers

| 总分 | 等级 | 动作 |
|------|------|------|
| ≥ 10 | `critical` | 立即人工跟进 |
| ≥ 6 | `high` | AI 建议建跟进任务 |
| ≥ 3 | `medium` | 观察 |
| < 3 | `low` | 常规维护 |

## 落地 API / AI 工具

- 读工具：`analyze_customer_risk`（返回 level/score/reasons/dataPoints）
- 写工具：`create_followup_task`（需确认 + 副作用可撤销）
- 演示：登录问「哪些客户本周最值得跟进？」→ AI 分析 → 建议建跟进任务
