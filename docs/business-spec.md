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
| `decisions` | — | **决策记录**（进 Evidence，不进协议）：访谈中的业务决策，**及外部产物场景下的抽取决策**——凡原文未写或与原文不符的取值**必须**在此留一条（见 §2.1） |
| `rules` | — | 业务规则（进不可映射清单，手写实现 + 测试覆盖） |
| `acceptance` | — | 验收标准（进 Evidence，供测试规格引用） |
| `outOfScope` | — | 明确不做（进 Evidence，防范围漂移） |
| `evidenceRef` | — | **溯源链锚点**：指向访谈 Evidence（`.keelbase/interview/<feature>.md`）**或外部产物归档件**（`.keelbase/artifacts/<feature>/…`，见 §2.1）的路径，**相对仓库根**。映射器校验该文件存在；**缺失不阻断生成，但进 `warnings`**——而 `spec:check` 把 `warnings` **判为失败**（这正是「溯源链断在哪必红」的设计，不是提示）。格式样例见 [.keelbase/interview/followup-plans.md](../.keelbase/interview/followup-plans.md) |

字段其余可选键：`required`（布尔，缺省按类型）、`relation`（标记关联，见 §4）、`label`（中文名，1-12 字符）。

> **未被消费的键不静默丢弃**：`fields[].label` 与 `aiCapabilities[].intent` 只保留在 Business Spec / Evidence——薄协议里没有「字段级标签」和「工具意图」的位置。映射器会把本次未被消费的键（**含拼错的键名**）聚合列进 `notes`，不阻断生成；看到这条 note 属正常，写错键名时它是最快的自查信号。

### 2.1 外部产物（S6）的填法

S6 = **任意外部产物 → Business Spec**（PRD / 会议纪要 / 存量系统文档 / 对话记录…）。入口不要求客户改用我们的访谈方式，故**产物本身要先进仓**——否则 `evidenceRef` 悬空、`spec:check` 必红（§2 字段表已说明该设计）。四条约定：

1. **归档位** = `<项目仓>/.keelbase/artifacts/<feature>/<原文件名>`，**须随仓提交**（否则 CI 上 `existsSync` 失败）。与 `.keelbase/business-spec/`（规格）· `.keelbase/interview/`（访谈 Evidence）同级——同为构建期上游输入；语义上把「**客户给我的**」与「**我问出来的**」分开。
2. **`evidenceRef` 指向归档件**。既有校验原样成立，**无需改任何代码**。
3. **逐条溯源用 `decisions[]`，不新增字段**：凡**原文未写、或与原文不符**的取值**必须**在 `decisions[]` 留一条——`question` = 抽取值 / 分歧点，`choice` = 定下的值，`reason` = 依据（含原文位置，如「§3/§4 分列，故取并集」）。于是「**推测**」与「**原文**」在同一份 Spec 里可区分：前者**必在** `decisions[]`，后者不必。
4. **锚点语法不做**（如 `evidenceRef: "x.md#L40-52"`）——带 `#` 的路径 `existsSync` 判为不存在，要做须改映射器解析；第 3 条已用 `reason` 承载段号。等真实产物证明不够用再说。

**边界**：
- 归档进的是**承载该项目的仓**，**不是 KeelBase 公开仓**——客户产物不得进开源仓（许可证 / 隐私）。
- **二进制 / 大体积**产物（PDF / Excel）：`existsSync` 只问存在性、**不改代码即可支持**，但仓体积与 Git 存储是运维问题 → 可先只收文本类（md / txt / json / csv）。
- **多产物**：`evidenceRef` 是**单数**字符串；多份时先在 `decisions[].reason` 里标「第几份」。

> **裁决来源**：2026-09-18 采纳方案 A（私库 `KeelBase-S6-归档入仓-裁决方案_2026-09-18.md`）。三条**被否**替代一并记录：新增 `sourceRef`/`confidence` 字段（撞「不新增字段」前置，且无需求支撑）· 放宽 `evidenceRef` 校验（拆护栏换绿灯、断链转为不可见）· 整体推迟（对**抽取器**成立，对**已发布的契约**不成立）。

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

另有 `notes`（纯信息，进不了协议但留在 Business Spec / Evidence 的内容——如 `decisions[]`、未被消费的键），同样不阻断生成、不影响门禁判定。

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

## 8. 端到端怎么跑（Consulting → Build → Run）

编排 skill 是 `consulting-to-build`，访谈 skill 是 `keelbase-discovery`。全链命令：

```bash
# ① 访谈（skill: keelbase-discovery）→ 产出两份文件
#    .keelbase/business-spec/<feature>.json   （机器可消费的业务规格）
#    .keelbase/interview/<feature>.md         （访谈 Evidence，逐轮假设/原话/确认）

# ② 映射 + 门禁（零依赖、确定性；unmapped 清单要逐条过目）
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/<feature>.json --check
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/<feature>.json --out specs/<module>.json

# ③ 生成（复用既有生成器，含 7 处接线 + AI 工具注册）
node scripts/keelbase-init.mjs --spec specs/<module>.json
cd Server-NestJS && npm run build && npm test -- <module>

# ④ 运行（生成的模块自带 aiTools，直接过治理链）
#    起后端 → AI 对话触发写工具 → R3 确认 → 副作用 → 审计链 → 撤销
```

**可复现的部分**：② 与 ③ 是确定性命令，随时可跑。两道 CI 门禁（都在 `cli-test` job）：

```bash
npm run cli:test     # 映射器单测（构造数据）
npm run spec:check   # 扫 .keelbase/business-spec/*.json 逐个映射：有 error 或告警即失败；unmapped 不算失败
```

> `spec:check` 门禁的是**已提交的真实 spec**——单测用的是构造数据，管不到仓库里这份。改坏了（字段类型越界 / enum 选项非法 / evidenceRef 悬空）CI 直接红，而不是等生成时才发现。

**④ 需要环境**：后端 + LLM key（或 `PROVIDER=demo`）。用仓库内脚本一键验收（12 项断言：确认闸 / Explainable Authz / 副作用 resultType / 落库 / 决策轨迹 / 两条审计链 / 撤销软删）：

```bash
MODULE=followup_plans BASE_URL=http://localhost:3100/api/v1 node scripts/verify-generated-module.mjs
```

前置是模块已生成、后端已起；报告落在 `docs/benchmark/generated-module-*.md`。

**回归提醒**：验证撤销相关改动时，**必须用多字（snake_case）模块名**（如 `followup_plans`）——单字模块名（`invoices`）会掩盖一类解析缺陷。
