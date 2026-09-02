# KeelBase 产品语言词汇表（v0.1）

> **目的**：统一 README / 文档 / CLI / 管理台 / 工作台的核心术语，让「60 秒看懂、10 分钟运行、30 分钟创造」成立——用户在不同入口看到同一件事用同一个词。
> **使用规则**：对外文档与 UI 一律用「对外标准词」；代码与内部文档可用「内部实现词」；本文表内给出映射。
> **v0.1**：先固化核心概念，识别主要分歧；W1 收口前按此表回改 UI/文档。

---

## 1. 定位与一句话

| 场景 | 标准用语 |
|---|---|
| 对外一句话（README/官网/视频） | **Open-source Business-safe AI Runtime** —— 让 AI Agent 在权限、确认、审计、可撤销的约束下，安全进入真实业务系统，并支持私有化部署 |
| 扩展名（logo alt / 英文文档首提） | Enterprise AI Trust Runtime（作为 Business-safe AI Runtime 的同义扩展名） |
| 中文通俗句 | 让 AI 不只是会回答，而是能够安全地做事 |

> **分歧处理**：README 首行「Build and Run Business-safe AI Applications」与第 9 行「Open-source Enterprise AI Trust Runtime」并存——统一为「Business-safe AI Runtime」为主名，Trust Runtime 为强调「信任层」时的替代，不再并列混用。

---

## 2. 核心概念词汇表

| 对外标准词（EN） | 中文 | 内部实现词 | 定义与使用场景 |
|---|---|---|---|
| **Business-safe AI Runtime** | 业务安全 AI 运行时 | `Server-NestJS` | 产品本体；AI 与业务系统之间的信任层 |
| **Application Protocol** | 应用协议 | `module-protocol` | 描述业务模块的语义源（AI 可读，AI 生成普通源代码） |
| **Governance** | 治理 | `governance` | AI 执行前的策略控制总称 |
| **Governance Console** | 治理控制台 | `governance-sidecar` / Guard | 独立治理台，一个控制面管多系统 AI（对外叙事） |
| **Policy** | 策略 | `governance-policy` | 工具启用 / 确认 / 角色白名单，实时生效 |
| **Tool** | 工具 | `ai/tools` / ToolRegistry | AI 可调用的业务操作 |
| **Risk level** | 风险分级 | R0-R5 | 工具执行策略（读自动 / 写确认 / 阻断） |
| **Confirmation** | 确认 | `confirmation` | 写操作需人工确认（R3） |
| **Approval** | 审批 | R4 `human_approval` | 高影响动作双人审批 |
| **Revoke** | 撤销 | `tool-effects` revoke | AI 写副作用可撤销 |
| **Audit** | 审计 | `audit` / `ai_audit_logs` | AI 操作记录 |
| **Audit Hash Chain** | 审计哈希链 | `audit-chain` | 篡改即断链的防篡改证据链 |
| **Decision Trace** | 决策轨迹 | `decision-trace` | 单次 AI 动作完整链：请求→意图→工具→权限→审批→执行→审计 |
| **AI Action Log** | AI 行为记录 | `ai-timeline` / audit logs | AI 操作的历史列表（谁/何时/做了什么） |
| **Business Action** | 业务动作 | `businessAction` | AI 在业务系统里完成的动作（如创建跟进任务） |
| **Business Action Detail** | 业务动作详情 | `workbenchActionDetail` | 单次业务动作的完整治理视图（Who/What/Why/Result/副作用/完整性） |
| **AI Assistant** | AI 助手 | `aiAssistant` / Copilot | 用户与 AI 对话的入口（通用词） |
| **System AI Assistant** | 系统 AI 助手 | `navSystemAssistant` / admin-ai | 管理台的平台级 AI 助手（平台能力/治理/导航） |
| **Side Effect** | 副作用 | `tool-effects` | AI 写操作产生的可撤销业务变更 |
| **Evidence Package** | 审计证据包 | `ActionReportExport` | 可提交审计机构的合规证据（哈希链 + 签名 + 离线可验证） |
| **Authorization** | 授权 | CASL / `authorization` | 谁可以对什么做什么（含数据范围） |
| **Data Scope** | 数据范围 | CASL conditions | 本人 / 组织 / 部门的数据边界 |
| **Zero-code Adoption** | 零代码接入 | sidecar | 业务系统 LLM 地址指向即接入治理 |

---

## 3. 关键分歧与统一决定（重点）

| # | 分歧 | 现状 | 统一决定 |
|---|---|---|---|
| 1 | **AI 助手 vs Copilot** | 管理台「系统 AI 助手」；工作台「AI 助手」；CRM/PM 业务页「Copilot」 | 对外统一「**AI 助手**」（用户入口）；「系统 AI 助手」专指管理台平台级；**Copilot 废弃**，业务页文案回改为「AI 助手」 |
| 2 | **决策轨迹 vs 行为回放** | 「决策轨迹」（decisionTrace，单次链路）与「AI 行为回放」（navAiTimeline，历史列表）语义混用 | 明确区分：**决策轨迹 = 单次动作的完整链路**（点进某次看）；**AI 行为记录 = 历史列表**（列表视图）。「行为回放」作为管理台列表入口名保留，但内容强调「记录 + 可点开决策轨迹」 |
| 3 | **治理台 vs Guard** | 导航「安全治理 / Guard Overview / 治理总览」混用；文档用「治理台 / Governance Console」 | 对外统一「**治理**」域：导航用「治理」（域）→「治理总览」（Guard Overview）；独立部署叫「**治理控制台**（Governance Console）」；Guard 仅作内部代码/文档词 |
| 4 | **定位句** | README 主名与 alt 混用 Business-safe AI Runtime / Enterprise AI Trust Runtime | 主名统一「Business-safe AI Runtime」，Trust Runtime 仅作强调层时的替换 |
| 5 | **审计 vs 治理** | 「AI 审计」（记录）与「治理」（控制）偶有混用 | 明确边界：**治理 = 做之前控制**（策略/确认/审批）；**审计 = 做了之后留痕**（记录/哈希链/证据包）。对外文案避免「治理审计」连用 |

---

## 4. 待办（W1 收口前）

- [x] 按第 3 节回改 UI 文案：业务页 Copilot → AI 助手（copilotTitle=「AI 助手」/ 业务按钮=「AI 分析」）；导航 Guard → 治理（navGuard=「安全治理」/ navGuardOverview=「治理总览」）——**2026-09-01 已收口**：用户可见文案统一；CrmCopilotDrawer.vue 组件名 / CopilotItem 类型 / copilot-* class 等内部标识符保留（非用户可见，不重构）
- [ ] 按第 2 节校对 README 与快速开始文档术语
- [ ] 词汇表 v0.1 定稿后建英文版 + README 登记（双语配对）

---

*v0.1 初稿 · 2026-09-01 · 统一产品语言（P0-4）*
