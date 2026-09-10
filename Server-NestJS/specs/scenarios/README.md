# Scenario Packs / 行为级场景语料包（CE-1 B4）

> 本目录把「行为级场景」版本化为**机读 JSON 包 + 漂移门**——与 `specs/protocol/` 同族（协议语料/wire Schema），把「场景留档」变「常绿门禁」（roadmap CE-1 B4）。
> This directory version-controls behavior-level scenarios as machine-readable JSON packs with drift gates, sibling to `specs/protocol/`.

## 目录 / Layout

```
specs/scenarios/
├── security-showcase-v1.json    # §internal.16 A2 对抗性安全演示 4 场景（id/category/outcome）
├── golden-application-v1.json   # 1.0 Gate 1 Golden Application 8 步闭环（index/key/title）
└── failure-path-v1.json         # KB-4 失败路径回归语料 FP-1..FP-9（id/title/scenario/expected/status）
```

## 单一真源 / Source of truth

| 包 | 运行时 / 文档真源 | 漂移门强度 |
|---|---|---|
| `security-showcase-v1.json` | `src/ai/security-showcase/security-showcase.service.ts` `listScenarios()`（id+category）+ `runScenario()` 各场景 outcome | **强双向漂移门**：`listScenarios()` 集合 == cases；`runScenario(id).outcome` == cases.outcome |
| `failure-path-v1.json` | `docs/failure-path-corpus.spec.md` §2 表格（doc 为权威真源） | **doc↔pack 逐字段漂移门**：FP id 集合 == doc 行集合；且 pack case 的 `id/title/scenario/expected/status/layer` == doc 表列逐字段 |
| `golden-application-v1.json` | `test/golden-application.e2e-spec.ts` 的 8 个 `it('①..⑧ …')` 步骤标题（机器解析为结构化步骤） | **pack↔e2e 漂移门**：步数 / index 连续 / 序号标记 / title **逐字全等**（任一变更即红） |

> **规则（CE-1 L3 单源）**：语义变更须先落运行时/文档真源，再同步本目录语料；`specs/scenarios` 是**机器副本（跨语言可消费）**，不是权威源。任一侧变更都先由漂移门变红。

## 用法 / Usage（`cd Server-NestJS`）

| 目的 | 命令 |
|---|---|
| 场景包漂移/一致性检测 | `npm run scenarios:check`（`jest src/ai/scenarios-pack.spec.ts`） |
| 随全量单测 | `npm test`（`scenarios-pack.spec.ts` 自动收集） |

## 规则 / Rules

- **机器副本、非权威**：每个包的 `note` 字段注明其真源文件与漂移门；权威以运行时源 / `docs/` 为准。
- **文件名含版本段、不含时间戳**——确定性、可 CI diff。
- **A/B 层（failure-path）**：A 层 `src/ai/failure-path/failure-path-corpus.spec.ts`（确定性 fault-injection），B 层 `test/failure-path.e2e-spec.ts`（真实 app + fresh sqlite + supertest）。FP-9（迁移中断）由既有 CI `migration-consistency` job 覆盖，本语料引用不重复造。
- **三包漂移门**：security-showcase = 运行时强双向门；failure-path = doc↔pack 集合门；golden-application = pack↔e2e 逐字门（均已机器化，无人工维护项）。
