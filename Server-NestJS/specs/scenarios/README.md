# Scenario Packs / 行为级场景语料包（CE-1 B4）

> 本目录把「行为级场景」版本化为**机读 JSON 包 + 漂移门**——与 `specs/protocol/` 同族（协议语料/wire Schema），把「场景留档」变「常绿门禁」（roadmap CE-1 B4）。
> This directory version-controls behavior-level scenarios as machine-readable JSON packs with drift gates, sibling to `specs/protocol/`.

## 目录 / Layout

```
specs/scenarios/
├── security-showcase-v1.json    # §internal.16 A2 对抗性安全演示 4 场景（id/category/outcome）
├── golden-application-v1.json   # 1.0 Gate 1 Golden Application 8 步闭环（index/key/title）
├── failure-path-v1.json         # KB-4 失败路径回归语料 FP-1..FP-9（id/title/scenario/expected/status）
├── trust-proof-v1.json          # Trust 证明包 7 场景（seq/key/title；发射序 S1/S2/S3/S4/S7/S5/S6）
├── cross-entry-v1.json          # §internal.17 T5 跨入口决策一致性 4 步（index/key/title）
└── replay.schema.json           # 各包 `replay` 字段的可机读语法 v1（**选入式**，见下）
```

## 单一真源 / Source of truth

| 包 | 运行时 / 文档真源 | 漂移门强度 |
|---|---|---|
| `security-showcase-v1.json` | `src/ai/security-showcase/security-showcase.service.ts` `listScenarios()`（id+category）+ `runScenario()` 各场景 outcome | **强双向漂移门**：`listScenarios()` 集合 == cases；`runScenario(id).outcome` == cases.outcome |
| `failure-path-v1.json` | `docs/failure-path-corpus.spec.md` §2 表格（doc 为权威真源） | **doc↔pack 逐字段漂移门**：FP id 集合 == doc 行集合；且 pack case 的 `id/title/scenario/expected/status/layer` == doc 表列逐字段 |
| `golden-application-v1.json` | `test/golden-application.e2e-spec.ts` 的 8 个 `it('①..⑧ …')` 步骤标题（机器解析为结构化步骤） | **pack↔e2e 漂移门**：步数 / index 连续 / 序号标记 / title **逐字全等**（任一变更即红） |
| `trust-proof-v1.json` | `scripts/verify-trust-proof.mjs` 的 `console.log('[S<n>] <标题>')` 场景标签（保序 = 脚本发射序） | **pack↔脚本 漂移门**：场景数 / seq / title **逐字全等**（任一变更即红） |
| `cross-entry-v1.json` | `test/cross-entry-consistency.e2e-spec.ts` 的 4 个 `it('①..④ …')` 步骤标题（§internal.17 T5） | **pack↔e2e 漂移门**：步数 / index 连续 / 序号标记 / title **逐字全等**（任一变更即红） |

> **规则（CE-1 L3 单源）**：语义变更须先落运行时/文档真源，再同步本目录语料；`specs/scenarios` 是**机器副本（跨语言可消费）**，不是权威源。任一侧变更都先由漂移门变红。

## 用法 / Usage（`cd Server-NestJS`）

| 目的 | 命令 |
|---|---|
| 场景包漂移/一致性检测 | `npm run scenarios:check`（`jest src/ai/scenarios-pack.spec.ts`） |
| 随全量单测 | `npm test`（`scenarios-pack.spec.ts` 自动收集） |

## `replay` 语法 v1（选入式）/ replay grammar

> 判据来源：`docs/protocols/conformance-profile.md` §2.4（中立重放契约，归 **Extended 层**）。
> 实测依据：Java 线 **JV-15 Slice 0**——在第二载体上真跑通四步，同时暴露草稿的 7 条歧义。

**核心判断**：**`replay` 引用 wire 对象，不引用路径**。路径 / HTTP 方法 / `/api/v1` 前缀 / 传输（HTTP vs MCP）都是**实现的自由**，不进语料；由各 Runtime 自己把它们映射到自己的端点。旧草稿把两者混在一串散文里，导致第二载体**无法执行**。

```json
{ "call": { "tool": "create_followup_task", "args": { "customerId": { "$ref": "customer.id" } } },
  "expect": { "executed": false, "requiresConfirmation": true } }
{ "call": { "read": "audit-chain-verification" },
  "expect": { "valid": true } }
{ "call": { "write": "side-effect-revoke", "op": "revoke" },
  "expect": { "revoked": true } }
{ "call": { "read": "side-effect-revoke" }, "expect": null }

{ "given": { "actor": "alice",
             "fixtures": [ { "as": "customer", "write": "crm-customer", "args": { "name": "瀚宇制造" } },
                           { "as": "order", "write": "crm-order",
                             "args": { "customerId": { "$ref": "customer.id" }, "amount": 2800000 } } ] },
  "replay": [ … ] }
```

| 规则 | 说明 |
|---|---|
| `call` 必为**对象** | 三选一：`{tool, args?}`（业务动作）· `{read}`（治理观测，值为 **wire 对象 id**）· `{write, op, args?}`（治理写，值为 wire 对象 id + 动作名）；**禁字符串** |
| `expect` 键 | **本次 call 的目标对象**的字段名（camelCase）；值**只允许字面量**（string/number/boolean/null）——先不发明比较算子。**`tool` 的 `expect` 相对 `response`**（顶层 `request`/`response` 都是对象，不这样定就一个字面量也够不着） |
| `expect: null` | **否定断言**：该对象**不可读**（拒绝与不存在本就该区分）。`{ "read": "side-effect-revoke" }, "expect": null` = 越权时读不到 |
| `given.actor` | **身份必须显式**（认证在请求入口，ADR-0004 D3）；旧草稿只把行动者藏在散文里。**一步一个 actor**：跨行动者的对照拆到不同步骤 |
| `given.fixtures` | **前置，不产生断言**（R3）。`as` 给夹具**起名**供后续步骤以 `{"$ref":"<名字>.<字段>"}` 引用（N1；名字按**场景**可见，跨步可用）；目标**不要求是 wire 对象**——可以是**领域资源名**（N4，如 `crm-customer`） |
| 不可断言的 | **传输**（路径 / 方法 / 状态码 / SSE 事件）与**工具业务载荷**（如 `result.data.level`——那是各工具自己的形状，不是契约字段）。表达不了的**显式丢弃并在包内记录**，不偷偷换成更弱的断言 |
| **`tools`（包级）** | **声明本包用到的工具名**（**N7-a**）：缺这些工具的 Runtime 据此判**「不适用」**——与「断言不一致」分开，且是**机读**的。门禁强制**声明覆盖 replay 里真正调用的每一个工具** |
| **选入式** | 包声明 `replayVersion: 1` 才受本语法约束。未声明的包其 `replay` 仍是散文——**不静默放过**：门禁会把「已选入 / 未选入」两组显式列出 |

**口径 · 确认流程不进 replay（N6-b，2026-09-24）**：确认的**令牌**与**裁决对象**属**传输 / 实现自由**（一侧在流上、一侧在 JSON 响应里）⇒ 不进语料；`call.write` 实际只覆盖**结果可在非流响应上读出**的治理写，现状 = **撤销类**。理由、实据与未采纳的替代方案见 `docs/protocols/conformance-profile.md` §2.4。

**口径 · 流程产物与夹具归属（N8-b / N9-b，2026-09-25）**：① **流程产物**（前一步裁决出来的确认、写出来的副作用）**不进语料**——`{"$ref":…}` 只覆盖**夹具**，产物由 **runner 携带**（两侧 runner 现在都在前置里自己造）。② **夹具由场景所有者造**——夹具不写「以谁的身份」，所以「alice 的客户存在、行动者却是 bob」这类前置**今天表达不出来**。

**现状（2026-09-22）**：**3 包选入**（`golden-application-v1` · `trust-proof-v1` · `cross-entry-v1`，均按 Java 线 JV-15 语法裁定的 R1–R7 + N1–N5 改写）；**2 包未选入且出 replay 范围**——`security-showcase-v1`（runtime-specific 展示物，R2 ⇒ 各 case `replay: null`）· `failure-path-v1`（故障注入类，本来 `replay: null`）。

**与「单一真源」的关系（重要）**：本目录其余字段是**真源的机器副本**（见上表）；而 `replay` 是**人工撰写的**重放脚本，**没有别的真源**——它自己就是源。故它不受「先改真源再同步语料」那条规则约束，只受本语法约束。

**门禁**：`npm run scenarios:check`（`src/ai/scenarios-pack.spec.ts` 内的 `replay 语法 · replayVersion 选入门`）。该门**自带正反例**，即使 0 个包选入也真实断言语法——**并已实测：给散文包注入 `replayVersion` 即变红**（非空转）。

**更强的一层（待第 2 步）**：`call.read` 已给出对象 id，届时可校验「`expect` 键 ⊆ 该对象 schema 的 properties」。

**未决**：谁把 wire 对象映射到端点（各 Runtime 声明 vs runner 按约定推导）——留待草稿可机读后再定。

## 规则 / Rules

- **机器副本、非权威**：每个包的 `note` 字段注明其真源文件与漂移门；权威以运行时源 / `docs/` 为准。
- **文件名含版本段、不含时间戳**——确定性、可 CI diff。
- **A/B 层（failure-path）**：A 层 `src/ai/failure-path/failure-path-corpus.spec.ts`（确定性 fault-injection），B 层 `test/failure-path.e2e-spec.ts`（真实 app + fresh sqlite + supertest）。FP-9（迁移中断）由既有 CI `migration-consistency` job 覆盖，本语料引用不重复造。
- **五包漂移门**：security-showcase = 运行时强双向门；failure-path = doc↔pack 逐字段门；golden-application = pack↔e2e 逐字门；trust-proof = pack↔脚本 逐字门；cross-entry = pack↔e2e 逐字门（均已机器化，无人工维护项）。
