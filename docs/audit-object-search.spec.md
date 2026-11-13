<!-- SPDX-License-Identifier: Apache-2.0 -->

# Audit search by business object + export the six answers — Functional Specification

> Version: v1.0 (first slice)
> Source: `KeelBase-Private/notes/CTO每周例会/2026-11-07-下周开发计划.md` row **U1**;
> `KeelBase-Private/notes/CTO每周例会/2026-11-07.md` §7.1, §10, §11.
> Scope: **starts, does not finish.** This document and the code it describes are the first slice.

---

## English

### 1. The problem, in the minute's own words

A non-technical audit reader could not locate an operation by its **business object**. The
published surface offered three filters — caller id, start time, status — and a 20-row page.
Without the numeric id there was no way in, and there was no export. The minute's acceptance
test is:

> `audit_reader` fills only "Customer #9005 + a time period" and gets every row; the exported CSV
> has six columns and **zero internal names**; a query with no match says **"no match"**; and
> `common` gets **403** on export.

### 2. The six answers

The minute (§7.1, the AI-simulated audit reader) names six, and this slice follows it:

| # | Column (product words) | Where it comes from |
|---|---|---|
| 1 | **Time (UTC)** | `ai_audit_logs.created_at`, rendered as `YYYY-MM-DD HH:MM:SS UTC` |
| 2 | **Action** | `ai_audit_logs.tool` → its business label; otherwise the action kind in product words |
| 3 | **Result** | the single state already derived by `explainState()` |
| 4 | **Object** | the side-effect row reached through the write claim: `result_type` → business noun, `result_id` → `#id` |
| 5 | **Authorization** | the confirmation row reached through the claim's `authorizationRef`, as a sentence |
| 6 | **Initiated by** | `username` snapshot + whether the action ran through the AI assistant |

The 2026-10-31 minute names a slightly different six (who / when / object / before-after /
authorization / result). This slice follows **2026-11-07**, because that minute is the source of
U1 and its two hard cases are exactly what these six are asked against (a blocked delete, and an
R4 second-person approval). The difference is recorded here, not silently reconciled. Before/after
values remain out of scope for the same reason the minute gives: the "after" value today is the
host's current record, not a write-time snapshot.

### 3. Search semantics

**Object identity is the write claim.** An audit row carries no business object. The only
identity-based bridge is `ai_write_claims`: it records both `audit_row_id` (the row) and
`effect_id` (what landed), and the effect row carries `result_type` + `result_id`. So a search for
`(objectType, objectId)` resolves:

    effects(result_type = :t, result_id = :i) → effect ids
      → claims(effect_id IN …) → audit row ids
        → audit rows (id IN …, AND the requested period, AND the reader's row scope)

No pairing by tool name or by time: that is the "looks alike" rule this repository already
rejected for evidence pairing (ACT-2/ACT-5).

**Boundary.** Rows that never produced a claim — reads, risk-policy `blocked` rows, refusals
before execution, and rows written before the claim table existed — are **not reachable by object
search**. They are still reachable by period, and their Object column answers **"Not recorded"**,
which is the honest answer the minute recorded for the blocked case. Finding those objects would
need a writer-side change, not a read-side guess.

**Index unavailable.** A process that has no write-claim repository (the standalone governance
runtime registers `ai_tool_side_effects` but not `ai_write_claims`) cannot answer an object
query. It must not answer "no match" — that would be a false negative. Such a process answers
**503**, saying the object index is unavailable.

### 4. The zero-internal-names rule

The six cells are built from a **single vocabulary module**. Its rule is fail-closed:

- a known internal token maps to a product word;
- an unknown internal token maps to a **generic product word** (`Business record`, `AI action`),
  never to itself;
- the raw values of `result_type`, `tool`, `action`, `outcome`, `status`, `userId`, `agentId`,
  `hash`, JSON snapshots and ids other than the business object's own `#id` are never emitted.

The Object cell keeps the business id the reader already holds (`Customer #9005`); a numeric
business key is not an internal name.

### 5. API

| Method | Path | Gate | Notes |
|---|---|---|---|
| GET | `/api/v1/audit/logs?objectType=&objectId=` | `read AuditLog` | object + closed `since`/`until` window; existing list shape unchanged |
| GET | `/api/v1/audit/answers?objectType=&objectId=&since=&until=&limit=` | `read AuditLog` | returns `{ headers, rows, match }`; `rows` are the six cells, already in product words |
| GET | `/api/v1/audit/object-types` | `read AuditLog` | the selectable `{ value, label }` list, from the same vocabulary |

`common` (a plain `user`) holds no `read AuditLog`, so all three answer **403**. A period with no
match returns `match.found = false` and a plain sentence; the reader surface prints the sentence
instead of downloading an empty file.

The CSV is written by the console from `headers` + `rows` (the existing `downloadCsv` adds the
BOM and the formula-injection guard). The server produces **only** product words, so the
zero-internal-names property is testable without a browser.

### 6. What this slice deliberately does not do

1. **No guess when the name is missing.** `ai_confirmation_requests` records `approver_id` (an
   account id) and never a display name. When the record carries a name, it is the snapshot on the
   approver's own decision row in the same conversation — the derivation the single-event read face
   uses, and still no contract field. When that row does not exist, the Authorization cell says
   `Second-person approval (approver name not recorded)`: a gap is said, not filled.
2. **No localization of the CSV.** Tool labels have exactly one server-side source
   (`tool-metadata.ts`, English). A Chinese label layer exists only in the UI bundles; copying it
   server-side would create a second source that drifts. The export is English.
3. **No object search for rows without a claim** (see §3), and no before/after value.
4. **No new contract field.** The slice reads existing columns only: `ai_audit_logs` (as already
   frozen in `ai-audit-log-row` v7), `ai_write_claims`, `ai_tool_side_effects`,
   `ai_confirmation_requests`. Nothing is added to the wire schema; the contract stop condition is
   **not** triggered.

---

## 中文

### 1. 问题（照纪要说）

非技术的审计读者**无法按业务对象定位一次操作**。已发布的读面只有「调用方 id / 起始时间 /
状态」三个筛选与每页 20 行；不知道数字 id 就没有入口，也没有导出。纪要的验收判据是：

> 以 `audit_reader` 只填「客户 #9005 + 时间区间」即得全部行；导出 CSV 六列且 **0 处内部名**；
> 无匹配明说「无匹配」；`common` 导出 **403**。

### 2. 六问

以 **2026-11-07 纪要** §7.1 为准（AI 模拟审计读者逐项答的那六项）：

| # | 列（产品语言） | 数据来源 |
|---|---|---|
| 1 | **时间（UTC）** | `ai_audit_logs.created_at`，呈现为 `YYYY-MM-DD HH:MM:SS UTC` |
| 2 | **动作** | `ai_audit_logs.tool` → 业务标签；无工具时用动作种类的产品词 |
| 3 | **结果** | 复用 `explainState()` 已算出的那**一个**状态 |
| 4 | **对象** | 经写占位行到达副作用行：`result_type` → 业务名词，`result_id` → `#id` |
| 5 | **授权** | 经占位行 `authorizationRef` 到达确认行，写成句子 |
| 6 | **发起人** | `username` 快照 + 这次动作是否经 AI 助手 |

2026-10-31 纪要点的是另一组六项（谁 / 何时 / 对象 / 改前改后 / 授权 / 结果）。本切片以
**2026-11-07** 为准 —— 那一份才是 U1 的来源，且它的两个硬场景（被拦下的删除、R4 第二人批准）
正好由这六项作答。这处出入**记在这里，不悄悄抹平**。改前/改后继续不做，理由与纪要保持一致：
今天的「改后」是宿主**现在的记录**，不是写入时的快照。

### 3. 检索语义

**对象身份就是写占位行。** 审计行本身不带业务对象。唯一按身份而非「相像」搭起来的桥是
`ai_write_claims`：它同时记着 `audit_row_id`（哪一条审计行）与 `effect_id`（落下去的是什么），
而副作用行带着 `result_type` + `result_id`。故按 `(对象类型, 对象 id)` 检索的解析链是：

    副作用(result_type = :t, result_id = :i) → 副作用 id
      → 占位行(effect_id IN …) → 审计行 id
        → 审计行(id IN …，再叠加请求期间与读者的行范围)

**不**按工具名加时间配对 —— 那正是本仓在证据配对上已经否掉的「相像」规则（ACT-2/ACT-5）。

**边界。** 从未产生占位行的行 —— 只读、风险策略 `blocked`、执行前被拒、以及占位表出现之前写下的行
—— **按对象检索不到**。它们仍可按期间检索，其「对象」列如实答 **「未记录」**，也就是纪要里被拦
那一笔记下的答案。要把这些对象找出来，需要**写入侧**的改动，不是读取侧去猜。

**索引不可用。** 没有写占位仓储的进程（独立治理台注册了 `ai_tool_side_effects`，但没注册
`ai_write_claims`）答不了对象查询。它**不能**答「无匹配」—— 那是假阴性。这种进程答 **503**，
明说对象索引不可用。

### 4. 「0 内部名」规则

六列由一个**唯一的词表模块**拼出，规则是 fail-closed：

- 已知内部令牌 → 产品词；
- 未知内部令牌 → **通用产品词**（`Business record` / `AI action`），绝不原样回显；
- `result_type` / `tool` / `action` / `outcome` / `status` / `userId` / `agentId` / `hash` /
  各类 JSON 快照，以及业务对象自身 `#id` 之外的任何 id，一律不出现。

「对象」列保留读者本来就持有的业务 id（`客户 #9005`）；数字业务键不是内部名。

### 5. API

| Method | Path | 判据 | 说明 |
|---|---|---|---|
| GET | `/api/v1/audit/logs?objectType=&objectId=` | `read AuditLog` | 对象 + 两端闭合的 `since`/`until`；列表既有形状不变 |
| GET | `/api/v1/audit/answers?objectType=&objectId=&since=&until=&limit=` | `read AuditLog` | 返回 `{ headers, rows, match }`；`rows` 就是六格，且已是产品词 |
| GET | `/api/v1/audit/object-types` | `read AuditLog` | 可选 `{ value, label }` 清单，与词表同源 |

`common`（普通 `user`）没有 `read AuditLog`，三个端点一律 **403**。期间无匹配时
`match.found = false` 并给一句白话；读者界面打印这句话，而不是下载一个空文件。

CSV 由控制台用 `headers` + `rows` 写出（既有 `downloadCsv` 负责 BOM 与公式注入防护）。服务端
**只**产出产品词，故「0 内部名」这一性质不打开浏览器就能测。

### 6. 本切片刻意不做的事

1. **姓名缺失时不猜。** `ai_confirmation_requests` 只记 `approver_id`（账号 id），从不记显示名。
   记录里带姓名时，姓名取自**同一会话**中批准人自己那条裁决行的快照 —— 与单事件读面同一条推导，
   仍然不动契约字段。裁决行不存在时，「授权」列写 `Second-person approval (approver name not
   recorded)`：缺口就说成缺口，不填空。
2. **CSV 不做中文化。** 工具标签在服务端只有一个来源（`tool-metadata.ts`，英文）；中文标签只存在于
   UI 包。抄一份到服务端等于制造第二个会漂的来源。故导出为英文。
3. **没有占位行的行不参与对象检索**（见 §3），也不给改前/改后。
4. **不加任何契约字段。** 本切片只读既有列：`ai_audit_logs`（已在 `ai-audit-log-row` v7 冻结）、
   `ai_write_claims`、`ai_tool_side_effects`、`ai_confirmation_requests`。wire schema 一字未动，
   契约停止条件**未触发**。
