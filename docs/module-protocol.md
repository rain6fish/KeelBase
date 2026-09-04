# 业务模块协议（Module Protocol）— EASY-7

> 目的：定义**一份 AI 可读的业务模块约定**，让 AI（Claude Code 等）读它就能按基座约定生成完整模块。
> 核心原则（用户 2026-08-13 明确）：**焦点不是让系统内建生成器，而是 AI 能否按系统约定快速生成**——系统提供约定（协议），AI 负责生成。
> 红线：协议**只覆盖高频重复的 20%**，每个字段问「AI 不生成它行不行？」，能手写就手写；复杂业务走手写 + AI 辅助。协议薄则成脚手架升级版，厚则成低代码平台。

---

## 1. 协议形态

一个业务模块用**一份 JSON** 描述（AI 可读、可校验）：

```json
{
  "module": "note",
  "plural": "notes",
  "label": "笔记",
  "fields": [
    { "name": "title", "type": "string", "label": "标题", "required": true },
    { "name": "content", "type": "text", "label": "内容" },
    { "name": "status", "type": "enum", "label": "状态", "enum": ["draft", "published"] }
  ],
  "searchable": true
}
```

> **字段命名**：用 camelCase（`riskLevel`、`annualValue`）——与代码库跨语言约定一致，TypeORM 自动映射 snake_case 列名。生成器同时兼容 snake_case（会触发 Dart lint info，不推荐）。

## 2. 字段类型（协议词汇表）

| type | entity 列 | 前端组件 | 说明 |
|------|-----------|----------|------|
| `string` | `varchar(200)` | 文本输入 | 短文本 |
| `text` | `text` | 多行输入 | 长文本 |
| `int` | `int` | 数字输入 | 整数 |
| `bool` | `boolean` | 开关 | 布尔 |
| `date` | `datetime` | 日期选择 | 时间 |
| `enum` | `varchar(32)` + 默认值 | 分段选择/下拉 | 枚举（需 `enum: [...]` 选项，2-10 个，小写英文/下划线） |

> 超出这 6 种类型的复杂字段（外键关联/级联/复杂业务逻辑），**不写协议**，走手写 + AI 辅助。关联（belongsTo）已在旗舰应用中识别为共性，但保持薄协议——关联查询手写 + AI 生成（见 §6 反推记录）。

## 3. 协议 → 生成物映射（AI 必读）

协议字段如何映射到基座各层：

| 协议项 | 后端（Server-NestJS） | 前端（Front-Flutter） |
|--------|----------------------|----------------------|
| `module`/`plural` | 目录 `src/<plural>/` | 目录 `lib/features/<plural>/` |
| `label` | 中文名（Swagger/i18n） | 页面标题（i18n） |
| `fields[].name` | entity 列名 + DTO 字段 | model 字段 + 表单字段 |
| `fields[].type` | TypeORM 列类型 | Flutter 输入控件 |
| `fields[].required` | DTO `@IsNotEmpty` | 表单必填校验；**默认按类型**：`string`/`enum` 默认必填，`text`/`int`/`bool`/`date` 默认可选。要改默认可显式标 `required: true/false`（如短文本字段可选写 `"required": false`） |
| `searchable` | 列表搜索 + `/search` 索引 | 搜索入口 |

**固定的安全接线（协议不含，AI 必须补）**：
- CASL：用户只能访问本人数据（`userId` 所有权）
- 审计：写操作自动入 OperationAudit（全局拦截器）
- 导航注册：`navigate-page.tool.ts` PAGE_ROUTES
- i18n：所有用户可见文本中英双语
- 迁移：`migration:generate` 生成（禁止手写，TypeORM 索引用 hash 名）

## 3.5 旗舰应用反推（2026-08-17，第 9-10 周里程碑）

从三个旗舰应用（AI CRM / AI Project / AI Approval）反推的**共性字段形态**，已回写协议词汇表：

| 旗舰共性 | 出现处 | 协议处理 |
|---|---|---|
| **enum 字段**（status/type/riskLevel 等高频率） | CRM Customer.status、Order.status；PM Task.status、Risk.level；Approval Request.status/type | ✅ 已入词汇表（§2 `enum` + 选项） |
| **camelCase 字段名** | 全部实体 | ✅ 已入规范（§1 命名约定） |
| **外键关联**（belongsTo） | Customer→Order/Activity/Task/Risk；Project→Member/Milestone/Task/Risk；Request→Policy | ⚠️ 已识别共性，但**保持薄协议**：关联列/查询手写 + AI 辅助（协议厚了成低代码平台） |
| **required 必填** | 各 title/name | ✅ 协议 `required: true`（已支持） |
| **AI 工具**（query/analyze/create + 写需确认） | 三旗舰各 4-5 个工具 | ⚠️ 运行时 AI 层：工具按 `src/ai/tools/` 手写注册 + HS-9 治理，协议暂不自动化（聚焦 CRUD 高频 20%） |

**协议示例与已验证产物**（`specs/` 目录，可直接 `keelbase init --spec` 生成）：

**与既有生成模块一致的 spec**（协议字段 ⊆ 实体，由 `scripts/keelbase-init.test.mjs` 一致性检查锁定，改动任意一方都会 fail）：
- `specs/supplier.json` — 供应商（**端到端验证产物**：spec 即 `suppliers` 模块生成来源，migration:generate + build + 单测通过）
- `specs/contract.json` — 合同（**端到端验证产物**：spec 即 `contracts` 模块生成来源）
- `specs/books.json` — 图书（status enum + rating；2026-08-20 按 spec 回填实体字段，消除与既有 `books` 模块的漂移）
- `specs/notes.json` — 笔记（category enum；2026-08-20 按 spec 回填实体字段，消除与既有 `notes` 模块的漂移）

**反推协议示例**（既有手写模块的协议化摘要，`specs/` 下同名 JSON 不代表同名模块的完整字段集）：
- `specs/customer.json` — 客户（status/riskLevel 双 enum）
- `specs/project.json` — 项目（status/priority 双 enum + deadline）
- `specs/approval-request.json` — 审批请求（type/status 双 enum + amount）
- `specs/events.json` / `specs/todos.json` — 核心模块（events/todos 实体字段多于协议，协议只摘高频核心字段）

**验证结论（第 9-10 周）**：协议 → `keelbase init --spec` → 普通源代码（实体/DTO/API/权限/审计/Flutter 页）闭环成立，30 分钟内可生成带 enum + CASL + 审计的业务模块。

### 3.6 AI 工具层声明 / AI Tools Declaration（Protocol 2.0 增量，2026-09）

协议可选 `aiTools` 字段声明模块的 AI 工具层，生成器消费它生成**带治理的读/写工具**（对齐 Unified Authorization Contract 的 `agent` 维度——R0-R5 风险级 / 确认 / 审计由 ToolRegistry 统一处理）：

```json
{
  "module": "contracts",
  "fields": [
    { "name": "title", "type": "string", "label": "标题", "required": true }
  ],
  "aiTools": {
    "enabled": true,
    "query": { "riskLevel": "R1" },
    "create": { "riskLevel": "R4", "requiresConfirmation": true }
  }
}
```

| 声明 | 缺省 | 语义 |
|---|---|---|
| `aiTools.enabled: false` | 生成 query+create | 关闭全部 AI 工具（只读敏感模块） |
| `aiTools.query: false` | 生成 | 不生成 query 工具 |
| `aiTools.query.riskLevel` | R1（读派生） | query 工具显式风险级 |
| `aiTools.create: false` | 生成 | 不生成 create 工具（只读模块） |
| `aiTools.create.riskLevel` | R3 | create 工具显式风险级（R2=policy / R4=双人审批） |
| `aiTools.create.requiresConfirmation` | R3/R4 时 true | 覆盖确认要求（false 需显式配 R1/R2） |

- **缺省行为与旧协议完全一致**（query R1 自动 + create R3 需确认）——增量字段向后兼容，既有 spec 生成的模块行为不变（一致性测试锁定）。
- create 文件名用复数（`create-contracts.tool.ts`）、工具名用单数（`create_contract`），与生成器既有约定一致。
- 工具风险级经 ToolRegistry 进入 R0-R5 治理管线（门控 / 确认 / 双人审批 / 审计 / 撤销）——生成模块即「AI 可调用 + 治理」。
- **分析/更新等复杂工具仍手写**（协议红线：只自动化高频 CRUD 工具）。

## 4. 如何用协议生成

**方式 A：CLI（标准 CRUD）**
```bash
node scripts/keelbase-init.mjs --module notes --label 笔记 --fields title:string,content:text
```
CLI 内部即按本协议解析 + 生成 + 接线（见 `scripts/generator/validate.mjs` / `module-spec.mjs`）。

**方式 B：AI 按协议手工生成（复杂/非标准）**
1. 写协议 JSON（或从用户描述提取，`--desc` 走 LLM，EASY-2.1）
2. 按第 3 节映射表逐层实现
3. 按 `AGENTS.md` 第 3 节「必做清单」完成 7 处接线
4. 补测试 + 迁移 + 验收

## 4.1 多输入通道（P0-12）：已有系统 → 协议（2026-08-18）

KeelBase 不只适合「从零创建」，也能成为**已有系统的 AI 化入口**。`keelbase-init` 支持从 OpenAPI / SQL DDL 提取 Module Protocol，再走 `--spec` 生成：

```bash
# OpenAPI 3 / Swagger 2 → 协议文件（--out 只写协议，供复查/共享/后续 --spec）
node scripts/keelbase-init.mjs --import-openapi swagger.json --out specs/customer.json
node scripts/keelbase-init.mjs --import-openapi swagger.json --schema Customer --module customers --label 客户

# SQL DDL（CREATE TABLE）→ 协议
node scripts/keelbase-init.mjs --import-schema schema.sql --out specs/customer.json
node scripts/keelbase-init.mjs --import-schema schema.sql --table customers   # 默认第一张表
```

**转换规则（`scripts/generator/import-openapi.mjs` / `import-schema.mjs`）**：

| 来源 | 映射 |
|------|------|
| string + format date/date-time → `date` | OpenAPI |
| string + enum（2-10 个合法小写选项）→ `enum` | OpenAPI / SQL `CHECK ... IN (...)` |
| integer/number → `int`；boolean → `bool` | OpenAPI / SQL |
| TEXT/CLOB → `text`；VARCHAR/CHAR ≤255 → `string`，>255 → `text` | SQL |
| INTEGER/BIGINT/SERIAL/REAL/DECIMAL → `int`；DATE/DATETIME/TIMESTAMP → `date` | SQL |
| object / array / $ref / 关系列（FK） | **跳过**（协议红线：关系保持手写） |
| id / createdAt / updatedAt / deletedAt / userId | **跳过**（基座自带） |

> 输入通道 = 开发期 AI 的一环：`已有 DB Schema / OpenAPI / 自然语言` → Protocol → Code。协议仍是语义源，生成物是可继续修改的普通源代码。

## 5. 协议边界（红线）

- **不覆盖**：关联查询、级联、复杂业务逻辑、权限变体（非本人数据）
- **为什么**：协议厚了会变成低代码平台（撞竞品），且被元数据拖死可扩展性
- 每个字段写协议前问：「AI 不生成它行不行？」——能手写就手写

---

## 6. 生成来源身份（Provenance）

> 2026-08-21 落地（私有仓架构/生态身份设计建议的最小切片）：**不给源码贴水印**，只保留一份项目级来源清单。原则：`Visible by default` / `Removable by choice` / `Verifiable when retained` / `No hidden telemetry` / `No lock-in` / `Project-level first`。

### 6.1 `.keelbase/manifest.json`

`keelbase init` 每次生成在项目根写/合并一份来源清单（纯 JSON，删除不破坏任何运行行为）：

```json
{
  "schema": 1,
  "identity": "keelbase-application",
  "generator": "keelbase",
  "generatorVersion": "0.9.1",
  "protocol": "1.0",
  "modules": ["posts", "notes"]
}
```

| 字段 | 含义 |
|---|---|
| `schema` | 清单 schema 版本（当前 1） |
| `identity` | 身份标记：`keelbase-application` |
| `generator` / `generatorVersion` | 生成器标识与版本（来自发布包的 package.json） |
| `protocol` | 生成所依据的 Application Protocol 版本 |
| `modules` | 本仓库由 keelbase init 生成的模块列表（幂等合并去重、排序） |

**版本化规则**：`schema` 只在不兼容变更时递增（当前 1）。CLI 遇到**更高 schema** 的清单时拒绝覆盖（`keelbase init` 打印 `schema 不匹配——清单由更新版本创建，勿覆盖`，原文件原样保留），防更新版本创建的数据丢失；仅新增字段视为向后兼容，不递增 schema。

### 6.2 `keelbase inspect`

只读、确定性、零网络零 DB 的识别工具：

```bash
node scripts/keelbase-init.mjs inspect   # 或 node scripts/keelbase-inspect.mjs
```

读 `manifest.json` + 扫描仓库能力指纹（ai/tools、casl、governance、audit、旗舰、mcp、headless、flows、realtime），输出「来源身份 + 架构指纹」。退出码：0 = KeelBase 应用；1 = 非 KeelBase（清单缺失）或 schema 无效——**非 KeelBase 项目也可运行**，不抛栈不锁定。

用途：机器可读 onboarding（陌生 AI / AI Bridge 快速判断「这是什么项目、什么协议版本」）+ CI 断言 + 未来的生态识别基础。

### 6.3 `keelbase doctor`

只读、确定性、零网络零 DB 的诊断工具：

```bash
node scripts/keelbase-init.mjs doctor   # 或 node scripts/keelbase-doctor.mjs
```

五查：① **完整性**（manifest 存在、schema 受支持、必需字段齐全）② **一致性**（manifest 列出的生成模块目录是否仍在——缺失按「可移除原则」报 WARN）③ **运行时兼容**（基座能力在位：AI 工具 / CASL / 治理 / AI 审计 / 操作审计 / Agent 运行时）④ **生成器版本**（manifest 记录版本 vs 当前 CLI：旧 → WARN 可升级合并；新 → WARN 勿覆盖）⑤ **兼容矩阵**（manifest 协议/schema vs 当前 CLI 支持的协议/schema：不匹配 → FAIL 需升级 CLI 或重建来源清单）。退出码：0 = 无 FAIL；1 = 有 FAIL 或非 KeelBase。

用途：CI 门禁（`cli-test` job 断言仓库 doctor PASS）+ 生成器升级前体检 + 交接排查。

**环境预检 `--env`**：起容器/起服务前跑一次，一次查出「起不来」的环境缺口并给修复指引：

```bash
node scripts/keelbase-init.mjs doctor --env
```

检查：Node 版本（≥20）/ Docker（CLI 与守护进程）/ 常用端口 3000·10086 占用 / `Server-NestJS/.env` 与 JWT 密钥 / LLM 配置（API Key 或本地 Ollama，缺则提示 AI 降级）/ DB 类型（postgres 需服务、sqlite 零配置）。每项 FAIL/WARN 带 `→ 修复指引`；单容器路径（无本地仓库目录）自动跳过 .env 相关检查。

### 6.4 边界

- **已实现**：运行时来源指纹 `GET /app/provenance`（来源身份 + 能力清单 + AI 工具指纹，2026-08-21）；`Built with KeelBase` badge 规范见 [built-with-keelbase.md](manual/built-with-keelbase.md)
- **不实现**（1.0 后）：System AI Assistant；badge 生态发现（registry / 发现页，需第三方应用出现）
- 清单只记「由生成器产生」的模块，手写模块不强制登记
- 协议仍是语义源；清单是来源身份，**不是**运行时元数据引擎（对齐 §5 红线）
