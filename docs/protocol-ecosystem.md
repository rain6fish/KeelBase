# KeelBase 协议生态（P1-1）

> 定位：KeelBase 的「协议」是 **AI-readable semantic source of an application**——让 AI（Claude Code / `keelbase init`）读它就能按系统约定生成/扩展。协议**不是低代码运行时**，生成物永远是普通源代码。
> 红线（EASY-7 / P0-9）：协议只覆盖高频重复的 20%；每个字段问「AI 不生成它行不行？」；协议薄则成脚手架升级版，厚则成低代码平台。

---

## 1. 五类协议总览

| 协议 | 描述什么 | 形态 | 位置 | 成熟度 |
|---|---|---|---|---|
| **Module Protocol** | 业务模块（entity/field/enum） | JSON | [docs/module-protocol.md](module-protocol.md) + `specs/*.json` + `keelbase init --spec` | ★★★☆（已反推 enum/旗舰） |
| **Flow Protocol** | 业务流程（human/ai/condition 节点） | TS interface + Joi schema | `src/flows/flow-definition.schema` | ★★★（FLOW-1 落地） |
| **Tool Protocol** | AI 工具（name/params/permissions） | TS interface + JSON Schema | `src/ai/interfaces/tool.interface.ts` | ★★★（HS 系列落地） |
| **Plugin Manifest** | 插件（requires/featureFlag/生命周期） | TS interface | `src/plugins/plugin.interface.ts` | ★★☆（PL-11 落地，CLI 待续） |
| **Capability Metadata** | 启用的模块/功能/预设 | JSON 端点 | `GET /app/capabilities` + `modules-manifest` | ★★★（MOD-4 三端联动） |

## 2. 各协议说明

### 2.1 Module Protocol（业务模块）

- **形态**：一份 JSON（`module/plural/label/fields[{name,type,enum}]`），字段类型 string/text/int/bool/date/enum。
- **生成**：`keelbase init --spec specs/xxx.json` → 实体/DTO/API/页面/权限/审计/AI 工具（普通源代码）。
- **AI 消费**：Claude Code 读 [module-protocol.md](module-protocol.md) + `specs/` 反推样例，按映射表生成。
- **边界**：relation（belongsTo）已识别为旗舰共性但保持手写；AI 工具层声明暂不自动化（运行时 AI 归 `src/ai/tools/`）。

### 2.2 Flow Protocol（业务流程）

- **形态**：`flow-definition`（判别联合：`human_task` / `ai_task` / `condition`）+ Joi 校验（id 唯一 / next / then / else 引用）+ 图一致性。
- **生成**：`POST /flows/ai/generate`（自然语言 → LLM 按 schema 产出 JSON → 校验 → 预览）→ 确认发布。
- **AI 消费**：护栏优先混合编排——显式节点锁死合规步骤，其余路由 AI 动态决策。
- **边界**：拖拽设计器（FLOW-8）押后；行业模板（FLOW-9）押后。

### 2.3 Tool Protocol（AI 工具）

- **形态**：`AiTool`（name/description/parameters + 可选 `permissions`（requireVerifiedEmail/featureFlag/adminOnly）+ `requiresConfirmation`）→ `ToolDefinition`（OpenAI JSON Schema）。
- **生成**：`keelbase init` 自动附带 `query_<module>`（读）+ `create_<module>`（写需确认）；旗舰应用工具手写（query/analyze/create + 治理）。
- **AI 消费**：工具经 HS-9 治理（enabled/requiresConfirmation/allowedRoles/审计粒度）+ HS-2 门控（featureFlag/邮箱）+ HS-3 幂等/撤销。
- **边界**：写工具必须需确认；状态变更型写工具不记副作用（review_* 类）。

### 2.4 Plugin Manifest（插件）

- **形态**：`PluginManifest`（name/version/requires/featureFlag）+ 生命周期钩子（onAppStart/onFeatureChange）+ `registerRoute`。
- **生成**：`src/plugins/` 目录约定 + `POST /plugins/:path` 统一入口。
- **AI 消费**：插件按 manifest 依赖校验装配，featureFlag 可开关。
- **边界**：安装/卸载 CLI（P1-7）待续；插件不绕过治理层（外部 MCP 工具强制过 HS-9/HS-2/HS-3）。

### 2.5 Capability Metadata（能力元数据）

- **形态**：`GET /app/capabilities` → `{ preset, features, businessModules }`（Public，三端消费）。
- **生成**：`FeatureFlagsService`（PRESETS full/small/lite）+ `modules-manifest`（core/ai/notification/business 分组 + 依赖图校验）。
- **AI 消费**：前端隐藏未启用模块导航（MOD-4）；生成器/协议可按 capabilities 裁剪。

## 3. AI 全链路生成（五类协议如何配合）

```text
Natural Language / DB Schema / OpenAPI / Existing Code
  ↓（多输入，P0-12 演进）
Module Protocol（entity/field/enum）
  ↓
keelbase init --spec / Claude Code 按约定生成
  ↓
普通源代码：Entity / DTO / API / 页面 / 权限 / 审计 / AI 工具 / 测试
  ↓
Tool Protocol（query_<module> 读 + create_<module> 写需确认）→ 运行时 Agent
  ↓
Capability Metadata（preset/features/businessModules）→ 三端导航一致
```

Flow / Plugin 协议在业务/扩展层按需叠加，均不改变「生成物 = 普通源代码」原则。

## 4. 演进路径

| 阶段 | 内容 |
|---|---|
| 已完成 | Module（enum/旗舰反推）+ Flow v1 + Tool（生成器附 AI 工具）+ Capability（三端联动）+ Plugin v1 |
| P1（本文件后） | Tool/Flow/Plugin 协议文档化对照表；Module 多输入（Schema/OpenAPI → Protocol）；生成器增量修改 |
| P2 | 协议版本化（AI 可识别 schema 版本）；生态 Registry（第三方贡献 Module/Tool/Plugin 包） |

## 5. 相关文档

- [module-protocol.md](module-protocol.md) — Module Protocol 词汇表 + 旗舰反推（EASY-7/P0-9）
- [ai-agent.spec.md](ai-agent.spec.md) — 运行时 AI（Tool Protocol 消费方）
- [hs9-governance-policy.spec.md](hs9-governance-policy.spec.md) — 工具治理（Tool Protocol 边界）
- [30min-acceptance.md](manual/30min-acceptance.md) — 协议 → 代码 → 运行 验收脚本
