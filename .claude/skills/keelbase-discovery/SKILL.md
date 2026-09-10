---
name: keelbase-discovery
description: KeelBase 业务访谈——把一句模糊业务诉求问成可实施的 Business Spec（业务规格）。一次一问、带假设、显式确认闸。触发：用户说「我想做一个…」「帮我把这个业务需求理清楚」「客户说他们需要…」，或 consulting-to-build 进入 DISCOVERY 阶段。
---

# KeelBase 业务访谈（Discovery）

把业务方**自己都没想清楚**的诉求，问成一份可被 `business-spec.mjs` 确定性编译的 Business Spec。

产物是**结构化 JSON**，不是需求文档——文档不是 source of truth（见 [docs/business-spec.md](../../../docs/business-spec.md) §6）。

## 原则（不可省）

1. **一次只问一个问题**——不要一次抛清单，那会让对方只回答最容易的那个。
2. **先给假设再问**——每题先写 `GUESS:`（你的推测 + 为什么这么猜），让对方「确认/修正」而不是「从零构思」。
3. **区分 want 与 should want**——对方说「我要一个看板」时，追问「看板解决了什么」，那是 should want；「看板」只是 want。
4. **不确认不产出**——没有用户**明确的 yes**，不得写 Business Spec 文件。对方说「随便你」「你觉得呢」都不算确认，要说「我按这个理解往下做，对吗？」并等到明确答复。

## 七个必答项（决定生成物）

每一项直接决定生成出来的东西，不是走过场：

| # | 问什么 | 决定 |
|---|--------|------|
| 1 | **Actor**：谁用？他一天里什么时候用它？ | → `actors[]`（决定权限模型） |
| 2 | **Business Object**：围绕哪个业务对象？它有哪些字段？ | → `objects[]`（决定模块与表结构） |
| 3 | **Decision**：现在这个判断靠什么做的？为什么难？ | → `decisions[]`（决定业务规则从哪来） |
| 4 | **Rule**：有哪些「必须」「不能」「只允许」？ | → `rules[]`（决定手写业务逻辑面） |
| 5 | **Outcome**：做成之后，什么变了？怎么量？ | → `goal` |
| 6 | **Acceptance**：什么算做完了？ | → `acceptance[]`（决定验收测试） |
| 7 | **AI 能力意图**：哪些事希望 AI 代做？读还是写？写要不要人确认？ | → `aiCapabilities[]`（决定 AI 工具与治理模式） |

第 5、6 项最容易糊弄过去，恰恰最重要——没有它们，后面无法判断做出来的对不对。

## 写 Business Spec 的硬约束

这些约束由 `business-spec.mjs` **确定性强制**（不是靠提示词），写的时候就要满足，否则映射会被拒或字段进不可映射清单：

- 字段类型**只能用六种**：`string` / `text` / `int` / `bool` / `date` / `enum`
- 字段名用 **camelCase**，且**禁用保留名**：`id` / `userId` / `createdAt` / `updatedAt` / `deletedAt`（基座自带）
- `enum` 需 **2–10 个选项**，小写英文或下划线（如 `high`、`in_progress`）
- **一次只描述一个业务对象**（薄协议一次一个模块；多对象拆成多份 Business Spec）
- **关联/外键不要写成字段关系**——写成 `relation` 会在映射时降级为 `int` 列并提示手写
- **业务规则不要试图塞进字段**——`rules[]` 会被显式列入手写清单，这是设计如此

## 产出

访谈确认后写两份文件：

**① `.keelbase/business-spec/<feature>.json`** —— 机器可消费的业务规格（格式见 [docs/business-spec.md](../../../docs/business-spec.md) §2）

**② `.keelbase/interview/<feature>.md`** —— Evidence 日志，构成交付溯源链。追加式记录：

```markdown
# <feature> 访谈记录

## 轮次
### Q1 <问题>
- 我的假设（GUESS）：<推测 + 依据>
- 回答：<用户原话要点>
- 结论：<落定的事实>

## 业务决策
| 决策项 | 选择 | 理由 |
|--------|------|------|

## 确认
- 确认时间：<ISO 8601>
- 用户原话：「<明确的 yes>」
- 确认范围：<本次确认覆盖哪些内容>
```

`business-spec.json` 的 `evidenceRef` 指向这份 Evidence，后续才能回答「这条规则来自哪次访谈」。

## 边界（不做什么）

- **不写工程 Spec / 不生成代码**——那是 `consulting-to-build` 后续阶段的事（Spec → Protocol → Build）
- **不产出咨询交付文档**（业务现状/方案/流程等）——那是可选的人工产物，需要时另找写作类 skill
- **不替用户做业务决策**——拿不准就问，不要猜一个填进去

## 下一步

产出 Business Spec 后进入 `consulting-to-build` 的 `BUSINESS_SPEC → PROTOCOL` 阶段：

```bash
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/<feature>.json --check
```
