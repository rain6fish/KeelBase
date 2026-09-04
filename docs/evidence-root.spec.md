# Evidence Root（AUDIT-ID）跨链证据根 — 功能规格 (Spec) / Evidence Root (AUDIT-ID) Cross-Chain Evidence Root — Functional Specification

> 版本 / Version: v0.1（设计，roadmap §22.17 ① 冻结后主项）
> 日期 / Date: 2026-09-04
> 状态 / Status: Draft（9/25 冻结前只出规格，落地在冻结后）/ Draft (spec only before freeze; implementation post-freeze)

> 基于 / Based on：私库 roadmap §22.17 ①（Business Action 证据根 / 跨链锚定）+ 冻结后 backlog P-③（Policy 历史表）；现有证据线 L0/L1/L2 分层（docs/evidence/README.md §1）+ A-6 证据包 v2（keelbase-audit-evidence/2）+ Policy Evidence（docs/audit-authz-snapshot.spec.md §5）。
> Related: docs/evidence/README.md ｜ docs/protocols/ai-governance-protocol.md §2.5 ｜ docs/audit-authz-snapshot.spec.md ｜ docs/ai-action-center.spec.md §5.3（契约锁定）｜ Server-NestJS/scripts/verify-evidence.mjs

---

## 1. 概述 / 1. Overview

### 1.1 问题 / 1.1 Problem

审计报告认定的护城河级缺口：**证据之间还没做成不可分割的强关联**。现状（实证）：
- `ai_audit_logs` 与 `operation_audit_logs` 是**两条独立哈希链**；证据包 v2 的 `chain` 只含 ai_audit_logs 一条（操作审计链、副作用行都不在包内）。
- `ai_tool_side_effects` **没有 hash/prevHash**——副作用行不在任何链里。
- 三表之间**无直接 FK**：现链接靠 `conversationId` / `businessEvent` / REST `path→targetId` 反查（`OperationAuditService.findByTargetId` + `BusinessHistoryService` 三源聚合）。
- 单条证据包目前只有「单链逐行重算 + 整包 HMAC」；没有「一条业务动作跨三表 hash 摘要」的**逐动作取证粒度**。

即：企业审计员问「这条 AI 行为为什么发生、凭什么允许（哪一版规则）、改了哪个对象、走了哪条 REST 写、能否离线整体验」——零件都有，但不是一个可整体验证的证据对象。

### 1.2 目标 / 1.2 Goal

把一条 **Business Action（resultType:resultId，AUDIT-ID）** 的授权快照（含 `policy.revision`）+ Decision Evidence + AI 审计链行 + 副作用行 + 对应 operation_audit 链行，绑成一个 **`keelbase-audit-evidence/3` 单文件证据根**：离线用一条命令**整体验证**（各链行 hash 重算 + 跨链根锚 + 整包 HMAC），可作为信创/等保的逐动作举证材料。沿用既有原语（canonicalJSON / HMAC-SHA256 / 同族 format 命名），**不引入新算法、不新增数据库列、不破坏 v1/v2**。

### 1.3 非目标 / 1.3 Non-goals

- ❌ 给 `ai_tool_side_effects` 加链列（无迁移；副作用以"bundle 自洽摘要 + 整包签名"锚定，见 §5.4 诚实边界）。
- ❌ 导出全量两条链（体积失控）；只导出该动作相关的**定向子链行**。
- ❌ 改 Action Center / B4 前端契约（`effectId`+`resultType:resultId` 不变，见 ai-action-center.spec.md §5.3）。
- ❌ Policy 历史表 / 跨版本真回放（另立 P-③，本规格只承载"当时 `policy.revision`"）。
- ❌ 国密 SM2 / 可信时间戳（roadmap §22.17 ② 另立）。

---

## 2. 范围 / 2. Scope

- 新增导出端点：`GET /ai/governance/evidence-root/:resultType/:resultId`（本人或管理员，鉴权对齐 B4 `governanceAction`）→ 返回 `keelbase-audit-evidence/3` 单文件证据根。
- `verify-evidence.mjs` 支持 `keelbase-audit-evidence/3`（structure + `--key` full 两模式），v1/v2 行为不变。
- 顶层 Schema 延续 v2 并新增动作根段（见 §3）；整包签名 canonical 在 v3 分支加入新段，两处（export 侧 + verifier 侧）同步。

---

## 3. 顶层 Schema（v3）/ 3. Top-Level Schema (v3)

```jsonc
{
  "exportedAt": "2026-09-04T10:30:00.000Z",        // ISO 8601
  "generator": "keelbase-audit-export",
  "format": "keelbase-audit-evidence/3",           // v3 标识
  "action": {                                       // AUDIT-ID 键集（§22.17 ① / ai-action-center.spec §5.3）
    "id": "crm_task:42",
    "resultType": "crm_task",
    "resultId": 42,
    "effectId": 9281,                               // 副作用行 id（跨引）
    "userId": "42",
    "conversationId": 318
  },
  "summary": { "sentence": "...", "stats": {...} }, // summarizeAudit（复用）
  "authorization": {                                // 投影 _identityChainFromRow.allowed（含 policy.revision）/denied
    "allowed": { "checks": [...], "riskLevel": "R3", "policy": { "revision": "ab12cd34ef56", "updatedAt": "..." } },
    "denied": null
  },
  "decision": { "businessEvent": "FollowupTaskCreated", "evidence": { "decision": "...", "evidence": [], "policy": "..." } },
  "effect": {                                       // ai_tool_side_effects 投影（数据最小化）
    "id": 9281, "toolName": "create_followup_task", "before": null, "after": "{...}", "revoked": false
  },
  "chains": {
    "aiAudit": [ /* EvidenceChainRow[]：同会话/命中该 action 的 AI 审计行 {seq,id,prevHash,hash,payload} */ ],
    "operationAudit": [ /* EvidenceChainRow[]：findByTargetId 命中该业务对象的 REST 写行 */ ]
  },
  "root": {                                         // 跨链根锚（§5）
    "algorithm": "keelbase-evidence-root/1",
    "anchors": [
      { "kind": "ai-audit",   "rowId": 38172, "hash": "<64hex>" },
      { "kind": "side-effect","rowId": 9281,  "hash": "<64hex, bundle 自洽摘要>" },
      { "kind": "op-audit",   "rowId": 512,   "hash": "<64hex>" }
    ],
    "digest": "<64hex = sha256(canonicalJSON(anchors))>"
  },
  "signature": "<HMAC-SHA256(key, canonical)>"      // v3 canonical 含 action/summary/authorization/decision/effect/chains/root/exportedAt
}
```

- **复用既有算法原语**：`canonicalJSON`（顶层键排序、undefined 剔除、null 保留）与 `chainHash = HMAC-SHA256(key, \`${prevHash ?? 'genesis'}|${canonicalJSON(payload)}\`)`，与 `AuditChainService` / `verify-evidence.mjs` 一致（不新引入）。
- **向后兼容**：`verify-evidence.mjs` 对 `/1` `/2` 分支不变；新增 `/3` 分支（structure 必查 `action`+`root.anchors`；`--key` full 再验 §5.2–5.4）。整包签名 canonical：v3 时在既有 v2 canonical 键集基础上加 `action/summary/authorization/decision/effect/root`（`chains` 行已随 `chain` 语义并入——见 §5.3 决定，保持两处一致）。

---

## 4. 数据装配（服务端）/ 4. Data Assembly (server)

按 `action.id = resultType:resultId` 装配（复用既有查询，零新表）：

| 段 | 来源 | 取数 |
|---|---|---|
| `effect` | `AiToolEffectsService.findByTarget(resultType, resultId)`（或 effectId）| 单副作用行投影 |
| `authorization`/`decision` | `AiAuditLog` 同 conversation 的 `tool_call` 行（该 effect 的 `conversationId` 内 `deriveAiBusinessEvent`/`resultType` 命中）| 复用 `_identityChainFromRow` 投影（含 policy.revision）+ `evidence`/`businessEvent` 列 |
| `chains.aiAudit` | 上述同 conversation AI 审计行（`logRepo.find({where:{conversationId}})`）| 组装 EvidenceChainRow（payload = `_payload(row)`）|
| `chains.operationAudit` | `OperationAuditService.findByTargetId(String(resultId), REST_RESOURCE_PATHS[resultType])` | 命中 REST 写行的链行 |
| `summary` | `AuditInterpreterService.summarizeAudit`（同会话聚合）| 复用 |

鉴权：本人或管理员（对齐 `governanceAction`：`effect.userId === user.sub` 或 `manage all`；无副作用 → 404）。

---

## 5. 离线验证语义 / 5. Offline Verification Semantics

`node scripts/verify-evidence.mjs <evidence-v3.json> [--key <AUDIT_HMAC_KEY>]`

### 5.1 Structure-only / 5.1 structure-only
- format 认 `/3`；`action.id === \`${resultType}:${resultId}\`` 与 `action.effectId` 存在；`root.anchors` 非空；每个锚 hash 匹配 `^[0-9a-f]{64}$`。

### 5.2 AI 审计链行 / 5.2 aiAudit rows（`--key`）
逐行重算 `chainHash(key, prevHash|payload)` === `hash`（任一候选密钥；与 v2 同逻辑）。行间 prevHash 连续性仅在所导行**相邻且含上一行**时校验，否则跳过并标注 `segmentGap`（体积/隐私权衡）。

### 5.3 操作审计链行 / 5.3 operationAudit rows
同上逐行重算。operation-audit 的链 payload 定义（`userId/action/method/path/featureKey/featureFallback/targetId/requestBody/ip/userAgent/statusCode`）为**另一域**——`chainHash` 算法同一，仅 payload 形状不同；包内每行自带 payload，故离线可独立验，**不需导出操作审计全链**。

### 5.4 副作用锚（无链）与跨链根 / 5.4 side-effect anchor (unchained) + root
- side_effect 行无链 → 锚定 `hash = sha256(canonicalJSON({id,userId,conversationId,toolName,argsHash,resultType,resultId,beforeSnapshot,afterSnapshot,createdAt}))`（**bundle 自洽摘要**：由包内投影重算，防行内容被改；行唯一性/存在性由 `id` 锚定）。
- `root.digest = sha256(canonicalJSON(anchors))`——任一锚行内容或选择被改 → digest 变。
- 整包签名 canonical **含 root.digest 与 anchors** → HMAC 比对失败即整包被改。
- **诚实边界**：side_effect 锚是「自洽 + 整包签名」而非链内 prevHash 防插入；side_effect 行的防删除/防插入由 AI 审计链（tool_call 已记 `argsHash`/detail，链内在案）与包签名共同覆盖。真「防篡改插入副作用」需加链列——记 roadmap §22.17 ① 后续可选（非本规格范围）。

### 5.5 L0/L1/L2 分层对齐 / 5.5 L0/L1/L2
L0 运行时（`/audit/verify`、`/audit/operations/verify`）仍验全链；本 v3 为 L1 离线**逐动作**证据根（定向子链 + 根锚 + 签名）。留档产物沿用 `docs/benchmark/evidence-root-<ts>.json/.md`（L2）。

---

## 6. 端点契约 / 6. Endpoint Contract

- `GET /api/v1/ai/governance/evidence-root/:resultType/:resultId`（本人或管理员，无副作用 404，非本人非 admin 403）
- 管理台/证据面入口（后续）：AI Action Report / 审计 Action Detail 加「导出证据根（v3）」按钮；工作台 Action Center **不改**（其「查看证据」仍走 B4，v3 是审计/合规取证的下一层）。

---

## 7. 验收与测试 / 7. Acceptance & Testing

- 单元：装配（findByTarget 无副作用→404/鉴权）；authorization 投影含 `policy.revision`；operation 命中（findByTargetId path 子串正确）；root.digest 计算纯函数。
- verify-evidence v3：structure 误报（缺 action/锚格式坏）；`--key` 正确重算 PASS；篡改任一锚内容/换行/改 digest → FAIL；`--key` 错误键 → FAIL；v1/v2 包仍按旧分支验（向后兼容断言）。
- e2e：seed 一条 AI 写（确认→执行→REST 记录）→ 导出 v3 → `verify-evidence.mjs --key` 全 PASS；改一行后再验 FAIL。
- 文档：docs/evidence/README.md §2.7 加 v3 行；docs/protocols/ai-governance-protocol.md §2.5 补 v3 小节。

---

## 8. 文件改动清单 / 8. File Change List

| 文件 | 改动 |
|------|------|
| `Server-NestJS/src/ai/audit/audit.service.ts` | `getEvidenceRoot(resultType,resultId,viewer,isAdmin)`（装配 + v3 签名 canonical v3 分支）|
| `Server-NestJS/src/ai/audit/audit.controller.ts`（或 governance 控制器） | `GET /ai/governance/evidence-root/:resultType/:resultId` |
| `Server-NestJS/src/operation-audit/operation-audit.service.ts` | 暴露链行组装（`_payload`/行重算）给证据根（不破坏既有）|
| `Server-NestJS/scripts/verify-evidence.mjs` | 加 `/3` 分支（structure + full），v1/v2 不动 |
| `docs/evidence/README.md` + `docs/protocols/ai-governance-protocol.md` | 登记 v3 |
| 测试 | audit.service spec + verify-evidence（或 node --test 样例包）|

## 9. 关联 / 9. Related

roadmap §22.17 ①（本规格即其设计先行）｜P-③ Policy 历史表（跨版本真回放，衔接 verifyReproducible）｜§22.17 ② SM2/时间锚（v3 包后续加国密签名）｜docs/audit-authz-snapshot.spec.md §5 ｜ docs/ai-action-center.spec.md §5.3 ｜ docs/protocols/ai-governance-protocol.md §2.5
