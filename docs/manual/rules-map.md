# 规则地图 / Rules Map

> 规则**不集中在一份文件里，这是有意的**——顶层宪法、详细细则、任务技能各司其职。
> 本页是**入口**：告诉你「哪一类规则在哪份文件」。
>
> **本页不复制规则。** 发现规则内容与本页描述不符时，改的是**权威文件**，不是这一页。
> 也别在别处另立规则总纲——第四份「总纲」正是这份地图要避免的事。

---

## 1. 分层：从顶层到细则

| 层 | 文件 | 管什么 |
|---|---|---|
| **① 顶层宪法** | [`.agents/skills/keelbase-development-constitution/SKILL.md`](../../.agents/skills/keelbase-development-constitution/SKILL.md) | 产品 / 体验 / 架构工程三篇宪法 + 开发流程与完成定义（DoD）+ 三方评审 + 决策规则。**开发、设计、评审任何功能前先读它。** |
| **② AI 代理入口** | [`AGENTS.md`](../../AGENTS.md) | AI 高频触发的「怎么加功能 / 加模块」——含**新增业务模块必做清单**（对齐生成器的接线点）。 |
| **③ 详细开发规则** | [`CLAUDE.md`](../../CLAUDE.md) | 架构与约定（§3 前端 / §4 后端 / §5 安全 / §6 环境变量 / §9 API 汇总 / §10 常见模式 / §14 行为准则 / §15 反垃圾代码）。 |
| **④ 任务型技能** | [`.claude/skills/`](../../.claude/skills/) | 做某件具体事情时按步骤走（见 §3 清单）。 |
| **⑤ 公开承诺** | [`SECURITY.md`](../../SECURITY.md) | 信任边界与**不承诺清单**（N-1…）。对外说过的话以此为准。 |
| **⑥ 战略与红线** | 私有仓库 roadmap | 定位、优先级、明确不做的事。**不公开**，公开文档里不引用其章节号。 |

**冲突时的顺序**：① > ②/③ > ④；**更具体的覆盖更一般的**——模块目录下若有自己的 `AGENTS.md`，它在该模块内覆盖根级约定。

---

## 2. 按「你要做什么」查

| 我要…… | 读这份 |
|---|---|
| **加一个业务模块** | [AGENTS.md](../../AGENTS.md) §3 清单 + [`CLAUDE.md`](../../CLAUDE.md) §4/§10；或直接用生成器（见下） |
| **用生成器生成模块** | [`CLAUDE.md`](../../CLAUDE.md) §10「从业务需求到模块」→ [`docs/business-spec.md`](../business-spec.md) → [`docs/module-protocol.md`](../module-protocol.md) |
| **改安全相关的东西** | [`CLAUDE.md`](../../CLAUDE.md) §5 安全规则 + [`SECURITY.md`](../../SECURITY.md) 信任边界 |
| **确认产品定位 / 哪些不做** | [`CLAUDE.md`](../../CLAUDE.md) §5.5 产品架构红线（战略层在私有 roadmap） |
| **避免写出垃圾代码** | [`CLAUDE.md`](../../CLAUDE.md) §15 Code Economy（Search Before Create 等七条） |
| **提交代码** | [`CLAUDE.md`](../../CLAUDE.md) §14.5 提交消息规范（**双语、英文在前、不带 Co-Authored-By**） |
| **改动了协议 / 工具 / 审计语义** | [`docs/manual/semantic-change-checklist.md`](semantic-change-checklist.md)（先落 Protocol 再改代码） |
| **发版** | [`docs/manual/release-precheck.md`](release-precheck.md)（发布前标准程序） |
| **评审代码** | [`docs/manual/code-review-severity.md`](code-review-severity.md)（严重度分级） |
| **概念看不懂** | [`docs/manual/concepts.md`](concepts.md)（概念地图） |
| **跑测试 / 门禁** | [`CLAUDE.md`](../../CLAUDE.md) §8 命令速查 |
| **了解架构为什么这么设计** | [`docs/keelbase-dna.md`](../keelbase-dna.md)（四核心原则） |
| **给终端用户写说明** | [`docs/manual/usage.md`](usage.md) |

---

## 3. 可调用的任务型技能（`.claude/skills/`）

| 技能 | 什么时候用 |
|---|---|
| `keelbase-discovery` | 把一句模糊业务诉求问成 Business Spec |
| `consulting-to-build` | 从需求一路编排到可运行应用（含各阶段门禁） |
| `generate-module` | 手工按清单生成新模块 |
| `add-api` | 给现有模块加 API 端点 |
| `write-migration` | 生成 / 校验 TypeORM 迁移 |
| `ai-code-economy-review` | 反 AI 垃圾代码审查（发布前第四层） |
| `crm-customer-risk` · `pm-deadline-risk` · `approval-policy-review` | 旗舰应用的业务规则技能 |

---

## 4. 这份地图怎么维护

- **新增一类规则** → 在 §1 加一行（层）或在 §2 加一行（场景），指向权威文件。
- **新增一个技能** → 在 §3 加一行。
- **不要把规则正文抄进来。** 抄进来就会漂移，漂移的索引比没有索引更糟。
