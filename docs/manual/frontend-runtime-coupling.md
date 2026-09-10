# 前端 Runtime 耦合盘点（FE-1a）

> 2026-09-03。**目的**：FE-1（前端 Runtime-Neutrality）落地前的**只读基线**——盘点三前端 + 生成器前端模板对后端 Runtime（现 TS/NestJS）的耦合面，找「同一前端接不同 Runtime（如 Java）必断」的点。边界参照 = wire Contract v1 + `/app/capabilities` + `/app/provenance`。本次只盘不改；改动方向见 §6。
> 范围：Web-Admin-Vue/src（204 文件）/ Front-Flutter/lib（168）/ Front-Taro/src（73）/ `scripts/generator/templates-frontend.mjs`。

## 0. 结论摘要

三前端整体**未 import Server 源码类型、无 OpenAPI codegen**，后端形状全部手写镜像 → 字段/事件漂移即静默断。耦合集中在 **6 类共性**（非逐端独立问题）：

1. **统一响应信封 `{code,message,data,timestamp}` 契约分叉**（§5.1）
2. **错误体/错误码假设 Nest 专属结构**，未 schema 化（§5.2）
3. **401 自动刷新 + token 轮换假设**（§5.3）
4. **WS/SSE 事件名与 payload 内嵌 UI，无类型化隔离**（§5.4）
5. **`/app/capabilities` 消费不足 → 导航/模块/模型硬编码**（§5.5）
6. **`/app/provenance` 三端零消费**（§5.6）

**最高风险（切 Runtime 必断）**：Flutter AI 触发词与事件 schema 内嵌 / SSE 解析忽略 `event:` 行 / 错误体 `normalizeError`+`guidanceFor` 硬编码 Nest 错误码 / 三端 code 成功语义分叉 / Taro·Flutter capabilities 零导航消费。

## 1. Web-Admin-Vue（工作台 + 管理台，Element Plus）

| 级 | 位置 | 耦合 |
|----|------|------|
| HIGH | `utils/streamChat.ts:104,127` | 两处裸 fetch 绕 axios：`/auth/refresh` + `/ai/chat/stream`；刷新逻辑与 `client.ts:59` **双份实现** |
| HIGH | `api/client.ts:151-170` `normalizeError` | 假设 Nest 错误体 `data.message/errorCode/errors/explanation.deniedBy`；`guidanceFor`(137-149) 硬编码 `deniedBy` 值 `casl/risk_policy/user_scoped` + 中文引导——非 schema |
| HIGH | `api/client.ts:46-48`、`stores/auth.ts:76` | 业务错误码 `EMAIL_NOT_VERIFIED` / `ACCOUNT_LOCKED` 硬匹配后端 |
| HIGH | `utils/streamChat.ts:138-150` | SSE 解析**忽略 `event:` 行、只信 data 内嵌 type**——wire v1 若 event 独立即断 |
| MEDIUM | `layouts/AdminLayout.vue:171-257`、`WorkbenchHomeView.vue:165` | 模块清单静态枚举导航（`module:'crm'|'pm'|'org'…`），非 capabilities 驱动；新增/改名模块静默丢 |
| MEDIUM | `api/client.ts:97-105` | 信封解包在唯一层（data in body 即解包），依赖 `{code,...}` 结构 |
| MEDIUM | `api/ws.ts:18-22` | WS 路径强剥 `/api/v1` 拼 `/ws?token=`，耦合部署前缀 |
| MEDIUM | `types/api.ts`、`api/ai.ts:33-63`、`streamChat.ts:14-88` | 内联接口重复后端形状（camelCase/mode 'run'/runId），字段漂移即断 |
| MEDIUM | `types/workbench.ts:66` | `resultType` 字符串枚举隐含 DB 数字主键 |
| LOW | `/app/provenance` | 未消费（FE-1 规范入口缺失但无 TS 耦合）；`/app/version` 徽标已用 |

**已做对的**：`api/capabilities.ts` + `stores/capabilities` 已消费 `/app/capabilities` 做 gating（`router/guards.ts:48-56`、`AdminLayout.vue:193,215`）；API 全走统一 axios client（`api/client.ts`）。

## 2. Front-Flutter（移动端）

| 级 | 位置 | 耦合 |
|----|------|------|
| HIGH | `core/api/api_response.dart:32` vs `auth/…/auth_repository.dart:18,27` vs `events…:13-18` | **code 成功语义三处并存**：`==200` / `==0` / `∈[200,300)`——TS 端逐模块信封语义内嵌前端 |
| HIGH | `ai_chat_provider.dart:169-189` | `_delegateTriggers` 注释「与后端 SkillsRegistry.triggerKeywords + router delegateKeywords 对齐」，中文触发词/动作词表硬编码 = 客户端复制 TS 技能注册表 |
| HIGH | `ai_chat_provider.dart:333-547` + `sse_client.dart` | AI 事件（`ai:chat`/text/tool_start/confirmation_request{confirmation:{mode,run,authorization}}/confirmation_decision/done/error）解析全在 UI provider 直接 switch，无类型化 model 隔离 |
| HIGH | `api_client.dart:16,190-213` | refresh 响应假设双值 + **轮换**；401 拦截冷启动依赖 Nest「401→refresh 换新」行为 |
| HIGH | `dashboard/…:105-110` | 页面直调 `/admin/templates/personal-assistant/import`（TS 专属段），绕 repository |
| HIGH | `app_shell.dart:16-23` + `explore_page.dart:61-118` | 底部 6 Tab/Explore 模块列表/快捷项全静态；`/app/capabilities` businessModules **零导航消费** |
| MEDIUM | `api_client.dart:313-320` | 错误从顶层读 `message`/`retryAfter`（非 data 内），Nest 错误体假设 |
| MEDIUM | `ai_chat_page.dart:91-95`、`ai_chat_provider.dart:199` | AI 模型清单硬编码 deepseek/qwen，未用 capabilities/AiStatus 过滤 |
| MEDIUM | `sse_client.dart` | `[DONE]` 哨兵/text/error 事件约定流结束 |
| MEDIUM | 25 个 repository 端点字符串内联 | 无路由常量表，切 runtime 端点面人工核对 |
| LOW | `/app/provenance` | lib 内 0 引用 |

## 3. Front-Taro（小程序/H5）

| 级 | 位置 | 耦合 |
|----|------|------|
| HIGH | 全 src | **`/app/capabilities` 与 `/app/provenance` 零消费**（grep 0 命中）——FE-1 边界外立面缺失；模块显隐全静态（`pages/explore` 宫格硬编码） |
| HIGH | `services/api-client.ts:117-147` | refresh 读 `body.data.accessToken/refreshToken` **双层解包**，NestJS 专属形状 |
| HIGH | `services/api-client.ts:151` | `errors?: Record<string,string[]>` 假设 Nest validation 错误字典 |
| HIGH | `services/ws-client.ts:80` + `notification-store.ts:77` | 事件名单硬编码（`notification`/`ping`），切实现即断 |
| MEDIUM | `services/api-client.ts:84-111` | 错误按 `errMsg` 含 `'timeout'/'fail'` 判定（Taro 专属）；取 `body.message/errors` |
| MEDIUM | `auth-service.ts:26-29` + `auth-store.ts:66-86` | miniapp 专属 oauth 流（wechat code→Taro.login） |
| MEDIUM | `types/api.ts:4-9` | 信封 `{code,message,data,timestamp}` 定义但 `isSuccess` 全程未用（死契约）；`event.ts:10` `colorRole:number` 镜像 Nest DTO |
| MEDIUM | `utils/constants.ts:6-8` | base URL 默认含 TS dev 地址 `localhost:3000/api/v1` |
| MEDIUM | `services/ws-client.ts:64-74` | base 变换剥 `/api/v1` + http→ws 假设 |

## 4. 生成器前端模板（`scripts/generator/templates-frontend.mjs`，Build 侧）

生成 Flutter 4 文件（model/repository/provider/page）。**本身较 Runtime-neutral**：
- repository 端点 = `'/${plural}'` / `'/${plural}/$id'`（140/149/155）——**相对资源路径**，从 Protocol plural 生成，无 TS 专属路径段；走统一 `ApiClient`（130）。
- model json 映射 = Protocol 字段名 camelCase（`json['${c}']`），date 生成 String（契约假设）。

**耦合传导**：模板的 neutral 程度取决于前端 core（`ApiClient`/`ApiResponse` 信封/code 语义）是否 neutral——而 Front-Flutter core 已有 §2 的 code 语义分叉/错误体假设问题。**结论 LOW-MEDIUM**：模板自身无 HIGH，但生成代码继承 Front-Flutter core 的耦合；FE-1 对生成器验收（Java 目标模板守 Demand-Gate）主要靠 core 中立化 + Protocol 契约冻结。

## 5. 跨端共性问题（横向合并）

| # | 共性耦合 | 三端现状 |
|---|---------|---------|
| 5.1 | **信封 `code` 成功语义** | Web 解包 `{code,message,data,timestamp}`（唯一层）；Flutter **==200/==0/[200,300) 三处并存**；Taro 定义未用 |
| 5.2 | **错误体 Nest 假设** | Web `normalizeError` 读 data.message/errorCode/deniedBy；Flutter 顶层 message/retryAfter；Taro body.message/errors + validation 字典——均未 schema 化，应随 CE-1-B3 wire Schema 上升 |
| 5.3 | **401-refresh + 轮换** | 三端各自实现 `/auth/refresh {refreshToken}` 重试；Flutter/Taro 双值读取 + 轮换假设 |
| 5.4 | **实时事件手写 switch** | 三端事件名/payload 内嵌 UI（ai:* / notification / tool_start / confirmation_request…），无共享类型化 model；Web SSE 还忽略 `event:` 行 |
| 5.5 | **capabilities 消费不均** | Web gating 用了但导航静态枚举；Flutter/Taro 几乎零导航消费 |
| 5.6 | **provenance 未消费** | 三端 0 引用 |
| 5.7 | **token key / 存储** | 各端 key 中性（secure/localStorage），非 TS 耦合（LOW） |

## 6. FE-1 落地方向建议（本次只盘，不改）

按「切 Runtime 必断」优先序：

1. **错误体 + 信封上升 wire Schema v1**（5.1/5.2，最高优先）：统一各端 code 成功语义与错误读取，进 CE-1-B3 wire contract，前端收敛到一个 client 层解析。
2. **SSE/WS 事件名 + payload schema 化并加类型隔离**（5.4）：前端抽共享事件 model（不再 UI 直接 switch），解析兼容 wire v1 `event:` 行。
3. **capabilities 驱动导航/模型**（5.5）：三端模块清单/底部导航/Explore/模型列表改由 `/app/capabilities` businessModules 派生，去静态枚举。
4. **provenance 消费**（5.6）：旗舰/应用页接入 `/app/provenance`（runtime 来源指纹展示，FE-1 规范入口）。
5. **401-refresh 契约化**（5.3）：明确 refresh 响应形状与轮换语义为契约（非 Nest 行为假设）。
6. **生成器**：core 中立化后，模板保持相对路径 + Protocol 字段，Java 目标模板由 Demand-Gate 触发。
7. 横切：三端各自抽「统一解包/错误/事件」为可替换 adapter（切 Runtime 只换 adapter），`if(runtime)` 禁入业务代码。

## 7. 局限

盘点为静态只读（grep + 通读关键文件 + agent 三路并行），证据基于现状文件：行；wire Contract v1 精确 schema 覆盖范围需对照 CE-1-B3 registry（12→24 对象）。未逐一验证各端点是否已被 wire schema 覆盖——那是 FE-1 下一步（耦合项 ↔ contract 覆盖矩阵）。

## 8. FE-1b 落地记录（2026-09-10，切片一：Web-Admin-Vue 信封/错误/刷新收敛）

> §7 的「覆盖矩阵」与首个收敛切片同步落地。契约源 = `Server-NestJS/specs/protocol/schemas/v1/{api-response,error-body}.schema.json`。

### 8.1 切片一（Web-Admin-Vue）

- **新增 `src/api/envelope.ts`** —— neutral 信封/错误 adapter，对齐 wire v1：
  - `unwrapEnvelope()`：单点解包成功信封（`client.ts` 主/治理两处 + 拦截器统一走此）；
  - `readErrorBody()`：按契约取**顶层** `message/errorCode/reason/impact/nextStep/explanation/retryAfter`；
  - **去契约外字段 `errors` 字典**（后端 `AllExceptionsFilter` 不发，validator 错误已 `'; '` join 进 `message`；FE-1a 5.2 的「Nest 假设」实证为契约外漂移）；
  - `deniedByOf()`：`explanation` 兼容 object|string（原硬取 `.deniedBy`）。
- **新增 `src/api/session.ts`** —— token 刷新**唯一实现**（原 `client.ts`（axios）+ `utils/streamChat.ts`（裸 fetch）双份并存、语义靠人工对齐）；共享 `refreshPromise` 防并发 stampede。
- `client.ts` / `streamChat.ts` 改消费二者；`ApiError` 移除 `errors` 字段（仅 spec 引用，无视图消费）。
- 测试：`envelope.spec` 8 + `client.spec` 6 绿；typecheck 绿。

### 8.2 耦合项 ↔ wire Contract v1 覆盖矩阵（FE-1a §5 × CE-1-B3 registry）

| FE-1a 耦合 | 对应 wire Schema v1 | Web | Flutter | Taro |
|---|---|---|---|---|
| 5.1 信封 `code` 语义 | `api-response` | ✅ 切片一（单点解包） | ✅ 切片二（统一 `isSuccess`=2xx；五处判定收敛） | ✅ 切片三（`isSuccess`=2xx 由死契约启用；信封失败判定） |
| 5.2 错误体 Nest 假设 | `error-body` | ✅ 切片一（去 `errors`，顶层字段） | ✅ 已核对对齐（顶层 `message`/`retryAfter`，本就正确） | ✅ 切片三（去 `errors` 字典——契约无该字段） |
| 5.3 401-refresh + 轮换 | `api-response`（data=TokenPair） | ✅ 切片一（单一实现） | ✅ 已核对对齐（HTTP 2xx + `data.accessToken/refreshToken`，本就正确） | ✅ 已核对对齐（信封 `data`=TokenPair，本就正确；单飞刷新已在） |
| 5.4 实时事件手写 switch | `sse-event`（已冻结） | ✅ 已核对对齐（7 发射名全符；`data` 内含 type，FE-1a「忽略 `event:` 行即断」被契约化解） | ✅ 已核对对齐（switch 名全符 schema） | ✅ 已核对对齐（事件名全符） |
| 5.5 capabilities 消费 | `/app/capabilities` | ✅ 已按 capabilities 过滤导航（`module` id 与后端 MODULES_MANIFEST **全匹配**；补 `workbench-events/todos` 缺失标签） | 🔶 有 plumbing（`app_capabilities`+provider），explore 用 feature flag，主导航静态 | ⬜ 零消费 |
| 5.6 provenance 消费 | `/app/provenance` | ✅ 切片六（`SystemView` 来源指纹卡：来源身份/preset/模块/工具指纹） | ⬜ 零消费 | ⬜ 零消费 |

### 8.3 后续切片（按 §6 优先序）

- **FE-1b-2 ✅（2026-09-10）**：Flutter 信封/错误/refresh —— 见 §8.4：
  - `ApiResponse.isSuccess` 由 `code == 200` 收敛为 **2xx**（契约 `code = httpStatus`）；
  - **修复 `auth_repository` 的 `code != 0` 漂移**（后端从不发 0 → `code(200) != 0` 恒真 → 真实后端下 login/register/oauth/getProfile 恒抛 `AuthException`；测试夹具用 `code:0` 掩盖了该缺陷）；三处改用 `isSuccess`；
  - 收敛 `ai_conversation_repository`/`events_repository`/`books_repository` 的 `_requireSuccess` + `ai_chat_provider` 两处内联判定（共 5 处 `code < 200 || code >= 300`）到 `ApiResponse.isSuccess`（单一语义）；
  - 测试夹具改契约值（`code: 0→200` / `1001→401`）；Flutter 623 测试绿。
- **FE-1b-3 ✅（2026-09-10）**：Taro 信封/错误 —— 见 §8.5：
  - `isSuccess`（2xx）此前为**死函数**（零引用）→ 启用为信封成功判定（`request`/`upload` 统一 `!isSuccess(body.code)`）；
  - **去契约外 `errors` 字典**（`ApiError.errors` + 两处 throw 传参；契约 `error-body` 无该字段，validator 错误 join 进 `message`）；
  - `build:h5` 绿。
- **FE-1b-4 ✅（2026-09-10，核对，无代码改动）**：事件 model 隔离 —— 见 §8.6。三端事件名/形状**均符合冻结 `sse-event` schema**（Web `StreamChatEvent` 7 名、Flutter provider switch、Taro WS 名）；FE-1a 的「Web 忽略 `event:` 行即断」被「`data` 内含 `type`」的契约化解；余下仅「抽类型化 model」的代码组织（非正确性，Code Economy 下不投机抽象）。
- **FE-1b-5 🔶（2026-09-10，部分）**：capabilities 导航 —— Web **已按 capabilities 过滤**（`module` id 与后端全匹配）+ 补 `workbench-events/todos` 缺失标签；Flutter 有 plumbing 但主导航静态；Taro 零消费（⬜ 留待）。
- **FE-1b-6 🔶（2026-09-10，Web 先行）**：provenance 消费 —— 新增 `api/provenance.ts`（`/app/provenance`）+ `SystemView` 「运行时来源指纹」卡（来源身份 / preset / 业务模块 / AI 工具指纹；`manifestPresent:false` 优雅降级）；线上实测形状一致。Flutter/Taro 待续。
- **FE-1 余**：Flutter 主导航 capabilities 静态 / Taro capabilities 零消费 / Flutter+Taro provenance 消费。

### 8.6 FE-1b-4 核对明细（事件，2026-09-10）

- **结论：无真实缺陷**。冻结 `sse-event` schema 定义帧为 `event: <type>` + `data` 为**含 `type` 顶层**的 chunk（10 名，7 发射）。三端解析均以 `data.type` 为准——与契约一致。
- **Web** `StreamChatEvent` union 名（text/tool_start/confirmation_request/confirmation_decision/tool_end/done/error）＝ schema 发射集 ✓；`handleBlock` 只解 `data:` 行（契约保证 type 在 data 内）。
- **Flutter** provider switch 名全符；**Taro** WS 事件名全符。
- **不改理由**（Code Economy §15.4）：抽「共享类型化 model」是组织优化，非正确性修复；wire 已冻结 → 无「切 Runtime 事件形状变」的现实风险 → 不做投机抽象。

### 8.5 FE-1b-3 明细（Taro，2026-09-10）

- **去契约外字段**：`ApiError.errors?: Record<string,string[]>` 及其两处 throw 传参（`request` 错误分支 + `upload` 错误分支）移除——`error-body` schema 无 `errors`（validator 错误已 `'; '` join 进 `message`），且全仓无消费者。
- **启用死契约**：`isSuccess(code)`（已为 2xx，与契约一致）此前零引用；现用于 `request`/`upload` 的失败判定（`HTTP >= 400 || (typeof body?.code === 'number' && !isSuccess(body.code))`），使信封 `code` 成为契约化成功判据（不再只信 HTTP 状态）。
- **已核对无需改**：refresh 读 `body.data`（=TokenPair，契约正确）；单飞刷新已在（CR-16）。

### 8.4 FE-1b-2 明细（Flutter，2026-09-10）

- **发现的真实缺陷**：`AuthRepository._unwrapData`/`_requireSuccess`/`exportData` 用 `response.code != 0` 判成功，而后端契约 `code = HTTP 状态码`（`ResponseInterceptor` 设 `code: httpStatus`，实测登录返回 `code: 200`）→ `200 != 0` 恒真 → **真实后端下 Flutter 全部认证写路径恒抛 `AuthException`**。单元测试用 `code: 0` 夹具长期掩盖（漂移被测试锁定）。baseUrl 默认即同一后端（`localhost:3000/api/v1`）。
- **收敛**：单一权威 `ApiResponse.isSuccess`（2xx），auth/ai/events/books/ai_chat_provider 六处判定统一引用；`isSuccess` 此前为死 getter（零引用），现为唯一语义点。
