# 0-B Tool-Result Retention / 0-B 工具结果留存

> 版本 / Version: v1.0（2026-11-14）
> 关联 / Related: `docs/hs11-audit-chain.spec.md`（链语义与边界）、`Server-NestJS/src/ai/audit/tool-call-audit.ts`（审计行）

## 1. 目标 / 1. Goal

English. A tool result is projected down to 4000 characters before it reaches the model
(`ToolPresentationService.renderToolResult`), and the full body used to be discarded. Nothing could
answer "what did the tool actually return" after the fact — not the audit row (it keeps
`outcome/isError/usage/arguments`, never the result), not `ai_messages` (tool messages are never
persisted), and not a re-query (read tools query live data). This spec adds an **off-chain** retention
surface so a truncated result stays checkable, without changing the audit chain or the frozen wire
schema.

中文。工具结果在进入模型前会被投影到 4000 字符以内（`ToolPresentationService.renderToolResult`），
完整正文过去直接丢弃。事后没有任何地方能回答「工具到底返回了什么」——审计行不存结果（只存
`outcome/isError/usage/参数`），`ai_messages` 不落工具消息，重查得到的是「现在」而不是「当时」。
本规格新增一张**链外**留存面，使被截断的结果事后可核对，且不改审计链、不改冻结的 wire schema。

## 2. 数据规格 / 2. Data

Table `ai_tool_result_bodies` (new; one row per audited tool call, anchored by `audit_row_id` unique):

| Column | Type | Meaning |
|---|---|---|
| `audit_row_id` | integer, unique | `ai_audit_logs.id`; the idempotency key (no FK, repository style) |
| `conversation_id` | varchar(64) | optional |
| `user_id` / `tool_name` | varchar(64) | the call's actor and tool |
| `outcome` | varchar(16) | `executed` / `failed` |
| `body_state` | varchar(16) | `stored` / `capped` / `expired` |
| `body_text` | text | masked full body (`stored` only) |
| `body_bytes` | integer | UTF-8 bytes of the **original** full serialized result |
| `stored_bytes` | integer | bytes of `body_text` |
| `body_sha256` | varchar(64) | sha256 of `body_text`; kept after expiry as a commitment |
| `original_sha256` | varchar(64) | sha256 of the pre-masking full result |
| `model_text` | text | the model input after field-name masking (≤4000 chars); set on the two chat paths, the sub-agent path and the plan path, null where no rendered text reaches a model (R4 / MCP / deterministic navigation) |
| `model_chars` / `model_sha256` | integer / varchar(64) | length and hash of `model_text` |
| `was_truncated` | boolean | whether the projection dropped anything |
| `created_at` / `expires_at` | datetime | write time and end of the retention window |

迁移 / Migration: `1850000000000-AddAiToolResultBodies`（sqlite + postgres 同一支，postgres 清单见
`src/config/postgres-migrations.ts`）。

## 3. 写入规则 / 3. Writing

English. Captured only where an audit row exists, immediately after it is written: the two chat
paths, `_agentStepExecutor` (plan / sub-agent), the R4 executor and the MCP export. On the chat
paths, audit granularity `off` leaves no row to anchor to, so nothing is retained there; the R4
executor and the MCP export write their rows regardless of that setting (their own pre-existing
behaviour), so their bodies are retained whenever retention itself is on. `redactSensitive` (field names) then `sanitizeExternalContent` (emails,
phones, tokens, long hex) mask the body before it is stored. The model's copy is produced by
project-then-sanitize, which the sanitize-then-store body cannot be inverted into, so it is kept on
its own; before it is stored it gets the same field-name redaction, i.e. `model_text` is the model
input **after** `redactSensitive` — recorded wherever a model receives that rendering (the two chat
paths, the sub-agent and the plan summary), and left null where none does (R4, MCP, deterministic
navigation). Where that sanitizer rewrites an unquoted token and leaves the
model's copy unparseable, redaction falls back to masking sensitive values by field name in the raw
text, and withholds the whole document (`[REDACTED: unparseable payload]`) for shapes it cannot
vouch for — invalid input is never stored as-is. A capture failure logs a warning and never fails
the tool call, the answer or the audit row.

中文。只在已有审计行时留存，且紧接该行之后：对话两条路径、`_agentStepExecutor`（plan / 子代理）、
R4 执行器与 MCP 出口。对话路径上审计粒度 `off` 时没有行可锚，故不留存；R4 执行器与 MCP 出口不随该
设置停止写行（这是它们既有的行为），因此只要留存本身开启，那两条路径的正文仍会留存。写入前
先 `redactSensitive`（字段名）再 `sanitizeExternalContent`（邮箱/手机/token/长 hex）。模型那份是
「先投影、再脱敏」，无法从「先脱敏、再存」的正文反推，故单独留存；落库前同样过字段名打码，即
`model_text` 是 `redactSensitive` **之后**的模型输入 —— 凡有模型收到这份渲染就记（对话两条路径、
子代理与 plan 汇总），没有模型收到就留空（R4、MCP、确定性导航）。若该消毒器改写了未加引号的 token、使模型那份
无法解析，打码改为在原始文本上按字段名逐键遮盖；无法担保完整的形状则整篇隐去
（`[REDACTED: unparseable payload]`）—— 非法输入绝不原样留存。留存失败只告警，绝不让工具调用、
回答或审计行失败。

Default scope is `truncated` (only calls whose full body exceeded the 4000-char budget); `all` keeps
every call. A body is stored as `capped` when the original serialized result **or** the masked text
that would be stored exceeds `TOOL_RESULT_BODY_MAX_BYTES`: no text, but sizes and `original_sha256`
remain. `body_bytes` is always the original size, so when masking is what pushed the stored text
over the cap, a capped row can show a value at or under the cap.

默认范围 `truncated`（只留完整正文超过 4000 字符预算的调用）；`all` 留全部。原始正文**或**将要落库的
打码文本超过 `TOOL_RESULT_BODY_MAX_BYTES` 时落 `capped`：不存文本，但大小与 `original_sha256` 仍在。
`body_bytes` 始终是原始大小，故当超限发生在打码之后时，capped 行显示的大小可能不高于上限。

## 4. 接口规格 / 4. API

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/audit/logs/:id/tool-result` | `read AuditLog`（管理员 / 审计读者） | 200 with `bodyState`; `expired` → 200 + null texts; not a tool row / nothing retained / out of scope → 404 |

English. Out of scope and "no such row" are the same 404 (never a hint that another organisation has
the row). "Nothing was retained" is a 404 as well — the console says so explicitly. An expired body is
a 200 because the tombstone (hashes, sizes, flags) is real evidence. The response carries `body`,
`modelText`, sizes, hashes, `wasTruncated`, `createdAt` and `expiresAt`.

中文。范围外与「没有这一行」同为 404（绝不暗示另一个组织有这行）；「什么都没留」也是 404，管理台
有专门文案。已过期的正文是 200，因为墓碑（哈希/大小/标记）本身就是证据。响应带 `body`、
`modelText`、大小、哈希、`wasTruncated`、`createdAt` 与 `expiresAt`。

The console (`Web-Admin-Vue` audit view) fetches the body on demand for an expanded `tool_call` row —
never prefetched for the list — and renders "expired" and "not retained" as different sentences.

管理台（`Web-Admin-Vue` 审计页）在展开某条 `tool_call` 行时按需取正文，列表不预取；「已过期」与
「未留存」显示为两句不同的话。

## 5. 保留期与清理 / 5. Retention

`TOOL_RESULT_BODY_RETENTION_DAYS` (default 30; `0` disables retention entirely). The hourly
`cleanupExpiredData` sweep clears `body_text` and `model_text` of rows past `expires_at` and flips
`body_state` to `expired`; **rows are never deleted** — "expired" must stay distinguishable from
"never retained". Backups (`BACKUP_KEEP`) may outlive the online window, so privacy claims only cover
the online database.

默认 30 天（`0` 关闭留存）。每小时 `cleanupExpiredData` 清空已过 `expires_at` 行的 `body_text` 与
`model_text` 并把 `body_state` 置 `expired`；**不删行** —— 「过期」必须与「从未留存」可区分。
备份（`BACKUP_KEEP`）可能长于在线窗口，故隐私承诺只覆盖在线库。

## 6. 链语义与边界 / 6. Chain and boundaries

English. Nothing here enters `buildPayload`: the audit chain, `/audit/verify`, the action report and
the evidence packages behave exactly as before, and the audit row's width never grows. The table's
own hashes show that **the stored copy** was not altered; they are not a chain commitment — `body_sha256`
becomes non-recomputable after expiry and `original_sha256` commits to a value that is not retained.
The coverage-gap registry is **not** extended: its ids are mirrored by the Java runtime and pinned
across runtimes, which is a contract-level change left for after the freeze. Where audit granularity
is `off`, the existing `audit-granularity-off` gap already says the window cannot be read.

中文。这里没有任何东西进 `buildPayload`：审计链、`/audit/verify`、行动报告与证据包行为逐字不变，
审计行行宽也从不增长。本表自带的哈希只证明**存下来的那份**没被改，不是链承诺 —— 过期后
`body_sha256` 不可再复算，`original_sha256` 承诺的是一个未留存的值。覆盖缺口登记表**不**扩充：
其 id 由 Java 运行时镜像并跨运行时钉住，属契约级变更，冻结期后另议。审计粒度 `off` 时，既有的
`audit-granularity-off` 缺口已经说明那一期读不到。

独立治理运行时（`npm run start:governance`）有自己的数据库与显式实体清单；留存行属于**业务库**，
故那里的仓储不装配，读端点如实答「未留存」（404），而不是查一张它不拥有的表。

The standalone governance runtime has its own database and its own explicit entity list. Retention rows
belong to the **business** database, so its store is not assembled there and the read endpoint answers
«not retained» (404) instead of querying a table that runtime does not own.

## 7. 配置 / 7. Configuration

```
TOOL_RESULT_BODY_RETENTION_DAYS=30   # 0 = off
TOOL_RESULT_BODY_MAX_BYTES=262144    # 256 KB per body
TOOL_RESULT_BODY_SCOPE=truncated     # truncated | all
```

## 8. 验收 / 8. Acceptance

1. A call over 4000 chars: `body_text` equals the same two-stage masking of the full result; `was_truncated=true`.
2. `model_text` is byte-for-byte the model input after field-name redaction; `model_sha256` matches it.
3. After forcing expiry: 200, `bodyState=expired`, texts null, hashes and sizes remain.
4. `/audit/verify` passes before and after; audit row width unchanged.
5. Audit granularity `off` → no audit row, no retention row.
6. Masked emails/phones/tokens/names; no plaintext PII in the console.
7. An injected capture failure leaves the tool call, answer and audit row intact.
8. Migrations up and down on both backends: the jest spec covers sqlite up / unique / down; `migration:consistency:pg` covers postgres up + drift check + revert of the newest migration (this one, until a newer migration lands) + re-run. The postgres glob guard is green.
9. Non-admin without scope → 404; audit reader within scope → 200.
10. A body whose original or masked size is over the cap → `capped`, `body_text` null, `body_bytes` the original size.
