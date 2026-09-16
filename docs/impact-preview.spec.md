# Impact Preview（确认卡影响预览）— 功能规格 (Spec) / Impact Preview — Functional Specification

> 版本 / Version: v1.1（定稿 / Finalized）
> 日期 / Date: 2026-09-16
> 状态 / Status: **v1.0 已实现（2026-09-16，主仓 `567fce7d`）**；**v1.1（可撤销性口径）定稿、实现随本周期落**（见 §8）
> 归属 / Home: 确认门控（§22.17 ④「级联撤销 / 业务补偿」的**影响预览切片**；护城河核心第二块的第一步）
> 关联 / Related：`docs/run-level-approval.spec.md`（KB-5 run 聚合）｜ `src/ai/tool-effects/write-effect-type.ts`（副作用对象单源）｜ roadmap §22.17 ④

---

## 1. 概述 / 1. Overview

### 1.1 问题 / 1.1 Problem

写工具确认卡当前告知「**什么**将被执行」（`toolName` + `summary` + `arguments` + 授权依据），但**不告知「影响面」**——将执行几个写动作、涉及哪些业务对象。run 卡只给动作条数，单条卡什么都不给。用户答"确认"时，其实在为一个**只见动作、不见影响面**的操作背书。

### 1.2 目标 / 1.2 Goal

确认前给出**结构化影响预览**：

> 「预计影响：3 个写动作 · 涉及 crm_task ×2、contract ×1」

- **可撤销性口径（v1.1）**：同一处给出"这批动作事后能不能撤销"——按 KB-6 `revokeClass` **如实**标注（`none` 就不说可撤销），用词与事后撤销页 / 工具治理页同一套（`docs/manual/product-language.md` 的 Revoke class 词条）。审批人因此不只知道"要动几个对象"，还知道"动完之后能不能收回"。
- **单一真源**：影响面的对象类型 = 副作用登记的同一单源（`writeEffectTypeFor` / proxy → `proxy_call`），撤销档位 = `resolveRevokeClass` 单源；**不新建映射表**，防两处漂移。
- **纯估计、不执行**：由工具名确定性推导，**不查库、不试跑、不 dry-run**（dry-run 会触达真实系统，违背确认门控的意义）。
- **诚实**：无法解析副作用对象者**不计入**（它们本就不产生可撤副作用），而不是编一个数字。

### 1.3 非目标 / 1.3 Non-goals

- 不做「将改 N 行」的**逐行精确**预览（需查库/试跑；当前写工具均为单行 create 语义，且外部系统行数不可知）。
- 不做**级联预查**（如"删客户会连带影响 3 个订单"）：内置 AI 写工具全为单行 create，唯一真级联的 `delete_customer` 是 R5、永不执行，外部代理写行数不可知——**没有诚实的预览对象**，属预先抽象，不做。
- 不做级联撤销本身（§22.17 ④ 主体，另议）；本切片只提供其前提——**影响面的结构化描述**。
- 不做「批内最弱档」这类**汇总规则**（v1.1）：按档位分组如实展示即可，不发明一套需要维护的判定规则——无规则即无可漂移的第二实现。
- 本轮不落 Flutter 确认卡（见 §9）。
- 不改证据事实层：`impact` 是**呈现层派生**，不入哈希链 payload、不进证据包（性质同 trace/UI 派生）。

---

## 2. 数据形状 / 2. Data Shape

`impact` 为 `confirmation_request` 载荷的**可选**字段（`ConfirmationRequestData.impact`）：

```jsonc
{
  "actions": 3,                                  // 写动作数；恒等于 targets[].count 之和
  "targets": [                                   // 对象类型分组（resultType 取自副作用单源）
    { "resultType": "crm_task", "count": 2 },
    { "resultType": "contract", "count": 1 }
  ]
}
```

- **缺省即省略**：无可解析对象（如 `review_approval_request` 状态变更、`create_module` 干跑）→ 整个 `impact` 字段不出现，卡片不显示影响行。

**可撤销性（v1.1）**——与载荷既有的「单条 / run」形状对称，两处都可选：

```jsonc
// 单条（mode 缺省 / approval）：与 toolName / summary 同级
{ "token": "…", "toolName": "create_followup_task", "revokeClass": "local_compensate", "impact": {…} }

// run（mode === 'run'）：逐条动作各带一档
{ "mode": "run", "run": { "runId": "…", "riskLevel": "R3", "items": [
  { "toolName": "create_followup_task", "summary": "…", "riskLevel": "R3", "revokeClass": "local_compensate" },
  { "toolName": "proxy_tool_x",         "summary": "…", "riskLevel": "R3", "revokeClass": "governed_external" }
] } }
```

- 取值 = `docs/manual/product-language.md` 的 Revoke class 四档：`none` / `local_compensate` / `governed_external` / `transactional`。
- **缺省即省略**：老载荷（无该字段）卡片就不渲染撤销行——不猜、不补默认"可撤销"。
- **不进 LLM 上下文**：`revokeClass` 仅服务端关切（`tool.interface.ts` 既有声明），确认卡是人类看的，不改提示词。

- **契约**：wire Schema `specs/protocol/schemas/v3/confirmation-request.schema.json`（v1 / v2 冻结留各自目录）；registry `confirmation-request` → **v3**。v2 → v3 的唯一增量 = 上述 `revokeClass` 两处（可选，向后兼容）。

---

## 3. 推导规则 / 3. Derivation

```
单条：targets = 该工具映射到的一个 resultType，count = 1
run ：对批内每个成员各计一次，按 resultType 分组求和
```

- 对象类型解析**复用** `writeEffectTypeFor(toolName)`（`create_followup_task → crm_task`、`create_<module> → <module>` 等）；proxy 写工具 → `proxy_call`（与登记副作用同一判据）。
- 解析为 null 的工具**跳过**（fail-closed：它们本就不登记可撤副作用）。
- 解析结果为空 → 省略 `impact`（不显示「0 个动作」这类噪声）。

**撤销档位（v1.1）**：

```
单条：revokeClass = resolveRevokeClass(tool)     // 该工具自身一档
run ：items[i].revokeClass = resolveRevokeClass(tool_i)
```

- **复用** `resolveRevokeClass(tool)`（`src/ai/interfaces/tool.interface.ts`，KB-6 权威）：显式声明优先；未声明的确认写按既有语义派生 `local_compensate`；读 / 干跑派生 `none`。
- **不新增档位映射**：注册表 `register()` 已强制"确认写不得静默推成 none"（否则建工具即抛），故此处拿到的档位与事后撤销/工具治理页必然同源。
- **未注册名容错（外部 `mcp_*` / LLM 幻觉名）**：真实注册表对未注册名抛 `Tool "x" not found`——同段 `_assertToolAllowed` / `isProxyTool` 因此都包 try/catch，本处同办：解析不到 → 返回 undefined，调用方**省略**该字段（与 `_writeImpact` 解析不到对象类型时同一诚实口径），既不抛错也不补默认"可撤销"。
  - **可达性（2026-09-17 实测，如实记录）**：**当前到不了**——逐条路径在确认之前先调 `_requiresApproval`，而它对未注册名的 `riskLevel` 调用**无守卫、先抛**，该工具以「执行失败」收尾（实测 chunk 序列 `tool_end → text → done`，无 `confirmation_request`）。故本容错**是当前不可达路径上的护栏**，保留理由：① 与同段两处既有约定一致（§14.3 匹配既有风格）；② 失败后果不对称（未捕获异常会打断整条 SSE 确认流，而容错只是少显示一行）；③ 可达性依赖的是**别的方法恰好抛错**这一偶然属性，一旦 `_requiresApproval` 改为容错，此处立即成为必经之路。

---

## 4. 渲染 / 4. Rendering

- **Web**：`AiConfirmationCard.vue` 在摘要与授权区之间加一行影响预览（run 卡与单条卡同形）。
- **Web（v1.1）**：影响行下方再加一行**撤销口径**——单条给一档；run 按 `items[].revokeClass` **分组计数**（如「可撤销（本地）×2、不可撤销 ×1」），档位标签与 `AiToolsView` 的撤销档位标签**共用同一份映射**（抽 `src/utils/revokeClass.ts`，防第二份词表）。
- **Flutter**：确认卡同形呈现（v1.0 已落影响行；v1.1 撤销行见 §9）。
- **双语**：文案走 i18n（`confirmImpact` / 撤销档位复用既有 `revokeClass*` 四键 / 对象类型按 `resultType` 原样显示——它是机器标识，不翻译，避免与撤销/审计页口径分叉）。

---

## 5. 边界与红线 / 5. Boundaries

| 项 | 立场 |
|---|---|
| 估计 vs 承诺 | 文案用「预计影响」，**不写**「将改 N 行」等确定性承诺（外部系统行数不可知） |
| 不触达系统 | 纯推导，**不查库不试跑** |
| 证据层 | `impact` / `revokeClass` 不入链、不进证据包（呈现层派生） |
| 单源 | 对象类型不得另建映射表；必须走 `writeEffectTypeFor` |
| 撤销口径 vs 撤销保证（v1.1） | 只在**能撤**时说能撤：`none` 如实显示「不可撤销」；`governed_external` 按产品语言显示「可撤销（需外部补偿）」——**不简化成"可撤销"**（KB-6 诚实边界：撤销后是"已请求补偿/结果未知"，禁显示 revoked） |
| 只看不动（v1.1） | 撤销口径**不影响门控**：风险级 / R4 审批档 / R5 阻断 / HS-6 本会话信任一律不变——它是给审批人看的信息，不是放行依据（对齐 N-8：风险级 ≠ 业务正确性） |
| 单源（v1.1） | 撤销档位不得另建映射；必须走 `resolveRevokeClass`；档位标签必须复用既有 `revokeClass*` 四键，不得新造第二套词表（术语闸覆盖） |

---

## 6. 验收 / 6. Acceptance

1. 单条写确认（`create_followup_task`）→ 载荷含 `impact{actions:1, targets:[{crm_task,1}]}`，卡片显示影响行。
2. run 确认（2×`create_followup_task` + 1×`create_contract`）→ `impact{actions:3, targets:[{crm_task,2},{contract,1}]}`。
3. 干跑/无副作用对象（`create_module`）→ **无** `impact` 字段、卡片无影响行。
4. wire Schema：两份 v3 样例过 `wire-schema.spec.ts`；registry 版本 = v3。
5. 回归：确认流（含 run 一次授权整批）行为不变，仅多带一个可选字段。
6. **可撤销性（v1.1）**：单条写确认（`create_followup_task`）→ 载荷含 `revokeClass: 'local_compensate'`，卡片显示「可撤销（本地）」。
7. **可撤销性 · run 混合档（v1.1）**：run 含 `local_compensate` ×2 + `governed_external` ×1 → 卡片按档分组显示两组计数，不塌缩成单档、不报"可撤销"。
8. **可撤销性 · 旧载荷（v1.1）**：无 `revokeClass` 的确认载荷 → 卡片**不渲染**撤销行（不补默认值）。

---

## 7. 测试 / 7. Tests

- 后端：推导单测（单条 / run 分组求和 / 无副作用对象省略 / proxy → `proxy_call`）+ payload 断言。
- 后端（v1.1）：`revokeClass` payload 断言（单条 / run 逐条 / proxy → `governed_external`）+ "档位由 `resolveRevokeClass` 单源给出"的用例（显式声明优先 / 未声明确认写派生 `local_compensate`）。
- Web：`AiConfirmationCard` 渲染影响行（run 与单条）。
- Web（v1.1）：撤销行渲染（单条一档 / run 混合档分组计数 / 无字段不渲染）+ `revokeClassTag` 共享映射单测。

---

## 8. 实现 / 8. Implementation

- 契约：`specs/protocol/schemas/v3/confirmation-request.schema.json` + 2 样例 + registry → v3（**先行**，CE-1 C1 单源规则）。v2 → v3 唯一增量 = `revokeClass`（可选 ×2 处）。
- 推导：`src/ai/tool-effects/write-impact.ts`（复用 `writeEffectTypeFor`）；撤销档位复用 `resolveRevokeClass`。
- 接线：`src/ai/ai.service.ts` 三处 `confirmation_request`（单条 / R4 审批 / run），与既有 `impact` 同一处挂载。
- 渲染：`Web-Admin-Vue/src/components/AiConfirmationCard.vue`（+ 共享 `src/utils/revokeClass.ts` 标签映射）+ Flutter 确认卡（v1.0 影响行；v1.1 撤销行见 §9）。

---

## 9. 已知限制 / 9. Known Limits

- **Flutter 撤销行未落（v1.1）**：本轮按"后端载荷 + Web 工作台"选型只落 Web；Flutter 确认卡仍只有影响行。载荷字段是共享的，补渲染不需再动后端——但在此之前 `docs/cross-platform-matrix.md` 的 Tool Confirmation 一行**存在端间差异**，勿按"三端一致"宣称。
- ~~**SSE 信封 ref 停在 v1（既有，非本切片引入）**~~ **已修（2026-09-16）**：v1 信封的 `confirmation` 属性 `$ref` 裸名 → 解析到**冻结的 v1 载荷**（`additionalProperties:false`、无 `impact` / `revokeClass`），于是本切片产出的确认帧按信封校验会**失败**——属「信封与内层对象版本脱节」。现 `sse-event` **升 v2**（`specs/protocol/schemas/v2/sse-event.schema.json`，**裸 `$id`** 以便沿用 v1 的跨文件相对 `$ref`）：**事件名枚举不变**，只把嵌套载荷 ref 跟到各对象当前版——`confirmation_request` → `confirmation-request` v3、`confirmation_decision` → `confirmation-decision` v2（后者同属旧 ref，一并收）。registry 的 `sse-event` → v2 + 两份 v2 样例（单条带顶层 `revokeClass`、run 带逐条 `revokeClass`）。**证据**：同一份 v2 样例在 v1 信封下 FAIL、在 v2 信封下 PASS；直接以内层载荷对 ref 校验，v1 报多余键 `impact` / `revokeClass`，v3 收。
  - 仍留一处**未改的绑定**：`src/realtime/realtime.types.spec.ts` 的 `schemaOf` 硬编码读 `schemas/v1/`——本 v2 **不改事件名枚举**，故该断言（运行时事件名集 == oneOf const 集）在 v1 上仍成立、无误报；但若将来增删事件名，须先把该读取改为随 registry 解析（否则是「更新了 v2、测试仍读 v1」的假红陷阱）。
- **未实测项**：真实浏览器里"批准前看到撤销口径"的观感留部署态验证；本轮以 vitest 卡片渲染断言 + 全链路测试覆盖。
