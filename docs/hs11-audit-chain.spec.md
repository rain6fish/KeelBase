# HS-11 审计加密链 — 功能规格说明 (Spec) / HS-11 Audit Hash Chain — Functional Specification

> 版本：v1.0
> Version: v1.0

> 基于：私有 roadmap「HS 系列（业务安全的 Agent harness）」章节
> Based on: "HS series (business-safe Agent harness)" section of the private roadmap

> 关联项目：KeelBase（App 全栈开发平台）
> Related project: KeelBase (App full-stack development platform)

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

给 AI 审计（`ai_audit_logs`）与操作审计（`operation_audit_logs`）加**哈希链**：每条记录存 `prev_hash`（前一条的 hash）+ `hash`（本条内容 HMAC）。任一条记录被改、删、换序都会导致重算不一致，管理台可一键校验整条链完整性——对「全链路审计」是实质性增强，企业过审加分项。

Add a **hash chain** to the AI audit (`ai_audit_logs`) and operation audit (`operation_audit_logs`): each record stores `prev_hash` (the previous record's hash) + `hash` (HMAC of this record's content). Any tampering (modify/delete/reorder) breaks the recomputed chain, and admins can verify chain integrity in one call — a substantive enhancement to end-to-end auditing and an enterprise-audit plus.

### 1.2 关联需求 / 1.2 Related Requirements

- PL-2 通用操作审计（OperationAuditLog + 全局拦截器）
- AI 审计（AiAuditLog + AuditService）
- 借鉴 Aegis 等安全控制面的审计完整性设计

---

## 2. 数据规格 / 2. Data Specification

两张审计表各加两列：

Two audit tables each gain two columns:

| 表 Table | 列 Column | 类型 Type | 说明 Description |
|---------|----------|----------|------------------|
| `ai_audit_logs` | `prev_hash` | varchar(64) NULL | 前一条记录的 hash；首条为 NULL。Hash of the previous record; NULL for the first. |
| `ai_audit_logs` | `hash` | varchar(64) NULL | 本条内容 HMAC（sha256）。HMAC (sha256) of this record's content. |
| `operation_audit_logs` | `prev_hash` | varchar(64) NULL | 同上。Same as above. |
| `operation_audit_logs` | `hash` | varchar(64) NULL | 同上。Same as above. |

迁移：`AddAuditHashChain`（纯加列，sqlite 主链；postgres 基线后续随基线更新）。

Migration: `AddAuditHashChain` (purely additive columns, sqlite primary chain; postgres baseline updated with the baseline later).

---

## 3. 接口规格 / 3. API Specification

新增两个 admin 校验端点：

Two new admin verification endpoints:

| Method | Path | Auth | 说明 Description |
|--------|------|------|------------------|
| GET | `/api/v1/audit/logs/verify` | ADMIN | AI 审计哈希链完整性校验。Verify AI audit hash chain integrity. |
| GET | `/api/v1/audit/operations/logs/verify` | ADMIN | 操作审计哈希链完整性校验。Verify operation audit hash chain integrity. |

响应 / Response:

```json
{ "valid": true, "checked": 1250 }
```

`valid=false` 时带 `brokenIndex`（1 起断链位置）。`valid=false` carries `brokenIndex` (1-based position of the break).

---

## 4. 业务规则 / 4. Business Rules

1. **链算法**：`hash = HMAC-SHA256(hmacKey, prevHash|canonicalJSON(payload))`。`hmacKey = sha256('keelbase:audit-chain:v1' + (ENCRYPTION_KEY || JWT_SECRET))`——密钥域分离，改库无密钥者无法伪造合法链。
   **Chain algorithm**: `hash = HMAC-SHA256(hmacKey, prevHash|canonicalJSON(payload))`. `hmacKey = sha256('keelbase:audit-chain:v1' + (ENCRYPTION_KEY || JWT_SECRET))` — domain-separated key; an attacker without the key cannot forge a valid chain.
2. **canonical payload**：字段按名排序、undefined 剔除、JSON 序列化；写入与校验共用同一 `_payload`，保证两端一致。`createdAt`/`id` 不入 payload（createdAt 由 DB 生成），链式顺序由 `prevHash` 绑定。
   **Canonical payload**: fields sorted by name, undefined stripped, JSON-serialized; write and verify share the same `_payload` for consistency. `createdAt`/`id` are excluded (createdAt is DB-generated); chain order is bound by `prevHash`.
3. **校验**：沿 id 升序遍历，重算每条 `hash` 并核对 `prevHash` 连续性；任一不匹配即断链。
   **Verification**: walk by ascending id, recompute each `hash` and check `prevHash` continuity; any mismatch is a break.
4. **完整性**：改业务字段 → 本条 hash 不匹配；改 hash → 下条 prevHash 不匹配；删/换序 → prevHash 连续性断裂。
   **Integrity**: editing a business field breaks this record's hash; editing a hash breaks the next record's prevHash; delete/reorder breaks prevHash continuity.
5. **兼容**：既有历史记录 hash/prev_hash 为 NULL（迁移不反填），verify 会把首条 NULL 前的记录跳过？——不：首条 NULL 视为起点（genesis），其后若出现 hash NULL 即断链。历史记录（迁移前）整段 hash 为 NULL，verify 从第一条有 hash 的记录作为新起点校验后续。见 §6 局限。
   **Compatibility**: existing legacy records have NULL hash/prev_hash (migration does not backfill); verify treats the first hashed record as the new chain start. Legacy segment (pre-migration) is NULL-hashed and skipped as chain start. See §6 limitations.
6. **降级**：无密钥（ENCRYPTION_KEY 与 JWT_SECRET 均缺）时用固定 dev 密钥，仅开发环境可达；生产必配 JWT_SECRET。
   **Degradation**: with no key (both ENCRYPTION_KEY and JWT_SECRET absent), a fixed dev key is used — reachable only in dev; production must set JWT_SECRET.

---

## 5. 配置与密钥 / 5. Configuration & Key

无新增 env——复用 `ENCRYPTION_KEY` / `JWT_SECRET`。链密钥与数据加密密钥域分离（HMAC 派生）。

No new env — reuses `ENCRYPTION_KEY` / `JWT_SECRET`. The chain key is domain-separated from data-encryption keys (HMAC derivation).

---

## 6. 局限 / 6. Limitations

- 并发写极小概率链分叉（两条记录同 prevHash）：verify 会把分叉当断链标出。审计量低、可接受，后续可用事务+行锁升级。
  Concurrent writes can rarely fork the chain (two records with the same prevHash); verify flags a fork as a break. Audit volume is low; acceptable; can be upgraded with transactions + row locks later.
- 迁移前的历史记录不反填 hash，verify 从首个有 hash 的记录重新起链。
  Pre-migration legacy records are not backfilled; verify restarts the chain from the first hashed record.
- `createdAt` 不入 payload（DB 生成、精度差异），时间顺序由 id/prevHash 隐含绑定。
  `createdAt` is excluded from the payload (DB-generated, precision differences); temporal order is implicitly bound by id/prevHash.

---

## 7. 测试 / 7. Tests

- `audit-chain.service.spec.ts`：computeHash 稳定性/键序/undefined/链式/密钥隔离 + verifyChain 空链/合法链/篡改检测/断链检测（9 用例）。
- `audit.service.spec.ts` / `operation-audit.service.spec.ts`：log 写入 prev_hash+hash、串接上条 hash、verifyChain 委托。
- 全量：850 后端单测 + e2e 全绿。
