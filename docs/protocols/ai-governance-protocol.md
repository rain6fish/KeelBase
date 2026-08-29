# KeelBase AI 治理协议 / AI Governance Protocol

> **定位**：语言无关的 AI 治理协议描述（算法 / 格式 / 语义），供任何后端实现（KeelBase-java-starter / Node / Python）对齐，实现「跨系统统一的 AI 可审计、可确认、可撤销」。
> **Positioning**: Language-agnostic protocol description (algorithm / format / semantics) for any backend implementation (KeelBase-java-starter / Node / Python) to align on unified cross-system AI governance (auditable, confirmable, revocable).
>
> **参考实现**：`Server-NestJS`（src/ai、src/auth）。Java 侧参考：`KeelBase-java-starter`。
> **Reference implementation**: `Server-NestJS`. Java side: `KeelBase-java-starter`.

---

## 1. 协议三件套 / Protocol Suite

| # | 协议 | 解决的问题 | 核心语义 |
|---|---|---|---|
| 1 | **审计哈希链** | AI/操作审计不可篡改、可验证 | 每条记录 HMAC + `prev_hash` 链式绑定；verify 可验证完整性 |
| 2 | **委托 token** | 跨系统身份桥接（存量系统识别调用者） | 短期 JWT + audience 限定 + 统一身份映射键 |
| 3 | **工具风险分级** | AI 工具执行策略统一（读自动 / 写确认 / 阻断） | R0–R5 + riskStrategy → 执行策略 |

---

## 2. 审计哈希链协议 / Audit Hash Chain

### 2.1 记录结构 / Record Schema

审计表（`ai_audit_logs` / `operation_audit_logs`）每记录含两列：

| 列 | 类型 | 语义 |
|---|---|---|
| `prev_hash` | varchar(64) NULL | 前一条记录的 `hash`；**首条（genesis）为 NULL** |
| `hash` | varchar(64) NULL | 本条内容 HMAC（SHA-256，hex 64 字符） |

### 2.2 哈希算法 / Hashing Algorithm

```
hash = HMAC-SHA256( hmacKey, prevHash || canonicalJSON(payload) )
hmacKey = SHA-256( "keelbase:audit-chain:v1" || secret )
secret  = ENCRYPTION_KEY || JWT_SECRET        # 缺省回退；密钥域分离
```

- `prevHash` 为前一条 hash（hex）；genesis 记录 `prevHash` 为空串。
- `||` = 字节拼接。payload 序列化见 2.3。
- **密钥域分离**：链密钥由固定域字符串 `keelbase:audit-chain:v1` HMAC 派生，与数据加密密钥隔离——无密钥者无法伪造合法链。

### 2.3 Canonical Payload / Canonical JSON

写入与校验共用同一 payload，保证两端一致：

- 字段**按名称排序**（字典序）；
- **undefined 剔除**（null 保留）；
- 标准 JSON 序列化；
- **排除 `id` 与 `createdAt`**（id 为自增、createdAt 由 DB 生成）；链式顺序由 `prevHash` 绑定。

### 2.4 校验流程 / Verify Procedure

1. 按 **id 升序**遍历记录；
2. 对每条重算 `hash`，并核对 `prevHash` 等于上一条 `hash`；
3. 任一不匹配 → 断链（返回 1 基 `brokenIndex`）；全部匹配 → `valid=true`。

**篡改语义**：改业务字段 → 本条 hash 不匹配；改 hash → 下条 prevHash 不匹配；删 / 换序 → prevHash 连续性断裂。并发写极小概率分叉（两条同 prevHash），verify 标为断链。

**genesis 兼容**：迁移前历史记录 `hash/prev_hash` 为 NULL；verify 将**首个有 hash 的记录**作为新起点校验后续（历史段视为链前）。

---

## 3. 委托 token 协议 / Delegation Token

### 3.1 格式 / Format

JWT（**HS256**），用共享密钥 `DELEGATION_SECRET` 签名（缺省回退 `JWT_SECRET`，生产应独立配置）。短时效 + audience 限定。

### 3.2 Claims 表 / Claim Semantics

| Claim | 类型 | 语义 |
|---|---|---|
| `sub` | string | **统一身份映射键**：OIDC subject 或 `local:<userId>`（KeelBase 本地用户前缀） |
| `oidcSub` | string(opt) | OIDC subject（统一身份源映射键）；无 OIDC 时为 `local:<userId>` |
| `aud` | string | **目标系统 audience**（如 `legacy-erp`）；格式 `/^[\w.:-]{1,64}$/` |
| `iss` | string | `keelbase` |
| `iat` / `exp` | number | 签发 / 过期（默认 TTL 300s，合法范围 60–3600s） |

### 3.3 验签流程 / Verification

1. 用共享 `DELEGATION_SECRET` 验签（HS256）；
2. 校验 `aud` 等于目标系统标识（防跨系统冒用）；
3. 校验 `exp` 未过期；
4. 用 `sub`（`oidcSub` 或 `local:<userId>`）**映射本地用户**——映射后按用户自身权限判断，**委托 token 不做提权**。

---

## 4. 工具风险分级协议 / Tool Risk Levels

### 4.1 分级表 / Level Semantics

| 级 | 含义 | riskStrategy | 执行策略 |
|---|---|---|---|
| R0 | Informational | `auto` | 自动执行 |
| R1 | Read | `auto` | 自动执行（读） |
| R2 | Low-risk Write | `policy` | 治理策略决定 |
| R3 | Business-sensitive Write | `confirmation` | **需人工确认**（不确认不执行） |
| R4 | High-impact Action | `human_approval` | **双人审批**（operator ≠ approver） |
| R5 | Irreversible / External Action | `block` | **阻断**（不进确认/执行） |

### 4.2 派生规则 / Derivation

显式声明的 `riskLevel` 优先；未声明时按写语义派生：`requiresConfirmation` 写工具 → **R3**；其余（读）→ **R1**。

### 4.3 与治理管线映射 / Governance Pipeline

```
工具调用 → 风险级（R0-R5）
  → R5 阻断（risk_policy）
  → 治理策略：启用开关 → 角色白名单（实时查库）
  → 数据范围（本人/组织）
  → R3/R4 触发确认（R4 双人审批）→ 批准后执行
  → 副作用登记（可撤销）→ 审计哈希链 + 决策轨迹
```

---

## 5. 跨语言实现对齐清单 / Cross-Language Conformance

实现应满足（KeelBase-java-starter 已对齐标注 ✅）：

| 协议 | 对齐要求 | Java Starter |
|---|---|---|
| 审计链 | HMAC-SHA256 + 域分离 key + canonical JSON + verify 升序 | 补偿脚手架含幂等账本（审计上报待扩展） |
| 委托 token | HS256 验签 + `aud` 校验 + `sub` 映射 + `exp` | ✅ `DelegationAuthFilter`（HS256+aud/iss/exp，fail-open+保护路径 fail-closed） |
| 风险分级 | R0–R5 语义 + riskStrategy 派生 | ✅ `@KeelbaseTool` 类型/风险级口径对齐生成器 |

---

## 6. 相关 / Related

- [hs11-audit-chain.spec.md](../hs11-audit-chain.spec.md) · [hs9-governance-policy.spec.md](../hs9-governance-policy.spec.md) · [hs10-mcp-adapter.spec.md](../hs10-mcp-adapter.spec.md)
- [ai-bridge.md](../manual/ai-bridge.md)（§5 委托身份）· [governance-capability.md](../governance-capability.md)
