# 审计与数据保留 / Audit and Data Retention

> 适用版本 / Applies to: v1.3.2+
> 关联 / Related: `docs/tool-result-retention.spec.md`、`docs/hs11-audit-chain.spec.md`

## 1. 保留什么、留多久 / What is kept and for how long

English. Two different promises are in play, and they must not be conflated.

- **Audit rows are kept indefinitely.** `ai_audit_logs` and `operation_audit_logs` have no retention
  job: they are the hash-chained record, and deleting a row from the middle breaks the chain. What
  the chain does **not** prove (a tail deletion, long-term immutability) is stated in the HS-11 spec.
- **Tool-result bodies expire.** A tool result is projected to 4000 characters before it reaches the
  model. With 0-B retention enabled, the full body of a **truncated** call is kept off-chain in
  `ai_tool_result_bodies` for `TOOL_RESULT_BODY_RETENTION_DAYS` (default 30). When the window passes,
  the hourly sweep clears `body_text` and `model_text`, sets `body_state = 'expired'`, and **keeps the
  row**: the hashes, byte sizes and truncation flag remain.
- **Notifications** are cleaned after `NOTIFICATION_RETENTION_DAYS` (read ones only); sessions,
  phone codes and verification codes are deleted at their own expiry.
- **Backups outlive the online window.** `npm run backup` copies the whole database, so a body removed
  online may still exist in the last `BACKUP_KEEP` backups. Any privacy statement covers the **online**
  database only.

中文。这里有两份不同的承诺，不能混为一谈。

- **审计行长期保留。** `ai_audit_logs` 与 `operation_audit_logs` 没有保留期清理：它们是哈希链记录，
  从中间删一行就会断链。链**证明不了**什么（尾部删除、长期不可变）在 HS-11 规格里写明。
- **工具结果正文会过期。** 工具结果进入模型前被投影到 4000 字符。开启 0-B 留存后，**被截断**的调用
  的完整正文以链外方式保存在 `ai_tool_result_bodies`，保留 `TOOL_RESULT_BODY_RETENTION_DAYS` 天
  （默认 30）。到期后每小时清扫清空 `body_text` 与 `model_text`、置 `body_state='expired'`，并
  **保留该行**：哈希、字节数与截断标记仍在。
- **通知**按 `NOTIFICATION_RETENTION_DAYS` 清理（只清已读）；会话、手机验证码、邮箱验证码按各自的
  到期时间删除。
- **备份长于在线窗口。** `npm run backup` 是整库备份，故在线已清掉的正文可能仍在最近
  `BACKUP_KEEP` 份备份里。任何隐私声明只覆盖**在线库**。

## 2. 正文不在链上 / The body is not on the chain

English. Retention rows never enter `buildPayload`. The audit chain, `/audit/verify`, the action
report and the evidence packages behave exactly as before, and the audit row's width does not grow.
The row's own `body_sha256` shows that **the stored copy** was not altered; it is not a chain
commitment, and it stops being recomputable once the text expires. `original_sha256` commits to a
value that is not retained — it means something only if a copy exists elsewhere.

中文。留存行从不进入 `buildPayload`。审计链、`/audit/verify`、行动报告与证据包行为逐字不变，审计行
行宽也不增长。行内的 `body_sha256` 证明的是**存下来的那份**没被改；它不是链承诺，且文本过期后便
不可再复算。`original_sha256` 承诺的是一个未留存的值 —— 只有别处另有副本时才有意义。

## 3. 读取 / Reading

| Method | Path | Who |
|---|---|---|
| GET | `/api/v1/audit/logs/:id/tool-result` | 管理员 / 审计读者（`read AuditLog`），审计读者按账号组织收窄 |

English. `bodyState` says what happened: `stored` (body and model text present), `capped` (the body
exceeded `TOOL_RESULT_BODY_MAX_BYTES`; only the model projection and the size/hash commitment are
kept) or `expired` (texts cleared; hashes and sizes remain). An expired body still answers **200** —
the tombstone is evidence. A row that is not a `tool_call`, retained nothing, or is outside the
reader's scope answers **404**, the same answer for all three, because "it exists elsewhere" is itself
a disclosure. The console (`Web-Admin-Vue` → AI 审计) fetches this on demand for an expanded row.

中文。`bodyState` 说明发生了什么：`stored`（正文与模型文本都在）、`capped`（正文超过
`TOOL_RESULT_BODY_MAX_BYTES`，只留模型投影与大小/哈希承诺）、`expired`（文本已清，哈希与大小仍在）。
过期正文仍答 **200** —— 墓碑就是证据。非 `tool_call` 行、未留存、或不在读者范围内，一律 **404**：
三者同一个答案，因为「别处存在」本身就是一次披露。管理台（`Web-Admin-Vue` → AI 审计）在展开行时
按需读取。

## 4. 配置 / Configuration

```bash
TOOL_RESULT_BODY_RETENTION_DAYS=30   # 0 = 关闭留存 / 0 disables retention
TOOL_RESULT_BODY_MAX_BYTES=262144    # 单条正文上限 256 KB / per-body cap
TOOL_RESULT_BODY_SCOPE=truncated     # truncated（默认，仅被截断的调用）| all
```

## 5. 边界 / Boundaries

- By default only **truncated** calls are retained; a small result that was never truncated still
  exists only in the model context, and the audit row never stored it.
- 默认只留**被截断**的调用；没被截断的小结果仍然只存在于模型上下文里，审计行不存正文。
- 独立治理运行时（`start:governance`）有自己的库；留存行属于业务库，那里的读端点如实答 404。
  The standalone governance runtime has its own database; retention rows belong to the business
  database, so its read endpoint answers 404 honestly.
- 子代理在**未注入** `readOnlyExecutor` 的回退路径不覆盖（无审计行可锚）。
  The sub-agent fallback path without an injected `readOnlyExecutor` is not covered (no audit row to
  anchor to).
