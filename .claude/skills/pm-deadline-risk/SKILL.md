---
name: pm-deadline-risk
description: AI Project Management 旗舰——项目延期风险规则（逾期任务/里程碑/风险打分）。从旗舰应用拆出的可复用业务 Skill（Phase 2 生态）。
---

# 项目延期风险 / Deadline Risk

从 AI Project Management 旗舰应用（`src/pm/`）拆出的业务规则 Skill。当用户需要「判断项目是否会延期 / 项目风险等级」时使用。

## 数据来源

- `PmTask`：任务，逾期未完成（status != completed 且 dueDate 已过）
- `PmMilestone`：里程碑，dueDate 已过未达成
- `PmRisk`：未解决风险记录

## 打分公式 / Scoring

| 触发 | 加分 |
|------|------|
| 逾期任务 | +2 |
| 延期里程碑 | +3 |
| 未解决风险 | +2 |

## 分级阈值 / Tiers

| 总分 | 等级 |
|------|------|
| ≥ 6 | `high` |
| ≥ 3 | `medium` |
| < 3 | `low` |

## 落地 API / AI 工具

- 读工具：`analyze_project_risk`（返回 level/score/reasons）
- 写工具：`create_project_task`（需确认 + 副作用可撤销）
- 演示：判断项目延期风险 → AI 建任务 → 通知负责人
