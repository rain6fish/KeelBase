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
{ "call": { "tool": "create_followup_task", "args": { "customerId": 1 } },
  "expect": { "status": "pending_confirmation" } }
{ "call": { "read": "audit-chain-verification" },
  "expect": { "valid": true } }
```

| 规则 | 说明 |
|---|---|
| `call` 必为**对象** | 二选一：`{tool, args?}`（业务动作）或 `{read}`（治理观测，值为 **wire 对象 id**）；**禁字符串** |
| `expect` 键 | 目标对象的**字段名**（camelCase）；值**只允许字面量**（string/number/boolean/null）——先不发明比较算子 |
| `given.actor` | **身份必须显式**（认证在请求入口，ADR-0004 D3）；旧草稿只把行动者藏在散文里 |
| **选入式** | 包声明 `replayVersion: 1` 才受本语法约束。未声明的包其 `replay` 仍是散文——**不静默放过**：门禁会把「已选入 / 未选入」两组显式列出 |

**与「单一真源」的关系（重要）**：本目录其余字段是**真源的机器副本**（见上表）；而 `replay` 是**人工撰写的**重放脚本，**没有别的真源**——它自己就是源。故它不受「先改真源再同步语料」那条规则约束，只受本语法约束。

**门禁**：`npm run scenarios:check`（`src/ai/scenarios-pack.spec.ts` 内的 `replay 语法 · replayVersion 选入门`）。该门**自带正反例**，即使 0 个包选入也真实断言语法——**并已实测：给散文包注入 `replayVersion` 即变红**（非空转）。

**更强的一层（待第 2 步）**：`call.read` 已给出对象 id，届时可校验「`expect` 键 ⊆ 该对象 schema 的 properties」。

**未决**：谁把 wire 对象映射到端点（各 Runtime 声明 vs runner 按约定推导）——留待草稿可机读后再定。

## 规则 / Rules

- **机器副本、非权威**：每个包的 `note` 字段注明其真源文件与漂移门；权威以运行时源 / `docs/` 为准。
- **文件名含版本段、不含时间戳**——确定性、可 CI diff。
- **A/B 层（failure-path）**：A 层 `src/ai/failure-path/failure-path-corpus.spec.ts`（确定性 fault-injection），B 层 `test/failure-path.e2e-spec.ts`（真实 app + fresh sqlite + supertest）。FP-9（迁移中断）由既有 CI `migration-consistency` job 覆盖，本语料引用不重复造。
- **五包漂移门**：security-showcase = 运行时强双向门；failure-path = doc↔pack 逐字段门；golden-application = pack↔e2e 逐字门；trust-proof = pack↔脚本 逐字门；cross-entry = pack↔e2e 逐字门（均已机器化，无人工维护项）。
