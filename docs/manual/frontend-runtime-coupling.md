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
