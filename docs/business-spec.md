# 业务规格（Business Spec）→ 模块协议 — Consulting → Build

> 目的：补齐「业务访谈 → 工程协议」这一段。Business Spec 是**构建期**的上游输入模型，由确定性映射器编译为现有薄协议（[module-protocol.md](module-protocol.md)），再交给 `keelbase init --spec` 生成普通源码。
> 边界：Business Spec 是**上游输入模型**，不是运行期契约。它**不进** `Server-NestJS/specs/protocol/schemas/`（CE-1 wire Schema 冻结面），也**不扩** Module Protocol 字段。
> 红线对齐：[module-protocol.md §5](module-protocol.md) —— 协议只覆盖高频 20%，变厚即低代码平台。凡是薄协议表达不了的，本层**显式列出**（fail-closed），走 `AGENTS.md §3` 手写路径，而不是偷偷丢弃或悄悄扩协议。

---

## 1. 为什么需要中间层

既有链路已经成立：

```
Module Protocol（specs/*.json） → keelbase init --spec → 普通源码 → 运行时治理链
```

但它的入口是**工程形状**的（字段名/类型/enum），业务访谈拿不到这一层。反过来，通用的需求文档（markdown 纪要）机器又不可消费。

Business Spec 补的就是这一跳：**业务语义 → 薄协议**，且这一步是确定性、可测、可 CI 门禁的。

```
业务访谈 → Business Spec（本层） → Module Protocol → keelbase init → 源码 → Run
                    ↑ 确定性映射器 business-spec.mjs
```

---

## 2. Business Spec 形态

一份 Business Spec 描述**一个**业务能力，最多映射出**一个**业务模块（薄协议一次一个模块；多对象请拆分为多份 Business Spec）。

```json
{
  "feature": "followup-plans",
  "goal": "让销售知道本周该优先跟进哪些客户，并能把判断落成可执行的跟进计划",
  "actors": ["sales"],
  "objects": [
    {
      "name": "followup_plan",
      "label": "跟进计划",
      "module": "followup_plans",
      "searchable": true,
      "fields": [
        { "name": "title", "type": "string", "label": "标题", "required": true },
        { "name": "priority", "type": "enum", "enum": ["low", "medium", "high", "critical"], "label": "优先级" },
        { "name": "reason", "type": "text", "label": "判断依据" },
        { "name": "dueDate", "type": "date", "label": "计划跟进日" },
        { "name": "status", "type": "enum", "enum": ["planned", "done", "cancelled"], "label": "状态" }
      ]
    }
  ],
  "aiCapabilities": [
    { "object": "followup_plan", "kind": "read", "intent": "查询跟进计划" },
    { "object": "followup_plan", "kind": "write", "riskLevel": "R3", "requiresConfirmation": true, "intent": "建立跟进计划" }
  ],
  "decisions": [
    { "question": "什么叫「值得优先跟进」？", "choice": "风险等级 high/critical 的客户", "reason": "与现有风险打分口径一致" }
  ],
  "rules": [
    "同一客户同一周内不重复建计划",
    "计划必须落在未来 7 天内"
  ],
  "acceptance": [
    "销售一句话可得到 Top N 高风险客户清单",
    "建立计划需人工确认，确认后可在列表看到"
  ],
  "outOfScope": ["自动发消息给客户", "跨团队共享计划"],
  "evidenceRef": ".keelbase/interview/followup-plans.md"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `feature` | ✅ | 能力短名（kebab-case），用于产物命名与 Evidence 归档 |
| `goal` | ✅ | 一句话业务目标（访谈确认后的 Outcome） |
| `actors` | ✅ | 使用者角色。**只有本人（数据所有者）可映射**，其余进不可映射清单 |
| `objects` | ✅ | 业务对象数组；MVP 限 1 个（见 §4） |
| `objects[].fields` | ✅ | 字段，类型**只能用** `string`/`text`/`int`/`bool`/`date`/`enum` 六种 |
| `aiCapabilities` | — | 该对象的 AI 能力意图（`read`/`write`），映射为协议 `aiTools` |
| `decisions` | — | 访谈中的业务决策记录（进 Evidence，不进协议） |
| `rules` | — | 业务规则（进不可映射清单，手写实现 + 测试覆盖） |
| `acceptance` | — | 验收标准（进 Evidence，供测试规格引用） |
| `outOfScope` | — | 明确不做（进 Evidence，防范围漂移） |
| `evidenceRef` | — | 访谈 Evidence 文件路径，构成交付溯源链 |

字段其余可选键：`required`（布尔，缺省按类型）、`relation`（标记关联，见 §4）、`label`（中文名，1-12 字符）。

---

## 3. 映射规则（Business Spec → Module Protocol）

| Business Spec | Module Protocol | 说明 |
|---|---|---|
| `objects[0].module`（缺省 `toPlural(objects[0].name)`） | `module` / `plural` | 命名变换复用 `scripts/generator/validate.mjs` |
| `objects[0].label` | `label` | 中文标签校验同 CLI |
| `objects[0].fields[]` | `fields[]` | 归一化 + 校验（`normalizeSpecFields` + `validateFields`） |
| `objects[0].searchable` | `searchable` | 透传 |
| `aiCapabilities[kind=read]` | `aiTools.query` | 透传 `riskLevel` / `requiresConfirmation` |
| `aiCapabilities[kind=write]` | `aiTools.create` | 同上；缺省 R3 + 需确认 |

映射结果**必须**通过既有 `validate.mjs` 校验（`validateModuleName` / `validateFields` / `validateAiTools`）才算产出，不重复实现校验逻辑。

---

## 4. 不可映射清单（fail-closed）

下列内容**不静默丢弃**，一律进映射结果的 `unmapped[]`，并注明手写路径：

| 来源 | 原因 | 去处 |
|---|---|---|
| `objects[]` 多于 1 个 | 薄协议一次一个模块 | 拆分为多份 Business Spec |
| 字段 `type` 不在六种内（如 `money`/`json`/`ref` 对象） | 超出协议词汇表 | `AGENTS.md §3` 手写 |
| 字段带 `relation` | 关联/级联保持手写（协议红线） | 该字段按 `int` 生成 + 关系查询手写 |
| `actors` 含非本人角色 | 协议固定「本人数据」所有权 | CASL 手写行级策略 |
| `rules[]` | 业务规则不进薄协议 | 服务层手写 + 单测覆盖 |
| `aiCapabilities[kind]` 非 `read`/`write`（如 `analyze`） | 分析类工具不自动化 | 按 `src/ai/tools/` 手写注册 + 治理 |
| `decisions[]` / `acceptance[]` / `outOfScope[]` | 属交付溯源，非工程形状 | 保留在 Business Spec / Evidence |

**语义**：`unmapped[]` 非空**不代表失败**——它代表本次生成的范围边界。生成的模块必须**再叠加**清单里的手写工作才算完整（对齐 `AGENTS.md §3` 的「7 处接线 + 手写补全」）。

---

## 5. 用法

```bash
# Business Spec → Module Protocol（--out 写协议文件，供复查/共享/后续 --spec）
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/followup-plans.json --out specs/followup-plans.json

# 只校验不写文件（CI 门禁用；有 error 退出码 1）
node scripts/generator/business-spec.mjs --in <file> --check

# 生成
node scripts/keelbase-init.mjs --spec specs/followup-plans.json
```

`--check` 与 `generate-protocol-vectors.mjs --check` 同一先例：确定性、零网络、可作 CI diff 门禁。

---

## 6. 与交付文档的关系

咨询交付物（业务现状 / 方案 / 流程 / 验收标准等 markdown）是**可选人工产物**。

**Business Spec 才是 source of truth** —— 文档由它派生，而不是相反。这样后续才能继续追问「这个模块为什么存在」「这条规则来自哪次访谈」，把溯源链从运行期（审计哈希链）向上游延伸到交付期。

---

## 7. 边界（不做什么）

- 不把 Business Spec 变成运行期 wire 对象（CE-1 冻结面不动）
- 不扩 Module Protocol 字段（[module-protocol.md §5](module-protocol.md) 红线）
- 不自动化分析类/关联类工具（保留手写）
- 不产出交付文档（那是可选的人工/写作 skill 职责）
