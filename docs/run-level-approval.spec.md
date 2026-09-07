# KB-5 计划级/批量确认（run-level approval）— 功能规格说明 (Spec) / KB-5 Run-level Approval (Plan-level / Batch Confirmation) — Functional Specification

> 版本 / Version: v0.1（Spec 定稿；实现排 1.1 发版前，Feature Freeze 纪律）
> 日期 / Date: 2026-09-07
> 状态 / Status: Spec 定稿（KB-5，roadmap §18.5，1.1 前置 gate）/ Spec locked (KB-5, roadmap §18.5, pre-1.1 gate). Implementation is a separate 1.1 task — this document fixes the protocol contract first.
> 定位 / Positioning: 响应 2026-09-07 对抗性评测命中「Human Confirmation 不可规模化」指控的**协议级设计**；与 KB-6（revokeClass，副作用撤销能力分档）分离、不冲突。

> 输入 / Based on：2026-09-07 做空报告（human-confirmation 规模化矛盾）+ 会话两轮评估校准 + 处置文档 KB-5 行（用户定案：**A 先行单轮聚合、B 跨轮计划协议列 Out、三端方向、Spec 先行不动代码**）。
> 关联 / Related：docs/ws-realtime.spec.md（确认流权威协议信封，§3.2/§5）｜docs/hs9-governance-policy.spec.md（R4 门控档位 §4）｜docs/ai-action-center.spec.md（NC-1 北极星，三端 UI 落地宿主）｜docs/failure-path-corpus.spec.md（KB-4）｜私库 roadmap §18.5 KB-5/KB-6。

---

## 1. 概述 / 1. Overview

### 1.1 问题 / 1.1 Problem

做空报告批评的规模化困境（当前现状）：
- AI 一次回复可能携带**多个写工具调用**（`accumulatedToolCalls` → for 循环逐个执行，`ai.service.ts` ~1271）；
- R3 写工具**逐个** `confirmation_request` → **逐个阻塞 await decision**（~1355）→ 前端同刻只见一张确认卡，逐卡确认、逐卡执行；
- 若 AI 要"为 200 个客户建跟进任务"，人被迫点 200 次；而若为省事做成"一键批 N 条且无 diff 摘要/风险分层"，人实际没在逐项确认 → **Trust 语义崩坏**（做空报告 Option A/B 二选一死结）。

现状已核实：后端无一键全批；管理端审批页逐行独立按钮；pending 硬过滤 R4。→ **KB-5 ①（审计现形反模式）结论 = 当前无无语义批量批准**，本 spec 是预防性 + 正向设计：批量授权**必须**带逐条 diff 摘要与风险分层，否则就是新的盲批反模式。

### 1.2 目标 / 1.2 Goal

把"一条 AI 回复里的多个需确认写动作"从「逐卡确认」演进为「**一计划批一次授权**」，且授权内容**人可读、风险分层、可逐条下钻**：
1. **一次授权 = 一个 run（计划批），非逐条**；
2. **run 卡展示逐条 diff 摘要 + 风险级**（"将创建/更新/删除什么 + 关键字段"），杜绝"一键批 N 条却无 diff"；
3. 逐条执行仍走既有审计/副作用链路（**逐条可撤销不变**，与 KB-6 revokeClass 无关——那是撤销能力档）；
4. 与现有**逐条即时确认（R3）完全兼容**：单写工具走原路径，不破坏存量契约。

### 1.3 范围分层（用户定案）/ 1.3 Scope tiers

| 层 | 内容 | 状态 |
|---|---|---|
| **A 单轮 run 聚合** | 同一轮 LLM 产出的多个需即时确认写工具 → 聚成一个 run 一次授权 | **本 spec 定稿**（1.1 实现） |
| **B 跨轮计划协议** | AI 先产结构化 Action Plan → 跨轮累积 → 整批授权 | Out（见 §6，防 1.1 膨胀） |
| 三端 UI | Web + Flutter + 管理台 R4 审批吃 run 语义 | spec 定契约；UI 完整落地随 NC-1 AI Action Center 迭代 |
| per-tool 摘要表 | run 卡"有 diff"的前提机制 | spec 定契约；实现随 A |

### 1.4 非目标 / 1.4 Non-goals

- ❌ 本轮不做跨轮/跨会话批量（B，§6）。
- ❌ 不改变 R4 异步审批的"第二人审批"语义（只扩展其可聚合展示）。
- ❌ 不做"会话级信任整批免确认"（HS-6 trustTool 语义不变，run 只作用于未被 trust 的动作）。
- ❌ 不引入分布式事务 / 跨系统强一致（KB 处置既定不做，N-4/N-6 边界不变）。
- ❌ run 授权**不等于**逐条动作的正确性背书（对齐 N-8：风险级不是业务正确性判定）。

---

## 2. A 方案：单轮 run 聚合 / 2. Plan A: Single-round Run Aggregation

### 2.1 触发条件 / 2.1 Trigger

在 `chatStreamImpl` 的流式工具执行段（`ai.service.ts` ~1271，`accumulatedToolCalls` 已收齐本轮全部 tool_call 之后、for 逐个执行**之前**）：

1. 扫描本轮需**即时人工确认**的写工具集合 `C`：
   - 判据 = `isWrite`（`_requiresConfirmation` 真）**且** `!(trustedTools.has(name))`（HS-6 本会话已信任则免确认，不并入）**且** 非 R4（`_requiresApproval` 为假）。
2. 若 `|C| ≥ 2` → **聚合为单个 run**，一次授权。
3. 若 `|C| == 1` → **保持现有逐条即时确认路径**（零行为变化，向后兼容）。
4. `|C| == 0` 且含 R4/R5 → R4 逐条提交异步审批、R5 逐条 block，均不并入（现状不变）。

> 边界：R4（异步、第二人审批）与 R3（本人即时）语义不同，**不混入同一 run**。R5（不可逆/高影响，直接 block）**永不并入 run**——它要求逐条策略级阻断。

### 2.2 计划风险级 / 2.2 Run risk tier

`runRisk = max over C of riskLevel[i]`（按 `RISK_STRATEGY` 的顺序等级取最高）。run 卡展示 runRisk 徽标 + 每行自身 riskLevel。
语义：一次 run 授权的风险 = 批内最高风险动作的风险；展示让授权人据此判断，非自动放行理由（N-8）。

### 2.3 SSE 事件载荷扩展 / 2.3 SSE event payload extension

权威类型定义在 `Server-NestJS/src/ai/interfaces/llm-provider.interface.ts`（`ConfirmationRequestData` L57-66、`ConfirmationDecisionData` L69-75）。本 spec 新增/扩展：

```
ConfirmationRequestData（扩展，向后兼容）
  token: string                          // run 的授权 token（一次授权对应一个 run token）
  toolName?: string                      // 单条模式保留（旧字段，run 模式可空或填 run 主动作）
  summary?: string                       // 单条模式保留
  arguments?: object                     // 单条模式保留
  authorization?: AuthorizationReasons
  mode?: 'immediate' | 'approval' | 'run'     // ← 新增 'run'
  run?: {                                // ← 新增（mode==='run' 时必有）
    runId: string                        // run 标识（可与 token 同或独立，实现择定）
    riskLevel: string                    // runRisk（批内最高）
    items: Array<{                       // 逐条 diff 摘要 —— run 卡的"有 diff"核心
      toolName: string
      summary: string                    // per-tool 摘要（§3），如"创建事件：产品评审（2026-09-08…）"
      riskLevel: string                  // 该动作自身风险级
      // 逐条执行结果经既有 tool_end / confirmation_decision 事件回传，不在此内联
    }>
  }
```

`ConfirmationDecisionData`（扩展）：run approve 后逐条执行各自发 `confirmation_decision{toolName, approved:true, ...}` + `tool_end`（**复用现有逐条事件**，前端无需新事件类型即知每动作结果）。另补一个 run 级确认 `confirmation_decision{mode:'run', runId, approved}` 标记整体结果。

WS 映射（`realtime/realtime.types.ts` L28-31）确认事件**透传 run 载荷**（`ai:confirmation_request` 帧 data 直接含上面对象）。SSE/WS 信封本身（ws-realtime.spec §3.2）不新增事件类型——**只扩展既有 confirmation_request/decision 的 payload**，最小侵入。

### 2.4 落库模型（约束，实现择定）/ 2.4 Persistence

现状 `ai_confirmation_requests`（token unique / toolName / args / operatorId / conversationId? / riskLevel / status / approverId / decidedAt）。

本 spec 给出的**约束**（不锁定实现是扩展列还是新 run 表）：
- run 授权须落一条持久记录（runId ↔ token ↔ status ↔ conversationId ↔ operatorId ↔ items JSON 快照），服务器重启/跨服务可查可裁决（对齐 R4 的 D2-1e 持久化原则）。
- **一次 run 授权 = 一组原子放行记录**：approve 的语义是"放行这组动作执行"，不是"这组动作都做对了"。每条动作执行仍逐条写 `tool_call`/`tool_confirmation` 审计 + 逐条副作用记录（可单独撤销，链路不变）。
- decline / timeout → 该组全部不执行（timeout 沿用现 TTL 语义）。
- run 记录与既有 R3/R4 单条记录可区分（`kind: 'single'|'run'` 判别或 runId 非空即 run，实现择定）。
- 审计语义：run 决策本身记一条 `tool_confirmation` 级审计（`detail: run(runId) N items → approve/decline`），逐条执行各自已有审计——**不引入新审计表**。

### 2.5 授权流程 / 2.5 Flow

```
AI 回复携带写工具 w1..wN（N≥2，均需即时确认 R3 级）
  ↓ 预扫描 C（2.1）
  ↓ 计算 runRisk（2.2）
  ↓ yield confirmation_request{mode:'run', run:{runId, riskLevel, items:[per-tool 摘要…]}}
前端 run 卡展示：N 动作逐条摘要 + 各自风险级 + runRisk 徽标
  ↓ 用户 approve（POST /ai/confirmations/:runToken approve）
run 记录置 approved
  ↓ for 逐条 _executeWriteTool(w1..wN)   // 复用现执行/审计/副作用链路
  ↓ 逐条 yield confirmation_decision + tool_end
  ↓ 全部完成（或其中失败——逐条失败如实上报，不影响其他条，对齐 failure-path 语义）
用户 decline / 超时 → 整批跳过（逐条发 declined 决策）
```

---

## 3. per-tool 摘要表机制 / 3. Per-tool Summarizer Registry

### 3.1 问题 / 3.1 Problem

run 卡"有 diff 而非盲批"的**前提**是每个动作能被转成人类可读的"将做什么"。现状 `summarizeWriteTool`（`ai.service.ts` L1556-1585）是 **AiService 私有 hardcode switch**；`AiTool` 接口（`tool.interface.ts` L118-137）无 summary 字段。单卡场景够用，但 run 卡要**逐条、可扩展、非 AiService 私有**。

### 3.2 设计 / 3.2 Design

给 `AiTool` 增加可选方法 `summarize?(args: Record<string, unknown>): string`（或等价 per-tool 注册表，实现择定），由各写工具自带"参数 → 人读摘要"（如 create-event.tool 返回 `创建事件：title（startTime 至 endTime）`）。`summarizeWriteTool` 改为**优先查工具自身 summarize，未命中回落现 hardcode 表，再回落 `'执行写操作：<toolName>'`**。

### 3.3 诚实边界 / 3.3 Honesty boundary

- 未实现 `summarize` 的动作，run 卡标注 **「该动作无法预读摘要 → 需单独确认」，不并入 run**（该条退回单条即时确认）。**宁可不聚合，不盲批**——这是 run-level 的信任底线。
- 逐条 diff 最小展示集（对齐做空批评的"人到底确认了什么"）：动作类型（创建/更新/删除/提交）+ 目标 title + 关键字段（时间/状态/金额/对象名）。实现可先覆盖旗舰写工具（create_event / create_todo / create_followup_task / create_customers / update_customer_status / create_contract 等已 hardcode 的），其余按 3.3 降级单独确认。

---

## 4. 三端消费契约（方向契约）/ 4. Three-surface Consumption Contract

> UI 完整落地随 NC-1（AI Action Center 北极星）迭代；本 spec 固定"run 事件怎么被消费"的契约，避免三端实现时各自造语义。以下为各端**需最终支持**的形态（本次只定契约，不实现）。

### 4.1 后端 WS/SSE 透传 / 4.1 Backend passthrough

`confirmation_request{mode:'run'}` 载荷原样经 SSE/WS 达前端；`confirmation_decision{mode:'run'}` + 逐条 `confirmation_decision/tool_end` 回传。类型 `ConfirmationRequestData` / `ConfirmationDecisionData` 扩展（§2.3）后所有消费方编译期即获字段。

### 4.2 Web-Admin-Vue（工作台 + 管理台）

- 工作台聊天抽屉 `CrmCopilotDrawer.vue`（现单 `pendingConfirmation` 槽，L212-217）：支持 run 卡——收到 `mode:'run'` → 渲染多 item 卡（每行 summary + riskLevel + 展开看原始 args），approve/decline 调 `confirmTool(runToken,…)`（复用 `streamChat.ts` 的 confirmTool，仅 token 换成 run token）。
- 管理台审批 `AiApprovalsView.vue`：R4 run（多 R4 聚合，见 §2 边界——**R4 run 是本 spec 的方向项，A 实现先不做 R4 聚合**，管理台保持逐行 R4；R4-run 聚合随 NC-1 评估）——故本契约对管理台 = **现状可继续消费单条 R4**，不破坏。

### 4.3 Flutter（AI 对话）

`ai_chat_provider.dart`（现单 `_currentConfirmation` 槽，L348-362）：升级为可容纳 run 的确认模型（items 数组），渲染 `ChatConfirmationCard` 的 run 变体。逐条 decision/tool_end 沿用现有更新逻辑。

### 4.4 i18n / 4.4 i18n

run 卡文案（"本次将执行 N 个操作 / 计划风险：R4 / 批准该计划 / 查看动作详情"等）走各端既有 i18n（zh/en），禁硬编码。

---

## 5. 验收与测试 / 5. Acceptance & Tests

> 挂 evidence hub §2.4（交付物 2）。实现（1.1）时执行。

- **单元（后端）**：
  - 聚合触发：本轮 ≥2 需即时确认写工具 → 产出单个 `mode:'run'`（items=N）；
  - 单条兼容：|C|==1 → 走现逐条路径，事件无 run 字段（回归）；
  - 混合风险：`runRisk` = 批内最高；R5 混入时 R5 单独 block、不进 run；
  - R4 混入时 R4 单独异步审批、不进 R3-run；
  - trusted（HS-6）工具不并入；
  - decline / timeout → 整批不执行；
  - 无 summarize 的动作 → 降级单独确认，不并入 run。
- **流式 e2e**：注入一轮含 2 个写工具（mock LLM）→ SSE 先见一个 `mode:'run'` → approve run token → 两条动作逐条 tool_end + 逐条副作用 + 可逐条撤销；decline 变体 → 0 执行。
- **前端**：三端 typecheck/build；Web vitest run 卡渲染 + approve/decline handler；Flutter widget/unit 相应。
- **手工脚本**：工作台让 AI"同时建事件 + 待办 + 跟进任务"（一次提示）→ 一张 run 卡三行 → approve → 三动作逐条执行、Action Center 三条、逐条可撤销。中/英界面各走一遍。
- **契约锁定**：`runRisk` / `mode:'run'` 一经本 spec 固定，未来 KB-6 revokeClass / 证据根升级不得改事件形状（对齐 ai-action-center.spec §5.3 契约锁定惯例）。

---

## 6. B 方案（Out，后续）/ 6. Plan B (Out, future)

跨轮计划协议——真正覆盖"一次让 AI 处理 200 客户"的长批场景：
- AI 先产**结构化 Action Plan**（工具/参数/意图列表，可跨多轮累积到一个聚合 ID）；
- 聚合 ID 落库、run 卡按 Plan 展示全部动作 diff + 风险分层；
- 一次授权 → 逐条执行（同 §2.5 链路）。

**不做（防 1.1 膨胀）**：跨轮累积状态机、AI plan 输出协议、独立 plan 聚合 ID 表、Agent 内部写前规划能力——均需 AI 提示词 + 数据模型 + 协议三方配合，超出 1.1 gate。A 方案落地后可自然演进到 B（run 承载从"单轮 items"扩为"plan items"即可，事件形状已兼容）。

---

## 7. Known Limits / 已知限制

- **A 只聚单轮**：跨轮/跨会话批量（"200 条"）须 B；A 覆盖的是"一次回复多条写动作"这一确定场景。
- 单写工具、trusted、R4、R5、无摘要工具 → 均走现路径，不聚合（保守设计）。
- 非流式 `chat`（`runToolLoop`，L1732）本就不真执行写（直接拒），**无 run 需求**。
- run 授权不背书逐条正确性（N-8）；逐条失败如实上报、不影响其他条（对齐 failure-path 语义）。
- 审计/撤销/证据：run 只改变"确认粒度"，不改变"每条动作的审计与可撤销性"；revokeClass（KB-6）是副作用撤销能力档位，与 run 的风险/确认无关，命名不冲突。

---

## 相关文档 / Related Docs

- `docs/ws-realtime.spec.md` —— SSE/WS 确认流信封（§3.2 映射、§5 确认流）
- `docs/hs9-governance-policy.spec.md` —— R4 门控档位（§4，auto/confirm/approval）
- `docs/ai-action-center.spec.md` —— NC-1 北极星（三端 UI 落地宿主；§5.3 契约锁定惯例）
- `docs/failure-path-corpus.spec.md` —— KB-4（逐条失败语义参照）
- `docs/security/threat-model.md` —— KB-3（N-8 边界：风险级 ≠ 业务正确性）
- `SECURITY.md` Trust Boundaries Not-a-* N-7（批量确认尚未提供 → 本 spec 落地后同步更新该 N-7 措辞）

*Spec · 2026-09-07 · KB-5 run-level approval（A 单轮定稿；B Out；三端契约随 NC-1 落地）*
