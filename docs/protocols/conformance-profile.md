# 契约合规剖面 / Contract Conformance Profile

> **目的**：把「实现对协议一致」从 prose 变成**语言中性的可执行判据**——任何语言（TypeScript / Java / Go / Python）**不依赖 Node、不依赖 KeelBase 源码**，加载本仓 `specs/protocol/` 的机器语料 + 按 §2–§4 的算法规格复算，比对一致即自证合规。
> **回答**：`ai-governance-protocol.md §5.1` 的「第三方自认证」到底要复现**哪些**、判据是**什么**；以及「未来 Java Runtime 至少要对齐哪些」。
> **性质**：**收敛、不重建**——不改任何算法/形状，只把既有资产（语料 + JSON Schema + §2–§4 算法规格）组层、给出判据。载体开关仍守 ADR-0002 Demand-Gate。

---

## 1. 语料与算法（中立资产，任何语言可消费）

| 资产 | 路径 | 性质 |
|---|---|---|
| 算法规格 | `ai-governance-protocol.md` §2.2/§2.3（canonicalJSON，**语言中性编号规则**）/ §3.2（委托 token）/ §4.1–§4.2（风险派生） | 文字规格，语言无关 |
| canonical 金样本 | `specs/protocol/canonical-json-v1-vector.json` | `input → canonicalBytes`（含 unicode/嵌套/数字边界） |
| 审计链向量 | `specs/protocol/audit-hash-v1-vector.json` | `payload+key+prevHash → hash` + legacy 派生 + 篡改反例 |
| 委托 token 向量 | `specs/protocol/delegation-token-v1-vector.json` | 签发/验签（aud/iss/exp/签名篡改） |
| 风险分级向量 | `specs/protocol/risk-level-v1-vector.json` | R0–R5 派生 + RISK_STRATEGY 表 |
| 治理绑定向量 | `specs/protocol/governance-binding-v1-vector.json` | 工具→策略→放行决策 |
| 失败语义向量 | `specs/protocol/failure-semantics-v2-vector.json`（`-v1-` 冻结留档） | 失败态 → wire 形状 |
| 确认生命周期语料 | `specs/protocol/confirmation-lifecycle-v2-vector.json`（`-v1-` 冻结留档） | 状态机 + TTL |
| wire 对象 Schema | `specs/protocol/schemas/v1|v2/` + `wire-schema-registry.json`（44 对象） | JSON Schema draft-07（形状冻结） |
| 代表样例 | `specs/protocol/schemas/v*/samples/` | 每对象一份，过其 schema |

**中立复现方式**（任一语言）：`读向量 JSON → 按 §2/§3/§4 规格实现算法 → 复算并比对`；`读 schema + 样例 → 用任一标准 JSON Schema 校验器校验`。参考实现（Node）的 runner 只是**其中一种**实现，不是判据本身。

---

## 2. 合规分层 / Tiers

> 分层按「跨 Runtime 必须一致的语义面」划定；**Core 是任何声明合规的实现的底线**，Full 是「同一套前端 / 同一份证据可被其产出与服务」的门槛。

### 2.1 Core（治理互操作底线）

对齐 **三大协议**算法 + 格式 + 语义，即可进同一审计链、识别同一委托身份、按同一风险门控：

| # | 要求 | 判据（复算比对） |
|---|---|---|
| C1 | §2.2 链 hash + §2.3 canonicalJSON | 逐条复算 `canonical-json-v1-vector.json` + `audit-hash-v1-vector.json`，**全部一致**；篡改反例（改 payload / 断链 / 恒等）**必须被拒** |
| C2 | §3 委托 token（HS256 验签） | `delegation-token-v1-vector.json`：有效 token **通过**；aud 不匹配 / iss 不符 / 过期 / 签名篡改 **拒绝** |
| C3 | §4 风险分级派生 + RISK_STRATEGY | `risk-level-v1-vector.json`：逐级 + 派生规则一致 |

**注册**：通过后在 `ai-governance-protocol.md §5` 兼容清单登记（附 conformance 日期）。现有 `Server-NestJS` 参考实现 = Core ✅（`verify-protocol-conformance.mjs` 30→34 断言）、`java-starter` = C2 ✅ / C1 部分 / C3 ✅。

### 2.2 Full（Runtime 可替换）

Core **+** 治理运行时语义 **+** 全部 wire 形状冻结——即「第二 Runtime 能服务同一前端、产出同一份证据」：

| # | 要求 | 判据 |
|---|---|---|
| F1 | 治理绑定 | `governance-binding-v1-vector.json` 一致 |
| F2 | 失败语义 | 现行 `failure-semantics-v2-vector.json` 一致（失败态 → 对应 wire 形状）；`v1` 冻结留档、**不退役**（加性规则） |
| F3 | 确认生命周期 | 现行 `confirmation-lifecycle-v2-vector.json`：状态集 / 决策集 / 迁移 / 守卫 / 默认 TTL 一致（`v1` 冻结留档） |
| F4 | wire 形状冻结 | **全部** `wire-schema-registry.json` 对象：实现产出的每一种 wire 载荷，其**键集/枚举**与其 schema 一致；每份样例过 schema |
| F5 | 前端契约面 | 暴露 `/app/capabilities` + `/app/provenance`（形状见 `schemas/v1/capabilities` / `app-provenance`），供 Runtime-Neutral 前端按能力（非 runtime 身份）消费 |

> **Java Phase-1 最低合规 = Full**（Core + F1–F5）。这也是「统一前端可接第二 Runtime」的前置：F5 保证前端不因换 Runtime 而改。

### 2.3 Extended（生态 / 跨系统）

Full **+** 跨系统契约：`external-audit` / `external-effects-report` / `external-effects-query` / `internal-approvals-execute` / `sidecar-policy-push` / `governance-confirmation-item` / MCP `_meta.keelbase` 投影（`mcp-tool-list`）。用于治理台 ↔ 业务系统、sidecar、MCP 出口互操作。

### 2.4 行为级场景包 / Scenario Packs（`specs/scenarios/`）

行为级场景的机读包（与 §2.1–2.3 的算法/形状语料互补），各有漂移门（`Server-NestJS/src/ai/scenarios-pack.spec.ts`）：

| 包 | 覆盖 | 真源 | 门 |
|---|---|---|---|
| `golden-application-v1` | Golden Flow 8 步闭环 | `test/golden-application.e2e-spec.ts` | pack↔e2e 逐字 |
| `trust-proof-v1` | Trust 证明 7 场景 | `scripts/verify-trust-proof.mjs` | pack↔脚本 逐字 |
| `failure-path-v1` | 失败路径 FP-1..9 | `docs/failure-path-corpus.spec.md` | doc↔pack 逐字段 |
| `security-showcase-v1` | 对抗性安全 4 场景 | `security-showcase.service.ts` | 强双向 |
| `cross-entry-v1` | 跨入口决策一致 4 步 | `test/cross-entry-consistency.e2e-spec.ts` | pack↔e2e 逐字 |

**中立重放契约（v1 已落；第二载体的机器验证仍待做）**：`replay` 以 **wire 契约**表达最小步骤序列（不含任何实现细节）。语法 = `specs/scenarios/replay.schema.json`——**选入式**：包声明 `replayVersion: 1` 才受约束；门禁 = `src/ai/scenarios-pack.spec.ts` 的「replay 语法 · 选入门」（自带正反例，非空转）。补全后纳入 **Extended** 层判据：第二 Runtime 跑同一 `replay` 序列应得同一 `expect`（behavioral 层的「载体可替换」实证）。

**三条判据（v1）**：① `call` 引用 **wire 对象 / 工具名**，**不引用路径**——路径、HTTP 方法、`/api/v1` 前缀、传输（HTTP vs MCP）、HTTP 状态码、SSE 事件都是实现的自由；② `expect` 的键 = **本次 call 的目标对象**的字段、值**只允许字面量**（`call.tool` 的 `expect` **相对 `response`**；**工具的业务载荷**如 `result.data.level` 不是契约字段、不可断言）；③ 表达不了的**显式丢弃并在包内记录**，不静默换成更弱的断言。

**现状（2026-09-22）**：

| 包 | replay |
|---|---|
| `golden-application-v1` | ✅ v1（8 步：① 造数据 = **夹具**，②③ 工具调用，⑤ 审计链 verify（行动者 = `admin`），⑥ 治理写（撤销），⑦ 否定断言，⑧ 治理视图读；**④ 空**——裁决对象在两侧都只在流上，见下） |
| `trust-proof-v1` | ✅ v1（S1 夹具 / S2 行级拒绝 / S3 R5 阻断 / S5 撤销 / S7 证据包格式；**S4 空**（同 ④ 的理由）；**S6** 为**外部** java-starter 独立验证 ⇒ `replay: []`） |
| `cross-entry-v1` | ✅ v1（4 步；**跨入口之别不进语料**——传输是实现的自由，①② 因此成为同形重放，「同源」正体现在这里） |
| `security-showcase-v1` | `replay: null` —— runtime-specific 展示物，**不在 replay 范围**（无对应 wire 对象） |
| `failure-path-v1` | `replay: null` —— 故障注入类，**非单次 wire 请求可表达**，由 A/B 层复现 |

**一处已裁定的范围（N6-b，2026-09-24）· 确认流程不进 replay**：确认的**令牌**与**裁决对象**属**传输 / 实现自由**——参照实现把它们放在**流**上、Java 放在 JSON 响应里——因此**不进中立重放**。语料只保留**结果可由非流响应读出**的治理写，即**撤销类**（`side-effect-revoke#revoke`）。

**实据（两载体 runner，2026-09-24）**：`confirmation-decision` **两侧都不在响应上**（参照 = `{ok,trustTool}` + SSE；Java = 它自己的 `ExecutionOutcome`），确认令牌也只在**AI 管道**上发放（参照的非流式对话**根本不执行写**）⇒ `golden ④` 与 `trust-proof S4` **移出 replay 并在包内记录**（它们要证的事实仍由 ⑥ 撤销 / ⑧ 治理视图覆盖）。裁定里「治理写」解锁的条目因此是 **3 条**（撤销），不是 5 条。

**为什么不是「给确认流程补一个中立载体」（N6-a，未采纳）**：那要**改两侧的线缆可见响应**并写进契约，为一条链引入新载体；而确认语义**已被各实现自己的 e2e / 脚本覆盖**（`golden-application.e2e-spec.ts` ④ · `verify-trust-proof.mjs` S4）。**范围收在语料侧，契约不动。**

**四条补充裁定（2026-09-25，两载体跑完后的输入）**：**N7-a** 包**声明它用到的工具名**（包级 `tools`）——缺这些工具的 Runtime 据此判**「不适用」**，是**机读**的；门禁强制**声明覆盖 replay 里真正调用的每一个工具**（删一个即红，已实测）。**N8-b** **流程产物不进语料**（`$ref` 只覆盖夹具），由 **runner 携带**。**N9-b** **夹具由场景所有者造**（不写身份 ⇒ 跨行动者的前置今天表达不出来）。**N10-a** **`expect` 的目标对象按 call 形态明写**：`read` = 读到的那个对象 · `write` = 被写的那个对象 · `tool` = `tool-invocation.response`（写进语法注释）。

漂移门（`scenarios-pack.spec.ts`）不受影响（门只投影已知字段）；**`replay` 是人工撰写的重放脚本**（没有别的真源——它自己就是源），只受上述语法与门禁约束。

**两载体重放（2026-09-24）**：`replay` **已在两侧真跑**——参照实现 `Server-NestJS/test/scenario-replay.e2e-spec.ts`（**14/14**）与第二载体 `KeelBase4J` 的 `ScenarioReplayTest`（**6**，其余逐条记因）。两侧 runner 都**断言自己实际跑过哪些条目**，不可服务的**连原因一起断言**（不静默跳过）——这既是判据的实证，也让「语料说自己做过什么」这件事**可核**。

**⚠ 仍要说清边界**：两侧**可服务的条目集不同**（应用面不同 + 能力差距），所以这不是「两载体跑出完全相同的覆盖」；**共同可断言的那一部分**才是「载体可替换」的实证，差异部分各有分类与原因。

---

## 3. wire 约定 / Wire Conventions（跨 Runtime 一致）

| 约定 | 值 |
|---|---|
| 字段命名 | `camelCase` |
| 布尔字段 | 无 `is_`/`has_` 前缀（值即 `true`/`false`） |
| 空值 | `null`（非空串 / 非缺省） |
| **时间格式** | **ISO-8601 UTC，毫秒精度，`Z` 结尾**（如 `2026-09-14T05:30:00.000Z`）——等价 JS `Date.toISOString()`；链 hash 的 payload 不含时间（时间只在链外列/证据包 `exportedAt`） |
| 数字 | JSON number；canonicalJSON 内按 §2.3 规则（最短往返 / 指数边界） |
| 错误码 | `error-body.errorCode` ∈ `api-error-code.schema.json` 值域（25 码 + HTTP 映射） |
| 统一信封 | `{code, message, data, timestamp}`（成功）/ error-body 扩展（错误），见 `api-response` / `error-body` |

---

## 4. 中立 runner 的形态（不绑定 Node）

语言中性 runner 的最小形态（任一语言可实现，**不进本仓即视为合规证据**）：

1. 读 `specs/protocol/*-vector.json`（纯 JSON）；
2. 按 `ai-governance-protocol.md §2.2/§2.3/§3/§4` **自实现**算法（**不得**复用 KeelBase 源码）；
3. 逐 case 复算、比对 `expect*` 字段；拒绝类 case 断言**必须拒**；
4. 读 `wire-schema-registry.json` → 对每对象的 `samples/*` 用标准 JSON Schema 校验器过一遍；
5. 输出机器可读报告（结构见参考 runner 产出的 `reports/protocol-conformance-<ts>.json`）。

> 参考 runner（`Server-NestJS/specs/protocol/runner/verify-protocol-conformance.mjs`，契约仓）是 **Node 的一种实现**；其存在不代表判据依赖 Node——判据是**语料 + 算法规格**。出现真实第二载体时，以其自带 runner 跑同一语料即为**作用③「载体可替换」的实证**。

**载体可替换的实证（2026-09-14）**：

- **Java（真实第二载体）**：独立仓 `KeelBase4J`（Java 17 / Spring Boot）以自身实现复现**全部 5 份向量**（canonical / audit-hash / delegation / risk-level / governance-binding），**42/42 绿**（`CanonicalJsonTest` / `AuditChainTest` / `DelegationTokenTest` / `RiskLevelTest` / `GovernanceBindingTest`，不 import Node/KeelBase 源码）。—— 这是 **CE-1「载体可替换」的首个实证**。
- **跨仓语料单源**：Java 仓的 `conformance/vectors/` 是主仓 `specs/protocol/*-vector.json` 的**只读快照**（vendored）——**主仓语料一变，Java 快照即陈旧**，而两侧 CI 都看不见对方。检测：`node scripts/check-java-vector-sync.mjs`（本地 / 发布前；Java 仓路径经 `--java <dir>` 或 `KEELBASE_JAVA_REPO`；`--sync` 可把主仓向量同步过去）。

---

## 5. 关联 / Related

- 算法与形状真源：[ai-governance-protocol.md](ai-governance-protocol.md)（§2/§3/§4，§5 兼容清单 + §5.1 认证）、`specs/protocol/README.md`
- 语义变更纪律：[docs/manual/semantic-change-checklist.md](../manual/semantic-change-checklist.md)
- 载体定位：ADR-0002（切入点与 Java 载体定位；Demand-Gate）——`specs/protocol` 为语言无关语料，**载体切换由 ADR 门禁约束，不在本规范内**
