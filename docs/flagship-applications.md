# KeelBase 三旗舰应用规格化 / Flagship Applications Specification

> 本文把三个旗舰应用（AI CRM / AI Project Management / AI Approval）的**完整规格**固化为一站式参考：数据模型、API、AI 工具、治理、Seed、演示路径、多端 UI。
> 用途：① 作为 `keelbase init` / Protocol 反推的规格蓝本；② 作为 Phase 1 旗舰验证（Golden Demo / 30min 验收）的核对清单；③ 对外展示「业务安全的 Agent 应用」如何构成。
>
> This document freezes the full spec of the three flagship applications (AI CRM / AI Project Management / AI Approval): data model, API, AI tools, governance, seed, demo path, multi-end UI. It serves as the spec blueprint for `keelbase init` / Protocol reverse-engineering, the checklist for Phase-1 flagship validation, and the external showcase of "business-safe agent applications".

---

## 0. 三旗舰概览 / Overview

三旗舰已从「验证平台能力的 Demo」升级为 **KeelBase 的 Reference Applications**（2026-08-19 定位）：它们共同证明 **AI 能在权限 / 确认 / 审计 / 撤销约束下完成真实业务工作**，且沿同一可复用模式构建：实体 → 迁移 → CRUD/CASL → AI 工具（读 + 写需确认）→ Seed → 多端 UI。

**AI 角色差异化（2026-08-19）**：三旗舰不是「三个 CRUD Demo」，而是三类 AI 工作方式的 Reference——**CRM = AI Operator（替用户执行）**、**PM = AI Collaborator（与用户协作）**、**Approval = AI Decision Assistant（辅助决策）**。对外故事按此讲，避免「带 AI Tool Calling 的企业 CRUD」认知。

| | **AI CRM** | **AI Project Management** | **AI Approval** |
|---|---|---|---|
| AI 角色 | **AI Operator**（找风险客户 → 建任务替用户干活） | **AI Collaborator**（判断延期 → 与用户协作推进） | **AI Decision Assistant**（按政策预审 → 建议/人工复核） |
| 业务 | 客户 / 订单 / 跟进 / 任务 / 风险 | 项目 / 成员 / 里程碑 / 任务 / 风险 | 审批请求 + 审批政策（AI 预审） |
| 实体 | Customer/Order/Activity/Task/Risk | Project/Member/Milestone/Task/Risk | ApprovalRequest/ApprovalPolicy |
| 读工具 | query_customers / query_customer_orders / query_customer_activities / analyze_customer_risk | query_projects / query_project_tasks / analyze_project_risk | query_approval_requests / query_approval_policies |
| 写工具 | create_followup_task（确认+可撤销） | create_project_task（确认+可撤销） | submit_approval_request（确认+可撤销） |
| 深度治理 | 风险打分（逾期/金额/未解决） | 风险打分（逾期任务/里程碑） | **AI 预审按政策分级 + 人工复核** |
| feature flag | `crm` | `pm` | `approval` |
| 多端 UI | Flutter + Web 工作台 | Flutter + Web 工作台 | Flutter + Web 工作台 |

**三旗舰演示路径 / Demo Paths**：

- **CRM**：找风险客户 → AI 建跟进任务 → 用户确认 → 执行 → 审计 → 可撤销
- **PM**：判断项目延期风险 → 找原因 → AI 建任务 → 通知负责人
- **Approval**：提交报销 → AI 预审按政策分级 → 低风险自动通过 / 高风险转人工复核

---

## 1. AI CRM

### 1.1 数据模型 / Data Model（`src/crm/`）

| 实体 | 关键字段 | 说明 |
|------|---------|------|
| `CrmCustomer` | id / name / email / phone / company / status(`lead`\|`active`\|`inactive`) / riskLevel(`low`\|`medium`\|`high`) / notes / userId | 客户主表；userId 归属隔离 |
| `CrmOrder` | id / customerId / amount / status(`pending`\|`paid`\|`overdue`) / orderDate / dueDate / userId | 订单，逾期用于风险打分 |
| `CrmActivity` | id / customerId / type(`call`\|`meeting`\|`email`\|`note`) / summary / happenedAt / userId | 跟进记录 |
| `CrmTask` | id / customerId / title / status / dueDate / userId | 跟进任务（软删） |
| `CrmRisk` | id / customerId / level / reason / resolved / userId | 风险记录 |

### 1.2 API（`/api/v1/crm/*`，CASL + feature flag `crm`）

- `POST/GET/PATCH/DELETE /customers`（列表含 status/riskLevel/keyword 筛选）
- `GET /customers/:id`（详情聚合订单/跟进/任务/风险）、`GET /customers/:id/analyze`（风险分析）
- 子资源：`/customers/:id/orders|activities|tasks|risks`（CRUD）+ `/tasks/:id/complete`

### 1.3 AI 工具（注册进 AiModule）

| 工具 | 读/写 | 治理 |
|------|-------|------|
| `query_customers` | 读 | userId 范围 |
| `query_customer_orders` | 读 | 本人客户 |
| `query_customer_activities` | 读 | 本人客户 |
| `analyze_customer_risk` | 读 | 本人客户；风险打分 |
| `create_followup_task` | 写 | 需确认 + 副作用 `crm_task` 可撤销 |

### 1.4 风险打分 / Risk Scoring

逾期 >100 万 +5 / 逾期 +3 / 订单总额 >50 万 +2 / 未解决风险 +2 / 逾期任务 +2 → `critical≥10 / high≥6 / medium≥3`。

### 1.5 Seed & 演示

`npm run seed:demo` 种 8 客户 + 逾期订单 + 风险。登录问「哪些客户本周最值得跟进？」→ AI 分析风险 → 建议建跟进任务。

---

## 2. AI Project Management

### 2.1 数据模型 / Data Model（`src/pm/`）

| 实体 | 关键字段 |
|------|---------|
| `PmProject` | id / name / description / status(`planning`\|`active`\|`completed`) / riskLevel / endDate / userId |
| `PmMember` | id / projectId / userId / role(`owner`\|`member`) |
| `PmMilestone` | id / projectId / title / dueDate |
| `PmTask` | id / projectId / title / status / dueDate / userId |
| `PmRisk` | id / projectId / level / reason / userId |

### 2.2 API（`/api/v1/pm/*`，CASL + feature flag `pm`）

- `POST/GET/PATCH/DELETE /projects`（列表含 status/keyword 筛选）
- `GET /projects/:id`（详情聚合里程碑/任务/风险/成员数）、`GET /projects/:id/analyze`
- 子资源：`/projects/:id/members|milestones|tasks|risks` + `/tasks/:id/complete`

### 2.3 AI 工具

| 工具 | 读/写 | 治理 |
|------|-------|------|
| `query_projects` | 读 | userId 范围 |
| `query_project_tasks` | 读 | 本人项目 |
| `analyze_project_risk` | 读 | 本人项目；风险打分 |
| `create_project_task` | 写 | 需确认 + 副作用 `pm_task` 可撤销 |

### 2.4 风险打分 / Risk Scoring

逾期任务 +2 / 延期里程碑 +3 / 未解决风险 +2 → 分级同上。

### 2.5 Seed & 演示

Seed 种 4 项目 + 里程碑 + 延期任务。演示「判断项目延期风险 → AI 建任务 → 通知负责人」。

---

## 3. AI Approval

### 3.1 数据模型 / Data Model（`src/approval/`）

| 实体 | 关键字段 |
|------|---------|
| `ApprovalRequest` | id / title / amount / reason / status(`pending`\|`approved`\|`rejected`\|`needs_review`) / aiSuggestion / userId |
| `ApprovalPolicy` | id / name / threshold / autoApprove / role / userId |

### 3.2 API（`/api/v1/approval/*`，CASL + feature flag `approval`）

- `POST/GET/DELETE /requests`（列表含 status 筛选）、`GET /requests/:id`
- `POST /requests/:id/review`（AI 预审按政策分级）
- `POST /requests/:id/decide`（人工复核通过/驳回）
- `GET/POST/PATCH/DELETE /policies`

### 3.3 AI 工具（治理最深的旗舰）

| 工具 | 读/写 | 治理 |
|------|-------|------|
| `query_approval_requests` | 读 | userId 范围 |
| `query_approval_policies` | 读 | userId 范围 |
| `submit_approval_request` | 写 | 需确认 + 副作用 `app_request` 可撤销 |
| `review_approval_request` | 写 | **AI 预审**：按政策分级——金额≤阈值低风险自动通过 / 超阈值转人工复核（状态变更型不记副作用） |

### 3.4 演示闭环 / Demo（治理最完整）

提交报销 → AI 按政策预审（低风险自动通过 / 高风险 `needs_review`）→ 人工复核 decide → 全程审计 + 可撤销。

---

## 4. 三旗舰共性 → Protocol 反推 / Commonality → Protocol

三个旗舰暴露的**可复用模式**（已反推回 `keelbase init` 协议与生成器）：

| 共性 | 平台化结果 |
|------|-----------|
| 实体字段高度相似（entity/field/relation/permission） | **Application Protocol**（P0-9）一份 AI 可读 schema 描述应用 |
| 从 Protocol 生成实体/API/页面/权限/审计/工具/测试 | **Protocol → Code**（P0-10，keelbase init 自动附 AI 工具） |
| 写工具「确认 + 可撤销副作用」模式 | AiToolEffectsService + 确认流（HS-3/HS-6） |
| 风险打分 / 政策分级等业务规则 | 普通 service 逻辑，AI 工具复用 |
| 三旗舰即生态样板 | **Template 深化**（P1-9）：crm-demo / pm-demo / approval-demo 一键导入 |

---

## 5. 验证清单 / Validation Checklist（Phase 1）

每个旗舰按 [golden-demo-script.md](manual/golden-demo-script.md)（P0-3）+ [30min-acceptance.md](manual/30min-acceptance.md) 严格跑通：

- [ ] 60 秒演示闭环：AI Tool → Permission → Confirmation → Audit → Revoke
- [ ] 写工具确认后才执行，副作用可撤销
- [ ] 审计哈希链完整（HS-11）
- [ ] Private AI Golden Path（Cloud OFF → Ollama → 本地 RAG → 工具 → 确认 → 审计）
- [ ] `keelbase init --spec` 从旗舰协议生成新模块，编译 + 测试 + 迁移一致性通过
