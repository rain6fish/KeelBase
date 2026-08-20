# AI Bridge：存量系统 AI 化接入规格（OpenAPI / Schema → Tool → 治理）

> **状态标记**：✅ 现状已实测 / 🚧 规划（P1，未实现）。
> 定位：不替代、不迁移——让已有系统（Java/Spring、遗留 DB、REST API）安全地获得 AI 能力。
> 本文件是「路线 B / AI Bridge 产品化」的规格 + 接入指南；市场定位表述见私有 roadmap，本文件保持事实性。

---

## 1. 目标与两条路径

| 路径 | 做什么 | 现状 | 适用 |
|---|---|---|---|
| **A. Schema 重建** | 老库 Schema → Protocol → 生成新模块（KeelBase 管理同一份数据的 CRUD + AI）| ✅ `--import-schema` / `--import-openapi` 已实测 | 数据可同库接管，想要 KeelBase 管理的 CRUD + AI |
| **B. API 代理** | OpenAPI operations → 生成代理 Tool → **直接调用已有系统 REST 端点**（携身份、过治理）| 🚧 P1，未实现（仅 `web-search.tool.ts` 有外部 HTTP 先例）| 不能动旧系统、AI 要操作在线已有数据 |

> **关键诚实说明**：A 是「由 Schema 反推的新开发」，B 才是「操作已有系统」。
> 市场叙事「不迁移、不重写」只有 **B** 能完整兑现；A 承诺的是「同库接管 + AI 化」。
> 接入先按 §6 决策表选路，不要把 A 当成 B。

---

## 2. 现状能力盘点（A 路径，✅ 已实测）

- `node scripts/keelbase-init.mjs --import-openapi swagger.json`（OpenAPI 3 `components.schemas` / Swagger 2 `definitions`）
- `--import-schema schema.sql --table xxx`（`CHECK IN` → enum，`VARCHAR(120)` → string，`DECIMAL` → int）
- 类型映射：string / text / int / bool / date / enum（2-10 个合法小写选项），非法降级 string
- 保留字段跳过：`id / userId / createdAt / updatedAt / deletedAt`
- 关系跳过：`object / array / $ref` 保持手写（协议红线）
- `--out` 写 Protocol JSON（复查 / 供 `--spec` 复用）；`--module / --label / --schema` 指定
- 测试覆盖：类型映射、Swagger 2、无 schemas、enum 非法降级、CLI 端到端（`--out` + 直接生成）
- 引用：`scripts/keelbase-init.test.mjs` P0-12 段；[aiization-demo.md](aiization-demo.md)

---

## 3. 导入加固清单（A 路径，🚧 P1，带验收）

| # | 加固项 | 问题 | 验收标准 |
|---|---|---|---|
| 1 | **required 透传** | OpenAPI `required` 数组未映射到 Protocol `required` | 单测：required 字段 → create DTO 非空校验 + 前端必填 |
| 2 | **label/description 透传** | schema 属性 `title/description` 丢失 | 单测：title → Protocol `label`，生成后 UI 显示中文标签 |
| 3 | **多 schema / 多模块** | 只取第一个 schema，其余静默丢弃 | 支持 `--schemas a,b` 或交互选择；未选 schema 列入手写清单 |
| 4 | **$ref / allOf 浅层解析** | `$ref` / `allOf` 直接跳过 | 单层 `$ref` 解析为「关系标注」并落入手写清单；`allOf` 合并标量字段 |
| 5 | **YAML 支持** | 只吃 JSON，真实企业 spec 多为 YAML | 内置 YAML 解析，支持 `.yaml/.yml` |
| 6 | **跳过诊断报告** | 字段静默跳过，Java 团队不知道缺了什么 | `--out` 时输出 `skipped: [{ name, reason }]` |
| 7 | **enum 降级告警** | enum 选项不合法静默降级 string | 降级时输出 warning + 建议（如转换选项为小写） |
| 8 | **number 精度提示** | `number` → int 丢精度（价格/金额）| 对 `DECIMAL` / `format:double` 输出「建议保留 text/int，金额字段谨慎」提示 |
| 9 | **多文件 OpenAPI** | 企业 spec 常拆分多文件 | 本地相对 `$ref: './other.yaml#/...'` 解析 |

---

## 4. API 代理工具路径（B 路径，🚧 P1）

目标：`OpenAPI operations → 生成代理 Tool → 直接调已有系统 REST 端点`，全部过治理层。

```text
已有系统 REST
   ↓
OpenAPI（含 operations + securitySchemes）
   ↓
生成器：每条业务 operation → 一个 AI Tool 定义（读/写、参数 schema、风险级）
   ↓
执行时：ProxyTool → HTTP 调目标端点（注入用户委托身份）
   ↓
治理：Permission / Risk / Confirmation / Audit（复用 HS-9 治理层）
```

- 读操作 → R1 自动；写操作 → R3 Confirmation（对齐 W5 Risk-based Tool Contract）
- 新增组件：`openapi-proxy` 生成器 + 运行时 `ProxyTool` 骨架（首个先例 `web-search.tool.ts`）
- 错误语义：目标系统 4xx/5xx 透传为工具失败原因，供 Agent 回退
- **验收**：一个模拟 Java 系统（示例 OpenAPI）端到端——OpenAPI → 生成 → AI 读/写 → 确认 → 审计 → 撤销

---

## 5. 身份 / 权限桥接（🚧 P1，B 路径成立的前提）

问题：**Java 系统登录用户在 KeelBase 里是谁？AI 以谁的权限操作 Java 数据？**
不解决它，B 路径的「Permission」是空心的。

- 现有：OIDC SSO（`oauth.service verifyOidc`）可作统一身份源
- 缺口：Java 会话 → KeelBase 用户作用域的委托/模拟 token 流
- 设计：企业 IdP 认证一次 → KeelBase 建 session 映射 → 代理 Tool 调目标端点时注入「用户委托身份」头（目标系统认可该映射）
- 验收：模拟 Java 系统收到调用识别到正确用户身份；越权（他人数据）被目标系统或 KeelBase 拒绝

---

## 6. Java 团队接入指南（草案，随实现完善；对外发布前先完成 §3/§4/§5）

### 第 1 步：选路（决策表）

| 场景 | 路径 |
|---|---|
| 旧系统可改库 / 数据可复制 | **A** Schema 重建 |
| 不能动旧系统、AI 要操作在线数据 | **B** API 代理 |
| 核心数据用 B 代理，衍生表用 A | 混合 |

### 第 2 步：导入

```bash
# A 路径：Schema / OpenAPI → Protocol（先出协议，复查后再生成）
node scripts/keelbase-init.mjs --import-openapi ./swagger.yaml --out specs/contract.json
node scripts/keelbase-init.mjs --import-schema schema.sql --table contracts --out specs/contract.json
# 查看 skipped 报告 → 关系字段手写
# 确认后生成
node scripts/keelbase-init.mjs --spec specs/contract.json --label 合同
```

### 第 3 步：治理

- 读工具 → 自动；写工具 → 人工确认（已默认）
- 高风险写（金额变更 / 删除 / 审批决定）→ 等 W5 `riskLevel` 落地后配置
- 审计：所有 AI 操作落哈希链，可撤销

### 第 4 步：验收

> AI 完成一个真实业务任务 + 审计可查 + 越权被拒（他人数据 403）。

---

## 7. 与现有能力的关系

- Protocol：A 路径生成物是普通源代码（语义源，非运行时元数据）
- MCP / Webhook：B 路径与 MCP 网关互补——B 面向「已有系统 API 的常规工具化」，MCP 面向外部 server 生态
- `aiization-demo.md`：A 路径的 10 分钟演示；本文件是它的产品化规格

## 相关

- [aiization-demo.md](aiization-demo.md) — 已有系统 AI 化演示（A 路径）
- [synthetic-stranger.md](synthetic-stranger.md) — 合成陌生人验证 harness（含 Java 团队视角场景）
- [30min-acceptance.md](30min-acceptance.md) — 生成器验收
