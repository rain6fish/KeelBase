# KeelBase Flagship Applications Specification

> This document freezes the **full spec** of the three flagship applications (AI CRM / AI Project Management / AI Approval) as a one-stop reference: data model, API, AI tools, governance, seed, demo path, multi-end UI.
> Purpose: ① the spec blueprint for `keelbase init` / Protocol reverse-engineering; ② the checklist for Phase-1 flagship validation (Golden Demo / 30-min acceptance); ③ the external showcase of how "business-safe agent applications" are composed.

---

## 0. Overview

The three flagships have evolved from "demos proving platform capability" into **KeelBase's Reference Applications** (positioning 2026-08-19): together they prove **AI can do real business work under permission / confirmation / audit / revocation constraints**, and they are built along one reusable pattern: entity → migration → CRUD/CASL → AI tools (read + write-with-confirmation) → seed → multi-end UI.

**AI role differentiation (2026-08-19)**: the three flagships are not "three CRUD demos" but references for three ways AI works — **CRM = AI Operator (executes for the user)**, **PM = AI Collaborator (works with the user)**, **Approval = AI Decision Assistant (aids decisions)**. The external story follows these roles, avoiding the "enterprise CRUD with AI tool calling" perception.

| | **AI CRM** | **AI Project Management** | **AI Approval** |
|---|---|---|---|
| AI role | **AI Operator** (find at-risk customers → create tasks on the user's behalf) | **AI Collaborator** (detect delays → collaborate to move forward) | **AI Decision Assistant** (pre-review by policy → suggest / human review) |
| Business | Customers / orders / follow-ups / tasks / risks | Projects / members / milestones / tasks / risks | Approval requests + approval policies (AI pre-review) |
| Entities | Customer/Order/Activity/Task/Risk | Project/Member/Milestone/Task/Risk | ApprovalRequest/ApprovalPolicy |
| Read tools | query_customers / query_customer_orders / query_customer_activities / analyze_customer_risk | query_projects / query_project_tasks / analyze_project_risk | query_approval_requests / query_approval_policies |
| Write tools | create_followup_task (confirmation + revocable) | create_project_task (confirmation + revocable) | submit_approval_request (confirmation + revocable) |
| Deep governance | Risk scoring (overdue/amount/unresolved) | Risk scoring (overdue tasks/milestones) | **AI pre-review by policy tier + human review** |
| feature flag | `crm` | `pm` | `approval` |
| Multi-end UI | Flutter + Web workbench | Flutter + Web workbench | Flutter + Web workbench |

**Demo paths**:

- **CRM**: find at-risk customers → AI creates follow-up task → user confirms → execute → audit → revocable
- **PM**: judge project delay risk → find causes → AI creates tasks → notify owners
- **Approval**: submit reimbursement → AI pre-reviews by policy → low-risk auto-approve / high-risk → human review

---

## 1. AI CRM

### 1.1 Data Model (`src/crm/`)

| Entity | Key fields | Notes |
|------|---------|------|
| `CrmCustomer` | id / name / email / phone / company / status(`lead`\|`active`\|`inactive`) / riskLevel(`low`\|`medium`\|`high`) / notes / userId | Customer master table; userId ownership isolation |
| `CrmOrder` | id / customerId / amount / status(`pending`\|`paid`\|`overdue`) / orderDate / dueDate / userId | Orders; overdue feeds risk scoring |
| `CrmActivity` | id / customerId / type(`call`\|`meeting`\|`email`\|`note`) / summary / happenedAt / userId | Follow-up records |
| `CrmTask` | id / customerId / title / status / dueDate / userId | Follow-up tasks (soft-delete) |
| `CrmRisk` | id / customerId / level / reason / resolved / userId | Risk records |

### 1.2 API (`/api/v1/crm/*`, CASL + feature flag `crm`)

- `POST/GET/PATCH/DELETE /customers` (list with status/riskLevel/keyword filters)
- `GET /customers/:id` (detail aggregating orders/follow-ups/tasks/risks), `GET /customers/:id/analyze` (risk analysis)
- Sub-resources: `/customers/:id/orders|activities|tasks|risks` (CRUD) + `/tasks/:id/complete`

### 1.3 AI Tools (registered into AiModule)

| Tool | Read/Write | Governance |
|------|-------|------|
| `query_customers` | read | userId scope |
| `query_customer_orders` | read | own customers |
| `query_customer_activities` | read | own customers |
| `analyze_customer_risk` | read | own customers; risk scoring |
| `create_followup_task` | write | requires confirmation + side effect `crm_task` revocable |

### 1.4 Risk Scoring

Overdue >1M +5 / overdue +3 / total order value >500k +2 / unresolved risk +2 / overdue task +2 → `critical≥10 / high≥6 / medium≥3`.

### 1.5 Seed & Demo

`npm run seed:demo` seeds 8 customers + overdue orders + risks. Sign in and ask "which customers deserve follow-up this week?" → AI analyzes risk → suggests creating a follow-up task.

---

## 2. AI Project Management

### 2.1 Data Model (`src/pm/`)

| Entity | Key fields |
|------|---------|
| `PmProject` | id / name / description / status(`planning`\|`active`\|`completed`) / riskLevel / endDate / userId |
| `PmMember` | id / projectId / userId / role(`owner`\|`member`) |
| `PmMilestone` | id / projectId / title / dueDate |
| `PmTask` | id / projectId / title / status / dueDate / userId |
| `PmRisk` | id / projectId / level / reason / userId |

### 2.2 API (`/api/v1/pm/*`, CASL + feature flag `pm`)

- `POST/GET/PATCH/DELETE /projects` (list with status/keyword filters)
- `GET /projects/:id` (detail aggregating milestones/tasks/risks/member count), `GET /projects/:id/analyze`
- Sub-resources: `/projects/:id/members|milestones|tasks|risks` + `/tasks/:id/complete`

### 2.3 AI Tools

| Tool | Read/Write | Governance |
|------|-------|------|
| `query_projects` | read | userId scope |
| `query_project_tasks` | read | own projects |
| `analyze_project_risk` | read | own projects; risk scoring |
| `create_project_task` | write | requires confirmation + side effect `pm_task` revocable |

### 2.4 Risk Scoring

Overdue task +2 / delayed milestone +3 / unresolved risk +2 → tiers as above.

### 2.5 Seed & Demo

Seed seeds 4 projects + milestones + delayed tasks. Demo "judge project delay risk → AI creates tasks → notify owners".

---

## 3. AI Approval

### 3.1 Data Model (`src/approval/`)

| Entity | Key fields |
|------|---------|
| `ApprovalRequest` | id / title / amount / reason / status(`pending`\|`approved`\|`rejected`\|`needs_review`) / aiSuggestion / userId |
| `ApprovalPolicy` | id / name / threshold / autoApprove / role / userId |

### 3.2 API (`/api/v1/approval/*`, CASL + feature flag `approval`)

- `POST/GET/DELETE /requests` (list with status filter), `GET /requests/:id`
- `POST /requests/:id/review` (AI pre-review by policy tier)
- `POST /requests/:id/decide` (human review approve/reject)
- `GET/POST/PATCH/DELETE /policies`

### 3.3 AI Tools (the flagship with the deepest governance)

| Tool | Read/Write | Governance |
|------|-------|------|
| `query_approval_requests` | read | userId scope |
| `query_approval_policies` | read | userId scope |
| `submit_approval_request` | write | requires confirmation + side effect `app_request` revocable |
| `review_approval_request` | write | **AI pre-review**: by policy tier — amount ≤ threshold low-risk auto-approve / over threshold → human review (state-change type, no side effect recorded) |

### 3.4 Demo Loop (most complete governance)

Submit reimbursement → AI pre-reviews by policy (low-risk auto-approve / high-risk `needs_review`) → human review decide → full audit + revocable.

---

## 4. Commonality → Protocol

The **reusable patterns** the three flagships expose (already reverse-engineered into the `keelbase init` protocol and generator):

| Commonality | Platform outcome |
|------|-----------|
| Highly similar entity fields (entity/field/relation/permission) | **Application Protocol** (P0-9): one AI-readable schema describing an application |
| Generating entities/APIs/pages/permissions/audit/tools/tests from a Protocol | **Protocol → Code** (P0-10, `keelbase init` auto-attaches AI tools) |
| The "confirmation + revocable side effect" pattern for write tools | AiToolEffectsService + confirmation flow (HS-3/HS-6) |
| Business rules like risk scoring / policy tiering | Ordinary service logic, reused by AI tools |
| The three flagships as ecosystem blueprints | **Template deepening** (P1-9): crm-demo / pm-demo / approval-demo one-click import |

---

## 5. Validation Checklist (Phase 1)

Each flagship runs strictly per [golden-demo-script.md](manual/golden-demo-script.md) (P0-3) + [30min-acceptance-en.md](manual/30min-acceptance-en.md):

- [ ] 60-second demo loop: AI Tool → Permission → Confirmation → Audit → Revoke
- [ ] Write tools execute only after confirmation; side effects revocable
- [ ] Audit hash chain intact (HS-11)
- [ ] Private AI Golden Path (Cloud OFF → Ollama → local RAG → tool → confirmation → audit)
- [ ] `keelbase init --spec` generates a new module from a flagship protocol; compile + test + migration consistency pass
