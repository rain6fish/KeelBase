# AW-12 记录级复核 — 功能规格说明 (Spec) / AW-12 Record-Level Review — Functional Specification

> 版本：v1.0 / Version: v1.0
> 依据：私有 roadmap §2.1.27 AW-12；F-44 / F-47（`KeelBase-Private/notes/对外反馈台账.md`）
> Based on: private roadmap §2.1.27 AW-12; F-44 / F-47

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

一张车牌检索日志在库里躺了一年才有人审 —— 那不是「读不到」，是**没有任何人被指派去读，也没有任何东西能证明读发生过**。本特性补三件事：谁负责读、多久读一次（显式配置）；每次复核留下一张**回执**，而回执**本身就是审计链上的一行**（可离线验证）；链上没有被回执覆盖的行，按链算出未复核区间，并在覆盖声明里报 `unknown`。

A licence-plate search sat in the log for a year before anyone looked at it. The gap was not readability — nobody was **assigned** to read, and nothing could **prove** a reading happened. This feature adds three things: who owns the reading and how often (explicit configuration); one **receipt** per review, and that receipt **is a row on the audit chain** (offline-verifiable); and, for rows no receipt covers, the unreviewed intervals computed from the chain, reported as `unknown` in the coverage statement.

### 1.2 与 AW-9 的分工 / 1.2 Boundary with AW-9

AW-9 复核**决策**（复核者 ≠ 操作者）；本项复核**记录本身被谁读过**。

AW-9 reviews **decisions** (reviewer ≠ operator); this item reviews **who read the records**.

---

## 2. 配置 / 2. Configuration

| 变量 | 含义 | 未配置时 |
|---|---|---|
| `AUDIT_REVIEW_OWNER` | 负责读审计记录的账号（用户名）。配置后**只有该账号能签**复核回执 | 覆盖声明报 `record-review-unassigned`（`unknown`） |
| `AUDIT_REVIEW_CADENCE_DAYS` | 复核频度（天，正整数） | 同上；两者都配置才算「已指派」 |

配置是**运行时强制**的：owner 配置后别人的签名请求是 403，不是「建议」。

The assignment is enforced at runtime: with an owner configured, another account's signing request is a 403, not a suggestion.

---

## 3. 数据规格 / 3. Data

回执 = `ai_audit_logs` 的一条新行：

- `action = 'audit_review'`（契约 `audit-payload` **v3** 拟新增的枚举值；**v3 尚未发布** —— 本落地停在 CT-6
  决策包，契约 pin 仍为 v1.19.0；它**不是** AI 动作）；
- `detail` = 规范 JSON：`{"cadenceDays":7,"fromId":1201,"kind":"audit_review","throughId":1284}`；
- `outcome` / `tool` 恒 null（`ai-audit-log-outcome` 的 `any-other-action` 已允许）；
- 复核人与时间 = 该行的 `userId` / `username` 快照 / `createdAt`。

为什么范围写在 `detail` 而不另开列：`detail` 在 hash 载荷里，**声明本身被签住**；载荷之外的列可以被改写而不断签 —— 那正是本特性要防的事。`detail` 解析不出来的回执一律当**没有回执**（fail-closed）。

The `audit_review` value is **proposed** for `audit-payload` v3, not released: this landing stops at a CT-6
decision package and the contract pin stays v1.19.0, so the pinned schema does not yet carry the value.

Why the range lives in `detail` rather than a side column: `detail` is inside the hash payload, so the **claim itself is signed**; a column outside the payload could be rewritten without breaking a signature — exactly what this feature exists to prevent. A receipt whose `detail` does not parse is treated as **no receipt** (fail-closed).

区间按**链位置（id）**给，不按 `createdAt`：`createdAt` 不入载荷，按时间写的区间可以事后改写。

Ranges are given by **chain position (id)**, not `createdAt`: `createdAt` is not in the payload, so a time-based range could be rewritten after the fact.

---

## 4. API / 4. API

| Method | Path | 判据 | 说明 |
|---|---|---|---|
| `GET` | `/api/v1/audit/reviews` | `read AuditLog` | 配置 + 回执清单 + 已复核/未复核区间（由链算出，全局，与 `verify` 同理） |
| `POST` | `/api/v1/audit/reviews` | `read AuditLog` | 签回执：`{fromId, throughId}`；区间必须在库里已存在（`throughId ≤ 当前链尾 id`） |

这是审计控制器**唯一的写**：签回执**就是**「我读过」这个断言本身，故授权它的是读者自己的授予。

This is the audit controller's **only write**: signing the receipt **is** the assertion «I read this», so the reader's own grant is what authorises it.

---

## 5. 未复核区间 / 5. Unreviewed intervals

1. 取所有 `audit_review` 行，解析 `detail`（坏的回执丢弃并计入 `malformedReceipts`）；
2. 合并区间；未复核 = `[1, maxId]` 去掉已复核区间（回执行自身不算待复核记录）；
3. 每段给出记录条数与最早时间。

1. Load every `audit_review` row and parse `detail` (malformed receipts are dropped and counted);
2. Merge the ranges; unreviewed = `[1, maxId]` minus the covered ranges (receipt rows are not reviewable records);
3. Each interval carries its record count and oldest timestamp.

---

## 6. 覆盖声明 / 6. Coverage statement

新增两个事实与两条缺口（`coverage-gaps.ts`）：

| 缺口 id | verdictImpact | 触发 |
|---|---|---|
| `record-review-unassigned` | `unknown` | 未配置复核人/频度，且本期有未复核行 |
| `record-review-unreviewed-window` | `unknown` | 本期有未复核行 |

两条都是 `unknown` 而不是 `partial`：**「有没有人读过」这一层拿不出结论**，把它报成「部分覆盖」等于声称知道漏了什么。空窗口不挂 `record-review-unassigned`（没有可复核的东西）。

Both are `unknown`, not `partial`: the «did anyone read this» layer has **no conclusion to offer**, and calling it «partially covered» would claim to know what is missing. An empty window does not carry `record-review-unassigned` (there is nothing to review).

---

## 7. 反向可证 / 7. Falsifiability

`test/audit-record-review.e2e-spec.ts` 在真实库与真实链上钉住：

- **删掉一条回执** ⇒ 对应区间从「已复核」变回未复核，且链在该处断（后一行的 `prevHash` 指向一个已不在链上的 hash）；
- **伪造一条回执** ⇒ 链校验失败；
- 回执写完后链仍然完整（回执是正常入链的行）；
- 配置缺失/存在时，覆盖声明如实增减缺口。

The e2e pins, on a real database and the real chain: deleting a receipt flips its range back to unreviewed **and** breaks the chain at that point; a forged receipt fails verification; the chain stays valid after a genuine receipt; the coverage gaps appear and clear exactly as the facts change.

---

## 8. 非目标 / 8. Non-goals

- 不新开管理页面；现有 AI 审计页加一列「复核」。
- 不做按组织/按读者的复核排班；复核人是一个显式配置项。
- 不回填历史行的「已复核」状态 —— 链上只有回执，没有说谎的补写。

- No new console page; the existing AI audit page gains one «Review» column.
- No per-organisation or per-reader rota; the reviewer is one explicit configuration value.
- No backfilling «reviewed» onto historical rows — the chain holds receipts, not convenient lies.
