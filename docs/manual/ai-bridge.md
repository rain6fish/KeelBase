# AI Bridge：存量系统 AI 化接入规格（OpenAPI / Schema → Tool → 治理）

> **状态标记**：✅ 现状已实测 / 🚧 规划（P1，未实现）。
> 定位：不替代、不迁移——让已有系统（Java/Spring、遗留 DB、REST API）安全地获得 AI 能力。
> 本文件是「路线 B / AI Bridge 产品化」的规格 + 接入指南；市场定位表述见私有 roadmap，本文件保持事实性。

---

## 1. 目标与两条路径

| 路径 | 做什么 | 现状 | 适用 |
|---|---|---|---|
| **A. Schema 重建** | 老库 Schema → Protocol → 生成新模块（KeelBase 管理同一份数据的 CRUD + AI）| ✅ `--import-schema` / `--import-openapi` 已实测 | 数据可同库接管，想要 KeelBase 管理的 CRUD + AI |
| **B. API 代理** | OpenAPI operations → 生成代理 Tool → **直接调用已有系统 REST 端点**（携身份、过治理）| ✅ 已实现（§4：ProxyTool + openapi-proxy 生成器 + revokePath 撤销，e2e 6/6）| 不能动旧系统、AI 要操作在线已有数据 |

> **关键诚实说明**：A 是「由 Schema 反推的新开发」，B 才是「操作已有系统」。
> 市场叙事「不迁移、不重写」只有 **B** 能完整兑现；A 承诺的是「同库接管 + AI 化」。
> 接入先按 §6 决策表选路，不要把 A 当成 B。

---

## 2. 现状能力盘点（A 路径，✅ 已实测）

- `node scripts/keelbase-init.mjs --import-openapi swagger.json`（OpenAPI 3 `components.schemas` / Swagger 2 `definitions`；**支持 `.yaml/.yml` + 多文件本地相对 `$ref` 自动合并 + `--list-schemas`**）
- `--import-schema schema.sql --table xxx`（`CHECK IN` → enum，`VARCHAR(120)` → string，`DECIMAL` → int）
- 类型映射：string / text / int / bool / date / enum（2-10 个合法小写选项），非法降级 string
- 保留字段跳过：`id / userId / createdAt / updatedAt / deletedAt`
- 关系跳过：`object / array / $ref` 保持手写（协议红线，诊断报告标注关系目标）
- `--out` 写 Protocol JSON（复查 / 供 `--spec` 复用）；`--module / --label / --schema` 指定
- **身份桥接**：`POST /auth/delegation-token` 签发委托 JWT（Java 系统共享密钥验签映射本地用户，§5）
- 测试覆盖：类型映射、Swagger 2、无 schemas、enum 非法降级、YAML、$ref/allOf、number 精度、CLI 端到端（`--out` + 直接生成）
- 引用：`scripts/keelbase-init.test.mjs` P0-12 段；[aiization-demo.md](aiization-demo.md)

---

## 3. 导入加固清单（A 路径，带验收）

> 状态：✅ 已完成（2026-08-20） / 🚧 规划（P1，未实现）

| # | 加固项 | 问题 | 状态 | 验收标准 |
|---|---|---|---|---|
| 1 | **required 透传** | OpenAPI `required` 数组未映射到 Protocol `required` | ✅ | required 字段 → Protocol `required: true` → **AI 工具输入 schema 必填**（Agent 必须提供）+ **create DTO `@IsNotEmpty()` 非可选** + **前端 model `required`**；单测 + CLI 端到端覆盖 |
| 2 | **label/description 透传** | schema 属性 `title/description` 丢失 | ✅ | `title` 优先 / `description` 兜底 → Protocol `label`（流入 AI 工具参数描述）；引号/换行/反斜杠净化、限长 40 |
| 3 | **多 schema / 多模块** | 只取第一个 schema，其余静默丢弃 | ✅（`--list-schemas`） | `--list-schemas` 列出可用 schema（未选列入手写清单）；`--schema <name>` 指定单个。`--schemas a,b` 多模块循环留待后续 |
| 4 | **$ref / allOf 浅层解析** | `$ref` / `allOf` 直接跳过 | ✅ | 字段级 `$ref` / allOf 含 `$ref` → 关系标注落入手写清单；顶层 allOf → 合并标量 properties + required |
| 5 | **YAML 支持** | 只吃 JSON，真实企业 spec 多为 YAML | ✅ | 内置 YAML 子集解析（零依赖 `yaml.mjs`），`.yaml/.yml` 直接导入（嵌套 map/list/引号/内联 enum/多行） |
| 6 | **跳过诊断报告** | 字段静默跳过，Java 团队不知道缺了什么 | ✅ | `--out` 协议含 `skipped: [{ name, reason }]`（保留/关系/非法名/enum 降级）；直接生成时终端打印诊断 |
| 7 | **enum 降级告警** | enum 选项不合法静默降级 string | ✅ | 降级记入 `skipped`（reason 含「降级为 string」），不再静默 |
| 8 | **number 精度提示** | `number` → int 丢精度（价格/金额）| ✅ | OpenAPI `number`/`format:double` + SQL `DECIMAL`/`REAL`/`FLOAT` → int 时输出「建议保留 text/int，金额字段谨慎」提示（`notes` 打印） |
| 9 | **多文件 OpenAPI** | 企业 spec 常拆分多文件 | ✅ | 本地相对 `$ref: './other.yaml#/...'` 自动加载外部文件并合并其 schemas |

**已完成（2026-08-20 首轮 + 2026-08-23 AI Bridge 加固）**：
- `import-schema` 对称加固——`NOT NULL` → `required` + 同款 `skipped` 诊断（保留列/约束行/未知类型/无法解析）+ `DECIMAL`/`REAL`/`FLOAT` 精度 `notes`
- **DTO required 必填**——`required` 字段 → create DTO `@IsNotEmpty()` + `@ApiProperty` + 非可选；前端 model `required this.x` + 非空类型
- **§3 剩余 5 项（#3/#4/#5/#8/#9）全部落地**——YAML 解析、$ref/allOf、多文件合并、精度提示、list-schemas；CLI 测试 44→47

**后续项（§3 其余规划项）**：`--schemas a,b` 多模块循环生成（当前 `--list-schemas` + 单 `--schema` 已覆盖选择/手写清单）

---

## 4. API 代理工具路径（B 路径，✅ MVP 落地 2026-08-23；完整 B 待做）

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

**✅ MVP（2026-08-23）**：
- 运行时 `ProxyTool`（`src/ai/proxy/proxy-tool.ts`）：Settings `ai_proxy_tools` 动态配置（`{ baseUrl, audience, tools[{ name, method, path, parameters, riskLevel }] }`）→ `ProxyToolRegistryService` 启动时注册到 ToolRegistry
- 读 → R1 自动；写 → R3 Confirmation（缺省按 method 派生，`requiresConfirmation` 门控走现有确认流）
- 委托身份注入：execute 时 `DelegationTokenService.sign(userId, audience)` → `Authorization: Bearer <委托 JWT>`（§5）
- 错误语义：目标 4xx/5xx 透传为工具失败原因，供 Agent 回退
- **e2e 验收（`test/proxy-bridge.e2e-spec.ts`，模拟 Java 系统）3/3**：读工具委托身份注入目标+识别用户 / 写工具 R3 确认门控+body 送达 / 越权（目标 403）→ 工具失败透传

**✅ openapi-proxy 生成器（2026-08-23）**：`keelbase-init --import-openapi-proxy <spec> --base-url <url> --audience <id> [--out proxy.json]`——从 OpenAPI `paths` operations **自动生成** `ai_proxy_tools` 配置（替代手写 JSON）：
- 每条 operation → 一个工具：`name`（operationId 优先，camelCase → snake_case；冲突去重）+ `method` + `path`（OpenAPI 路径模板 `{param}` 与 ProxyTool 占位同构直传）+ `parameters`（path 必填 + query + requestBody JSON schema 属性，required 透传）+ `riskLevel`（读 GET=R1 / 写 POST·PUT·PATCH·DELETE=R3；`x-keelbase-risk-level` 扩展可覆盖，如删除 R4）
- 支持 YAML/JSON + 本地相对 `$ref` 多文件合并（复用 §3 加载器）；flow-map 字符串 schema 防御性解析
- 产物可直接 `PUT /settings/ai_proxy_tools`（或管理台「设置」粘贴）→ ProxyToolRegistryService 注册为 AI 工具（写配置即热更新，无需重启）
- 覆盖：CLI 端到端 + `parseOpenApiProxy` 单测（类型映射 / riskLevel 覆盖 / body required / 名称去重）

**✅ 确定性整链 e2e（2026-08-23）**：`test/proxy-bridge.e2e-spec.ts` 扩至 4 用例——新增「生成器产物 → Settings → 运行时注册 → 读自动/写确认 + 委托身份可调用」（`ProxyToolRegistryService.loadAndRegister` 读真实 Settings + mock 目标收到 GET + 委托 JWT，CI 可跑）。

**✅ AI 对话端到端脚本（2026-08-23，`scripts/verify-proxy-bridge.mjs`）**：真实 LLM 对话驱动——读（R1 自动，LLM 调 `proxy_list_contract` → mock 目标收到 + 委托身份）/ 写（R3 确认门控 → `confirmation_request` → approve → 目标收到 POST + body）+ 决策轨迹审计。前置：后端已起 + `ai_proxy_tools` 已配置（写配置即热更新生效，无需重启）+ DeepSeek key；报告落 `docs/benchmark/proxy-bridge-<ts>.md`。

**✅ 写副作用登记 + 外部撤销语义（2026-08-23）**：ProxyTool 写经确认后执行 → `AiService._executeWriteTool` 登记 `proxy_call` 副作用（`/ai/tool-effects` 可见，审计完整）；撤销外部副作用返回 `{ revoked:false, external:true, message:'B 路径外部副作用撤销需 Java 端补偿' }`（诚实语义，无本地实体可软删）。e2e 5/5。

**✅ revokePath 约定（2026-08-24）**：OpenAPI operation 加 `x-keelbase-revoke-path` 扩展 → 生成器自动生成工具 `revokePath` 字段（Java 端补偿端点约定，如 `DELETE /contracts/{id}`）；`ProxyTool` 持有 `revokePath`，AI 写副作用撤销时据此调 Java 补偿端点（带委托身份）。生成器单测 5/5。

**Java 端补偿接口约定（`x-keelbase-revoke-path`）**：
- 形态：OpenAPI operation 声明补偿端点（相对 baseUrl），如 `DELETE /contracts/{id}`（`{id}` 占位来自副作用 resultId）
- 委托身份：撤销调用同样注入 `Authorization: Bearer <委托 JWT>`（§5 验签映射本地用户）
- 幂等要求：补偿端点须幂等（重复撤销返回同结果，不报错）——与 KeelBase 副作用幂等键对齐，防 LLM/重试重复撤销
- 无 revokePath 的写工具：撤销返回 `{ revoked:false, external:true, message:'B 路径外部副作用撤销需 Java 端补偿' }`（诚实语义）

**✅ 运行时撤销调用（2026-08-24）**：副作用撤销时若工具配置带 `revokePath` → `ProxyToolRevokerService`（ai.module useFactory 组装，注入 AiToolEffectsService）从已注册 ProxyTool 取 baseUrl/audience/revokePath + 签发委托 token → HTTP 调补偿端点（`{id}` 占位=副作用 resultId）。撤销结果 `{ revoked:true, external:true, compensated:true, message:'Java 端已补偿（POST /contracts/…/cancel）' }`；未配置 revokePath → `{ revoked:false, external:true, message:'…需 Java 端补偿接口' }`（诚实语义）。proxy-bridge e2e 5/5 覆盖。

**✅ 服务身份查询副作用状态（2026-09-02，`GET /api/v1/external/effects/:resultType/:resultId`）**：Java 接入方反向对账——查某业务动作（如 `followup/7`）的 AI 副作用是否存在 + 是否已撤销。认证 `GOVERNANCE_API_KEY`（x-api-key/Bearer，同治理台回调钥）。返回 `{ effect, target:{targetExists,targetSoftDeleted,targetTitle}, revoked, revokeHint? }`；本地实体 `revoked = targetSoftDeleted`（撤销真值在主应用，治理库无业务实体）；B 路径 `proxy_call` 主库 effect 无撤销列、撤销经 Java 补偿端点 → `revokeHint` 明示「撤销态需在 Java 侧确认」（诚实边界）。starter 侧 `KeelbaseClient.querySideEffect` 封装。

---

## 5. 身份 / 权限桥接（✅ KeelBase 侧落地 + ✅ Java 侧由 keelbase-java-starter 封装）

问题：**Java 系统登录用户在 KeelBase 里是谁？AI 以谁的权限操作 Java 数据？**
不解决它，B 路径的「Permission」是空心的。

**✅ KeelBase 侧委托 token 签发（2026-08-23）**：
- `POST /auth/delegation-token`（已认证用户）→ 签发**短期委托 JWT**：
  - `sub` = KeelBase userId；`oidcSub` = OIDC subject（`users.providerId`，统一身份源映射键）；无 OIDC 时 `subject = local:<userId>`
  - `aud` = 目标系统标识（如 `legacy-erp`）；`iss` = `keelbase`；默认 300s（DTO 限制 60-3600）
  - 独立 `DELEGATION_SECRET`（缺省回退 JWT_SECRET，生产应显式配置独立密钥）
- **Java 端验证方式**：共享 `DELEGATION_SECRET` 验签 → 校验 `aud` → 用 `oidcSub`（或 `local:<userId>`）映射本地用户 → 越权（他人数据）拒绝。示例：
  ```java
  // Java/Spring：验签委托 JWT（HMAC256，secret=DELEGATION_SECRET）
  Jws<Claims> jws = Jwts.parserBuilder().setSigningKey(secret.getBytes()).build().parseClaimsJws(token);
  String oidcSub = jws.getBody().get("oidcSub", String.class); // 映射本地用户
  if (!"legacy-erp".equals(jws.getBody().getAudience())) throw new AccessDeniedException("audience mismatch");
  ```

  > **Java 侧免手写（首选）**：验签 / aud·iss·过期校验 / 身份映射已由 [KeelBase Java Starter](https://github.com/rain6fish/KeelBase-java-starter) 封装为 `DelegationAuthFilter` + `@DelegationUser` + `KeelBaseUserMapper`（仓库 `docs/` 有中英开发对接文档）；上面的手写示例仅作 Java 8 / Spring Boot 2 存量系统兜底。

- **已落地**：B 路径 ProxyTool 注入委托身份头（§4）+ 模拟 Java 系统端到端验收（收到调用识别到正确用户身份；越权被拒）
- 验收：模拟 Java 系统收到调用识别到正确用户身份；越权（他人数据）被目标系统或 KeelBase 拒绝

---

## 6. Java 团队接入指南（§3 导入加固 + §4 B 路径 ProxyTool + §5 委托 token 均已落地）

### 第 1 步：选路（决策表）

| 场景 | 路径 |
|---|---|
| 旧系统可改库 / 数据可复制 | **A** Schema 重建 |
| 不能动旧系统、AI 要操作在线数据 | **B** API 代理（§4 生成器已落地；配好 `ai_proxy_tools` 即生效） |
| 核心数据用 B 代理，衍生表用 A | 混合 |

### 第 2 步：导入（A 路径）

```bash
# OpenAPI → Protocol（支持 .yaml/.yml、多文件本地相对 $ref 自动合并）
node scripts/keelbase-init.mjs --import-openapi ./swagger.yaml --out specs/contract.json
node scripts/keelbase-init.mjs --import-openapi ./swagger.yaml --list-schemas   # 列出可用 schema
node scripts/keelbase-init.mjs --import-openapi ./swagger.yaml --schema Contract --out specs/contract.json  # 指定 schema
# 查看 skipped（关系/保留）与 notes（number 精度）报告 → 关系字段手写
# 确认后生成
node scripts/keelbase-init.mjs --spec specs/contract.json --label 合同

# B 路径（代理已有系统 REST）：OpenAPI operations → ai_proxy_tools 配置
node scripts/keelbase-init.mjs --import-openapi-proxy ./legacy-openapi.yaml --base-url http://legacy-erp:8080/api --audience legacy-erp --out proxy-config.json
# 产物粘贴到管理台「设置」/ PUT /settings/ai_proxy_tools → 写配置即热更新生效（无需重启）
```

### 第 3 步：身份桥接（B 路径前提；A 路径可选）

- KeelBase 用户签发短期委托 token：`POST /auth/delegation-token`（body `{ audience: '<目标系统>' }`）
- Java 端共享 `DELEGATION_SECRET` 验签 → 用 `oidcSub`（OIDC subject）或 `local:<userId>` 映射本地用户 → 越权拒绝
- 默认 300s 短时有效 + audience 限定目标系统，防跨系统冒用
- **Java 侧接入首选 [keelbase-java-starter 快速开始](https://github.com/rain6fish/KeelBase-java-starter/blob/main/docs/quickstart.md)**——`@KeelbaseTool` 声明 + 委托验签 + 撤销补偿脚手架，含 `GET /keelbase/status` 诊断与中英文档；本步手写示例兜底 Java 8 / Boot 2 存量系统

### 第 4 步：治理

- 读工具 → 自动；写工具 → 人工确认（已默认）
- 高风险写（金额变更 / 删除 / 审批决定）→ 配置 `riskLevel`（R3 确认 / R4 双人审批 / R5 阻断）
- 审计：所有 AI 操作落哈希链，可撤销

### 第 5 步：验收

> AI 完成一个真实业务任务 + 审计可查 + 越权被拒（他人数据 403）。B 路径需：Java 端收到调用识别到正确用户身份。

---

## 7. 与现有能力的关系

- Protocol：A 路径生成物是普通源代码（语义源，非运行时元数据）
- MCP / Webhook：B 路径与 MCP 网关互补——B 面向「已有系统 API 的常规工具化」，MCP 面向外部 server 生态
- `aiization-demo.md`：A 路径的 10 分钟演示；本文件是它的产品化规格

## 相关

- [KeelBase Java Starter](https://github.com/rain6fish/KeelBase-java-starter) — Java 侧一等公民接入层（Spring Boot Starter：委托验签 / `@KeelbaseTool` 导出 / 撤销补偿），仓库 `docs/` 含中英开发对接文档（quickstart / configuration / delegated-identity / tool-declaration / compensation / troubleshooting）
- [aiization-demo.md](aiization-demo.md) — 已有系统 AI 化演示（A 路径）
- [synthetic-stranger.md](synthetic-stranger.md) — 合成陌生人验证 harness（含 Java 团队视角场景）
- [30min-acceptance.md](30min-acceptance.md) — 生成器验收
