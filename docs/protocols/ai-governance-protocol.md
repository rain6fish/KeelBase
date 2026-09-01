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

> 审计证据包（§2.5）是**审计哈希链的应用层导出**（链数据 + 合规摘要，离线可复核），不单列为第四协议。

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
key            = AUDIT_HMAC_KEY                         # 当前签名密钥（64 hex，独立配置）
legacy         = HMAC-SHA256( "keelbase:audit-chain:v1", secret )   # 历史密钥派生（secret = ENCRYPTION_KEY || JWT_SECRET）
candidateKeys  = [ AUDIT_HMAC_KEY, AUDIT_HMAC_KEY_PREVIOUS, legacy ]  # 去重；current 签名、候选集验证
hash           = HMAC-SHA256( key, `${prevHash ?? 'genesis'}|${canonicalJSON(payload)}` )
```

- `prevHash` 为前一条 hash（hex）；**genesis 记录计算时用字面量 `'genesis'`**（DB 存 NULL）——与空串区分。
- 分隔符为单个竖线 `|`（`prevHash` + `|` + canonical）。payload 序列化见 2.3。
- **密钥域分离**：current 用独立 `AUDIT_HMAC_KEY`（64 hex）；legacy 以固定域字符串 `keelbase:audit-chain:v1` 作 HMAC key 对 secret 派生——与数据加密密钥隔离，无密钥者无法伪造合法链。
- **轮换**：`AUDIT_HMAC_KEY_PREVIOUS` 保留旧密钥；verify 用候选密钥集任一匹配即通过——换 key 后旧记录仍可验证，新记录用 current 签名。

### 2.3 Canonical Payload / Canonical JSON

写入与校验共用同一 payload，保证两端一致：

```
canonical = JSON.stringify( payload, Object.keys(payload).filter(k => payload[k] !== undefined).sort() )
```

- **顶层键按名称排序**（字典序），经 `JSON.stringify` 的 replacer 数组实现（replacer 作用于对象各层；审计 payload 为扁平结构，嵌套对象不在排序键集内会被过滤——实现语义以此为准）；
- **undefined 剔除**（null 保留）；
- **排除 `id` 与 `createdAt`**（id 为自增、createdAt 由 DB 生成）；链式顺序由 `prevHash` 绑定。

### 2.4 校验流程 / Verify Procedure

1. 按 **id 升序**遍历记录；
2. 对每条重算 `hash`，并核对 `prevHash` 等于上一条 `hash`；
3. 任一不匹配 → 断链（返回 1 基 `brokenIndex`）；全部匹配 → `valid=true`。

**篡改语义**：改业务字段 → 本条 hash 不匹配；改 hash → 下条 prevHash 不匹配；删 / 换序 → prevHash 连续性断裂。并发写极小概率分叉（两条同 prevHash），verify 标为断链。

**genesis 兼容**：迁移前历史记录 `hash/prev_hash` 为 NULL；verify 将**首个有 hash 的记录**作为新起点校验后续（历史段视为链前）。

### 2.5 审计证据包协议 / Audit Evidence Package

**定位**：审计哈希链（§2）的**应用层导出**——把链数据 + 合规摘要打包成可提交审计机构的证据，**离线机器可验证**（不依赖 KeelBase）。参考实现：`GET /audit/action-report/export` + `Server-NestJS/scripts/verify-evidence.mjs`。

**格式版本 / Format**：`keelbase-audit-evidence/1`（基础：summary + hashChain + effectDiffs + chain + signature）；`keelbase-audit-evidence/2`（A-6 合规段 `compliance`，签名覆盖）。`verify-evidence.mjs` 接受 v1/v2 向后兼容。

**结构 / Schema**：

| 字段 | 类型 | 语义 |
|---|---|---|
| `format` | string | 格式版本 |
| `exportedAt` | ISO 8601 | 导出时间 |
| `generator` | string | 生成工具标识（`keelbase-audit-export`） |
| `report` | object | ActionReport（summary / hashChain / byAction / byDay / samples / effectDiffs） |
| `compliance` | array(opt) | v2：samples 每条的业务摘要 + 责任链 + 授权依据（合规叙事） |
| `chain` | array | **全量链行**（见下）——离线重算的原始数据 |
| `signature` | string\|null | 证据包签名（见下）；未配密钥时为 null |

**chain 行 / Chain Row**：

| 字段 | 类型 | 语义 |
|---|---|---|
| `seq` | int | 链序号（1 起，沿 id 升序） |
| `id` | int | 审计记录 id |
| `prevHash` | string\|null | 前一条 hash；首条为 null（genesis） |
| `hash` | string | 本条 hash（64 hex，§2.2 算法） |
| `payload` | object | 链 payload（canonical 输入，§2.3）——离线重算用，必须与写入侧一致 |

**签名 / Signature**：`HMAC-SHA256( key, canonicalJSON({ summary, hashChain, effectDiffs, compliance, chain, exportedAt }) )`，`key = AUDIT_HMAC_KEY || ENCRYPTION_KEY`。签名覆盖证据包全部证据内容——导出后任何改动 → 验签失败。

**离线验证 / Offline Verification**（独立实现，只依赖 §2 算法）：
- **无密钥**：结构验证——`seq` 连续 / `hash` 64 hex / `prevHash` 连续 / 首行 genesis。能检测**删行、换序、断链**。
- **`--key <AUDIT_HMAC_KEY>`**：全量重算每条 `payload` 的 hash（§2.2）+ 证据包验签。能检测**内容篡改**与导出后改动。
- 审计机构持有密钥或部署方提供 verify 报告即可独立复核（合规场景：等保 / 密评配合材料）。

**与 §2 的关系**：`chain` 行即审计链原始数据（id / prevHash / hash / payload），`payload` 复用 §2.3 canonicalJSON——证据包是链的**可导出、可离线复核的应用层**，不引入新算法。

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

### 4.4 MCP 工具声明治理扩展 / MCP Tool Declaration Governance Extension

**目的**：让治理契约跨 MCP 生态可读——任何 MCP 客户端（Agent Framework / Gateway / 工具注册表）在 `tools/list` 即可看到每个工具的风险级与执行策略，从而按治理策略编排。KeelBase 对外 MCP 出口（HS-10）与接入外部 MCP server 的网关（Secure MCP Gateway）共用同一套声明语义。

**KeelBase 出口声明格式**（每个工具的 MCP Tool 对象；SDK `ToolSchema` 无 passthrough，自定义字段必须走标准扩展槽）：

```json
{
  "name": "create_followup_task",
  "description": "...",
  "inputSchema": { "type": "object", "properties": {} },
  "annotations": { "readOnlyHint": false, "destructiveHint": false },
  "_meta": {
    "keelbase": {
      "riskLevel": "R3",
      "riskStrategy": "confirmation",
      "requiresConfirmation": true
    }
  }
}
```

**字段语义 / Field Semantics**：

| 字段 | 类型 | 语义 |
|---|---|---|
| `annotations.readOnlyHint` | boolean | R0–R2（自动/读）→ `true`；R3–R5 → `false`（MCP 标准 hint，粗粒度） |
| `annotations.destructiveHint` | boolean | 仅 R5（不可逆/外部动作）→ `true`；其余 → `false`（R3/R4 为 additive 写，标注非破坏性；权威值以 `_meta.keelbase.riskLevel` 为准） |
| `_meta.keelbase.riskLevel` | string | **权威值**：R0–R5（§4.1 分级表） |
| `_meta.keelbase.riskStrategy` | string | `auto` / `policy` / `confirmation` / `human_approval` / `block`（§4.1） |
| `_meta.keelbase.requiresConfirmation` | boolean | 是否需人工确认（R3/R4） |

**实现要求**：对齐本协议的实现将工具暴露为 MCP server 时，应在 `_meta.keelbase` 携带上述三项（`annotations` 为可选的 MCP 标准提示）；消费外部 MCP server 工具时，若对方声明了 `_meta.keelbase` 或等价风险级，应以其门控；未声明则按 §4.2 派生规则判定（写 → R3，读 → R1）。

### 4.5 治理 sidecar 零代码接入协议 / Sidecar Zero-code Adoption

**定位**（护城河 2.0 嵌入广度）：业务系统**不改代码**把 AI 调用接进治理——唯一改动 = 把 LLM base URL 指向 sidecar。sidecar 拦截 → 上报治理台审计 + 转发真实 LLM + 工具门控（S-1/S-2）。参考实现：`Server-NestJS/src/governance-sidecar/` + [MOAT-1「30 分钟接入验证」](../manual/adoption-30min.md)。

**端点 / Endpoints**（业务系统 → sidecar；sidecar 默认端口 3200）：

| 端点 | 语义 |
|---|---|
| `POST /v1/chat/completions` | OpenAI 兼容转发（业务系统 LLM 调用原样转发真实上游）+ 上报治理台审计（source=sidecar）+ 工具门控（S-2） |
| `POST /v1/confirmations/:token` | 确认决策：`approve` → 返回含原 `tool_calls` 的响应；`reject` → 返回拒绝响应 |
| `POST /v1/policy` | 接收治理台策略推送（B2，服务身份 `x-api-key` = `GOVERNANCE_API_KEY`），实时覆盖门控策略 |
| `POST /v1/confirmations` | 待确认列表（诊断，服务身份） |

**用户归因**：`x-user-id` 请求头（业务系统可选传；缺省 `sidecar`）——审计归因到调用者。

**门控语义**（对齐 §4.3，在 sidecar 落点）：
- **R5** → `block`：剥离 `tool_calls`，注入阻断说明（该操作被安全策略阻断）。
- **R3/R4** → `confirm`（hold-and-release）：剥离 `tool_calls`，在 `message.confirmation` 携带 `{ token, tools }`；业务系统 `POST /v1/confirmations/:token` 批准后取回**原响应**（含 tool_calls）执行，拒绝则返回拒绝说明。
- **R0-R2** → `auto`：原样放行。
- 策略覆盖：`enabled=false` → block；`requiresConfirmation=true` → confirm（覆盖 R0-R2）；`SIDECAR_TOOLS` 未登记工具用默认风险级（`SIDECAR_DEFAULT_TOOL_RISK`，缺省 R1）。

**审计上报**：每条 chat（请求/响应）与每次工具调用决策（`tool_call`）落治理台审计（`source=sidecar`），含请求摘要（首条 user 内容前 60 字符）、tokens、耗时、门控决策（risk + decision）——入同一哈希链。

**服务身份**：sidecar → 治理台用 `GOVERNANCE_API_KEY`（`x-api-key`）；治理台 → sidecar 策略推送同密钥校验——防未授权篡改策略/枚举确认。

**与 §5 的关系**：sidecar 是「零代码接入」的渠道实现；接入方业务系统本身不实现协议（透明代理），sidecar 作为治理体系的接入端点对齐本协议。

---

## 5. 兼容实现清单 / Compatible Implementations

**兼容含义**：实现对三大协议（审计链 / 委托 token / 风险分级）中任一协议的算法、格式、语义与本文档一致，即可与 KeelBase 治理体系互操作——进同一审计链、识别同一委托身份、按同一风险策略门控。清单随实现演进维护；新增实现按 §2–§4 对齐后在此登记（✅=对齐，🔶=部分对齐，⬜=待续）。

| 实现 | 语言/形态 | 审计哈希链 | 委托 token | 工具风险分级 | 说明 |
|---|---|---|---|---|---|
| **Server-NestJS**（参考实现） | TypeScript / NestJS | ✅ HS-11 全链 + verify | ✅ 签发 + 验签（ai-bridge §5） | ✅ R0–R5 + 门控/确认/审批（HS-9/R4） | 治理体系权威实现（src/ai、src/auth、src/ai/governance） |
| **KeelBase-java-starter** | Java / Spring Boot | 🔶 补偿脚手架幂等账本 + 审计上报（扩展中） | ✅ `DelegationAuthFilter`（HS256 + aud/iss/exp，fail-open + 保护路径 fail-closed） | ✅ `@KeelbaseTool` 类型/风险级口径对齐生成器 | 存量 Java 系统接入层（✅ Maven Central 已发布，0.1.2） |
| **governance-sidecar** | TypeScript / 独立服务 | ✅ 审计上报治理台（source=sidecar，落治理库链，含工具调用决策） | —（服务身份 `GOVERNANCE_API_KEY`，非委托 token） | ✅ S-2 工具门控/确认/策略应用（§4.3 R5 阻断 / R3-R4 hold-and-release / 策略覆盖） | 零代码接入：业务系统 LLM base URL → sidecar → 治理台 |
| **Secure MCP Gateway** | TypeScript / NestJS | ✅ 每次调用落 AI 审计（provider=mcp 归因） | —（调用者 JWT 身份） | ✅ 工具声明 riskLevel/riskStrategy（A2）+ **§4.4 MCP 声明扩展**（annotations + `_meta.keelbase`）+ 写需确认不自动执行 | MCP 出口，以调用者身份过治理管线 |
| **headless API** | TypeScript / NestJS | ✅ 复用 Agent 审计（key 归属用户身份） | —（API Key 身份，归属 owner 用户） | ✅ 复用 Agent 工具门控（HS-4） | 第三方集成入口（x-api-key 认证） |

**对齐路径**：新实现者按 §2–§4 逐条对齐后在此登记；可运行 [MOAT-1「30 分钟接入验证」](../manual/adoption-30min.md)（`verify-moat-adoption.mjs`）验收接入闭环。

### 5.1 认证 / Certification

**协议合规认证套件（护城河 2.1 / A1）**：`Server-NestJS/scripts/verify-protocol-conformance.mjs` **独立实现**三大协议——canonicalJSON/hash/链校验（§2）、委托 token HS256 验签（§3）、风险分级派生（§4），用测试向量 + 篡改检测锁定协议语义（篡改 payload / 断链 / aud 不匹配 / 过期 / 签名篡改均必须拒绝），输出机器可读报告（`docs/benchmark/protocol-conformance-<ts>.json`）。

**用法**：`node scripts/verify-protocol-conformance.mjs`（确定性、无服务依赖，可 CI）。参考实现当前 **22/22 通过**（2026-08-31）。

**第三方自认证**：声明兼容本协议的实现（java-starter / sidecar / 新实现）可用同一套算法与向量复现——以自身实现复算 §2.2 hash、§3 委托 token 验签、§4 风险派生，与协议测试向量比对一致即视为通过；通过后在 §5 兼容清单登记并附 conformance 报告日期。

**审计证据包离线验证（A2，护城河 2.3）**：证据包格式见 **§2.5 审计证据包协议**（`keelbase-audit-evidence/1|2`）。`Server-NestJS/scripts/verify-evidence.mjs` 独立验证导出的证据包（`GET /audit/action-report/export`）——无密钥验链结构（删行/换序/断链），`--key <AUDIT_HMAC_KEY>` 全量重算每条 payload + 证据包验签（内容篡改检测）。审计机构不依赖 KeelBase 即可复核（见 [compliance-mapping](../manual/compliance-mapping.md)）。

**治理策略实时推送（B2，护城河 2.2）**：sidecar 启动时向治理台注册回调（`SIDECAR_CALLBACK_URL`，`POST /external/governance/sidecars/register`）；策略变更（apply-preset / PUT policy）后治理台向已注册 sidecar 实时推送（`POST {cb}/v1/policy`，服务身份），秒级生效；60s 轮询保留作兜底（推送失败 / sidecar 重启 / 漏注册）。

---

## 6. 相关 / Related

- [hs11-audit-chain.spec.md](../hs11-audit-chain.spec.md) · [hs9-governance-policy.spec.md](../hs9-governance-policy.spec.md) · [hs10-mcp-adapter.spec.md](../hs10-mcp-adapter.spec.md)
- [ai-bridge.md](../manual/ai-bridge.md)（§5 委托身份）· [governance-capability.md](../governance-capability.md) · [governance-deploy.md](../manual/governance-deploy.md)
