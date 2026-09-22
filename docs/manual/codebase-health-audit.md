# KeelBase 代码库健康体检报告（Codebase Health Audit）

> 首次全库体检：2026-09-03。范围约 1232 源文件 / 13.6 万行（Server-NestJS 748 文件 7 万行 + Web-Admin-Vue 2.4 万 + Front-Flutter 2.3 万 + Front-Taro 4.4 千 + scripts 9.7 千）。
> 体检方式：三路并行只读扫描（后端结构 / 后端质量 / 前端+脚本）+ 每项人工二次确认（删除前证据化）。
> 本文件是唯一权威的屎山/待重构清单与推进记录；每次执行清理后在此追加记录。

## 1. 总体结论

仓库**整体非常干净**：TODO/FIXME/HACK≈0、无死路由/孤立页、i18n 执行良好（Vue/Flutter/Taro 均走 i18n）、迁移干净、覆盖率 85%+（后端 statements≥85 门槛）。说明四层 code review + release gate 的增量把关有效。

真正的屎山集中在**结构性**维度（god service、语义重复的治理模块、循环依赖）与少量**本地堆积**（gitignored 的实验残留）。全部为**历史迭代自然积累**，无系统性烂账。

## 2. 分级发现清单

### HIGH — 结构性（处置阶段 2/3）

| # | 位置 | 说明 | 建议处置 |
|---|------|------|---------|
| H1 | `Server-NestJS/src/ai/ai.service.ts`（2134 行） | god object：AI 编排 / R4 双人审批 / 工具执行 / 代理 / MCP / 审计全塞一个类，构造函数 20+ 依赖 | 阶段 3 拆分（按子域，文件内已有 `// ── R4 双人审批 ──` 分段天然边界） |
| H2 | `Server-NestJS/src/auth/auth.service.ts`（1111）/ `src/ai/audit/audit.service.ts`（1022） | 巨型 service，天然子域边界明显（auth: 登录/锁定/OAuth/MFA/SSO/会话；audit: 写入/哈希链/统计/报表） | 阶段 3 先拆这两个（先拆小后拆大） |
| H3 | `src/crm/crm.service.ts`（571）/ `src/admin/admin.service.ts`（598）/ `src/org/org.service.ts`（568） | 中型膨胀（500+） | 阶段 3 后续 |
| H4 | audit/governance 语义分散：`src/operation-audit` / `src/ai/audit` / `src/ai/governance` / `src/governance` / `src/governance-sidecar` | 治理+审计+审批语义切 4+1 处，`governance` 与 `ai/governance` 命名直接平行；sidecar 疑可独立进程又与 ai-tool-effects 交叉 | 阶段 4 独立架构立项（牵涉独立治理台进程，**不在本次范围**） |
| H5 | import 环（5 处）| 阶段 2（2026-09-03）已切 **service 级两条反向运行时环**：新建 `AuthorizationExplainerService`（授权解释子域），audit.service / auth.controller 不再依赖 AiService；环 1 compactor、环 3 presets 核实为类型级 import（改 import type / 已 import type，无运行时环）；**剩余 module 级 forwardRef 环**（ai↔auth↔org↔flows）为已知架构权衡，保留 |

### MEDIUM — 质量（阶段 2/后续）

| # | 位置 | 说明 |
|---|------|------|
| M1 | ~~demo-provider dev-only~~ | ❌ **取消**：`ai.module.ts:276-279` 注释明确——是 resolveProvider 链尾**确定性兜底**（无 key 干净环境跑通 AI 黄金流程 + 确定性验证/演示），非生产泄漏，不改 |
| M2 | ~~3 个孤儿导出~~ | **已清理 2026-09-03**（见 §4） |
| M3 | `src/common/demo-data.ts`（832）+ `flow-runtime.service.ts:55` | seed 膨胀 + 历史坏数据兼容注释（后续评估拆分/清理） |
| M4 | 状态/词汇单源化不足：**AI 工具 schema 重抄领域词汇**（真缺口，2026-09-22 已修四处）；分页 DTO 仅 2 模块使用；`@Column default` 写字面量 | 前者已收敛到单源 + 漂移闸；余项随阶段 4 |
| M5 | 前端 i18n 缺口：Flutter `ai_tool_label.dart` 42 处中文映射 + `oauth_service.dart` 13 处错误串 + SDK 桩（fluwx/tobias 未接真实 key） | 方向项：EN 用户可见中文；SDK 桩待真实密钥/真机联调 |

> **M4 复核更正（2026-09-22 实测）**：原表述有两条**方向是错的——照它做会做出坏抽象**，记下免得下一个人重走：
>
> - **「crm/pm 任务状态枚举重复」不是重复。** `CRM_TASK_STATUSES` 与 `PM_TASK_STATUSES` 取值当前相同（都是 `pending/in_progress/completed/cancelled`），但那是**两个限界上下文里的两个概念**。合并成一份共享常量会把 `crm_tasks` 与 `pm_tasks` 绑死：任一方要加值都得动另一方，而它们本来就该能各自演化。**不合并。**
> - **「`riskLevel` 三处独立」是误诊。** 三个 `riskLevel` 是**三个不同概念共用了一个词**：工具风险 `ToolRiskLevel`（R0–R5，**早已单源**于 `ai/interfaces/tool.interface.ts`，ai-governance 直接 import 它）、客户风险（low/medium/high/critical，**也已单源**于 `crm-customer.entity.ts` 的 `RISK_LEVELS`）、审批金额风险（low/medium/high，至今无词汇表）。把它们合成一份，等于把 AI 治理、CRM、审批三个域缝在一起。
> - **真正的缺口是「已有单源没被喂到底」**：AI 工具的 JSON schema 把领域词汇又抄了一遍——而且**同一个文件里抄两遍**（`parameters[]` 一份、`toToolDefinition()` 一份）。2026-09-22 修掉四处（`query_customers` 的 status / riskLevel、`query_projects` 的 status、`query_approval_requests` 的 status），全部改为引用实体常量；并加漂移闸 `src/ai/tools/tool-vocabulary-single-source.spec.ts`（该闸守的是**漂移**：实体加值而工具停在旧字面量即红；它**不**检测「重写一份与今天取值相同的字面量」）。
> - **未动**：`query_events` 与 `create_contract` 同形，但两个域**都还没有词汇表**——那属「先造单源」，不是「喂到底」，需要先决定词汇归属，不在本次范围。
> - **「分页 DTO 仅 2 模块使用」不是缺陷**（`PaginationDto` 只有 events / users 两个 controller 用，其余手写查询参数）——手写的那些**服务层都做了钳制**（`Math.min(limit, 100)`），形状也一致。**但同一主题下另有一处真问题**：分页**响应形状没有单源**，实测三种并存——`{items,total}`（crm / pm / knowledge / approval）· `{items,total,page,limit}`（users / operation-audit / form-builder / tool-effects）· org 另带 `totalPages`；而 wire 契约里**没有分页对象**（48 个对象无一相关），这正是三种形状得以并存的原因。前端 `Paginated<T>` 此前把 `page`/`limit` 声明为**必填**，对多数端点是假的（实际无任何视图读它们，`vue-tsc` 通过）——2026-09-22 改为可选并注明原委。**要不要统一、以哪种为准，是契约决定**（须先把分页形状登记进 `specs/protocol` 并同批改各端点及消费方），故未擅自改动那 5 个端点的响应。


### LOW — 杂物 / 本地堆积

> 注意：以下几乎全部已被 .gitignore 覆盖（`Server-NestJS/uploads/`、`Server-NestJS/data/backups/`、`*.sqlite`、`*.log`、`artifacts/`），**不入库**，属本地磁盘堆积。

| # | 位置 | 状态 |
|---|------|------|
| L1 | 根 `nginx.conf;C` 空目录（Windows 编辑器误产物，未入库） | ✅ 已删 2026-09-03 |
| L2 | 根 `.experience-backend.log` / `.experience-admin-build.log`（155KB） | ✅ 已删 2026-09-03 |
| L3 | `Server-NestJS/data/` 实验 sqlite（ct/ct2/ct3/ct4/consistency，0 引用）+ `data/backups/*.bak`（乱码残留，backup.ts 轮转只认 .backup） | ✅ 已删 2026-09-03 |
| L4 | `Server-NestJS/uploads/` 数百个 <1k stub jpg/webp（测试/演示占位） | ✅ 已清 2026-09-03 |
| L5 | ~~verify-golden-crm.mjs 重复~~ | ❌ **取消**：与 verify-golden-application.sh 非重复——.mjs 是真实 LLM（DeepSeek）对话视角 8/8，.sh 是确定性 CI 9 项，被 ai-trust-manifesto/adversarial-proof/keelbase-dna 多处引用 |
| L7 | scripts 一次性：`sync-issues-to-gitee.mjs` / `check-java-starter-signals.mjs` / demo 视频链（record-demo*/video/*） | 保留（有参考价值，标注一次性；不占仓库维护成本） |

### 已排除（不是屎山）

- **6 个"零消费者"模块**（books/posts/tags/notes/suppliers/contracts）：后端虽仅 Contracts 被 AI 工具引用，但 **Front-Flutter 整块 feature + Web-Admin-Vue views/api 全栈在用**——是教学竖切 = 项目 DNA，**不删**。
- **Web-Admin-React 滞后**（缺 12 模块页）：实验预览版有意保留（架构边界红线），更新/转正由用户单独决定——**方向决策**非清理。
- **Flutter oauth_service SDK 桩**：待真实密钥/真机联调——**方向项**。
- 6 处超大文件外的近临界文件（ai.controller 442 / rag knowledge.service 444 / flow-runtime 431）：观察，不主动拆。

## 3. 分阶段推进方案

### 阶段 1 — 低风险确定清理（本次已完成，见 §4）
安全立竿见影，验证清理流程可行性。**缺点**：只清表面，不动结构。

### 阶段 2 — 结构修复（import 环 H5）【待批准】

> 原标题还写着「demo-provider dev-only M1」。**M1 已于 2026-09-03 取消**（见 §2 MEDIUM 表：那是 `resolveProvider` 链尾的确定性兜底——无 key 的干净环境跑通 AI 黄金流程靠的就是它，非生产泄漏）。本阶段实际只剩 import 环 H5。

- **优点**：消除 Nest 循环 DI 启动隐患（5 个环已精确定位，工作量有限）；均有测试可验证。
- **缺点**：动 Nest 模块图需全量回归；环修复常要改依赖方向/加中间层，改动面比表面大。
- **执行方式**：每环独立子任务 → 聚焦测试绿 → 全量回归 → 单独提交。

### 阶段 3 — god service 拆分（H1/H2/H3）【用户已定「先拆小后拆大」】
- **顺序**：先拆 auth.service（1111）→ audit.service（1022）积累经验 → 再拆 ai.service（2134）→ 最后 crm/admin/org（500+）。
- **优点**：消除最大结构性屎山——可读性/单一职责/测试隔离/并行开发全面提升；ai.service 文件内分段注释已是天然边界。
- **缺点**：大重构回归风险高；需「行为不变」纪律（先抽方法不动逻辑 → 测试绿 → 再挪文件）；工作量大跨多批次；**过度拆分反而制造碎片化新屎山**（拆出的 service 需高内聚低耦合，避免跨类调用爆炸）。
- **纪律**：每一步行为不变，测试作护栏；拆分后四层评审 findings 会更精准。
- **经验（2026-09-03 阶段 2 实测）**：ai.service 的 explain 子域是「独立块可整搬」——直接下沉成功。auth.service 不是这种形态（见下蓝图），需先抽共享层再拆域。

### 阶段 3a — auth.service 拆分蓝图（2026-09-03 实测）

auth.service 1111 行、30 方法横跨 8 子域，但**共享私有 helpers 混合**是拆分的真障碍（与 ai.service explain 的一次性整搬不同）：

共享私有 helper：`delay()`（防时序）、`hashToken()`（SHA-256）、`decryptPhone()`、`signedAvatar()`、`generateAccessToken()`、`generateRefreshToken()`、`_sendVerification()`、user 呈现（脱敏 email/phone 解密/avatar 签名内联于各 token 返回）。

子域分布（方法行号）：
- 认证核心：`register` 111 / `login` 286 / `oAuthLogin` 428（`oAuthService` 已独立注入；MFA 已独立 `MfaService`）
- Token/会话：`refreshToken` 583 / `getSessions` 644 / `revokeSession` 664 / `logout` 737
- 邮箱恢复：`forgotPassword` 186 / `resetPassword` 215 / `verifyEmail` 240 / `resendVerification` 272
- 手机号：`sendSmsCode` 920 / `bindPhone` 945 / `loginPhone` 964
- 生命周期：`deactivateAccount` 1016 / `exportData` 1055
- 设备限流私有区 752-818 / helpers 区 820-914

**拆分路径（地基先行）**：
1. **地基刀：抽 `AuthTokenService`**——迁 `generateAccessToken`/`hashToken`/`generateRefreshToken`/JWT 签发验证 + user 呈现 DTO。auth.service 所有方法改为注入调用（login/register/oauth/reset/refresh 等 ~15 处机械替换）。这一步解开 token/session 域与邮箱/手机号域共享的结。
2. **域刀 A `SessionTokenService`**：refreshToken/getSessions/revokeSession/logout + deviceStore 迁入。
3. **域刀 B `AccountRecoveryService`**：forgot/reset/verify/resend + `_sendVerification`（依赖 mailService + 已共享的 hashToken/delay）。
4. **域刀 C `AccountLifecycleService`**：deactivate/export（8 repo 级联清理，注入面大但逻辑独立）。
5. **域刀 D `PhoneAuthService`**：sendSms/bind/loginPhone。
- login/register/oAuthLogin 留在 auth.service 作认证核心，token 生成走 AuthTokenService。
- 每刀独立提交 + 聚焦 spec + 全量回归；**不可多刀同批**（回归定位难）。

> 附注：audit.service（1022，排序下一）实际比 auth 更接近 ai.service explain 形态（哈希链/log/stats/cost/report/chain 子域较独立、依赖已模块化），届时可更快见效。

### 阶段 3 执行策略（2026-09-03 调整，用户采纳）

god service 拆分**由变更驱动，不做"为了拆而拆"的排期**：

- **优先级调整**：audit.service → ai.service（主战场）→ crm/admin/org；**auth 地基刀不再作为固定优先动作**，改为**触发条件驱动**（auth 是稳定域，近期无扩展，纯偿还收益低）。
- **auth 地基刀触发条件**（任一出现即按 §3a 蓝图执行）：
  1. 下次改 auth 认证流程 / 加新认证方式（顺带按蓝图拆，一次回归验证）
  2. auth.service 膨胀超 ~1300 行，或四层评审在 auth 区域连续出难定位 findings
  3. 启动认证域独立扩展（如多租户会话策略）
- **变更驱动原则**：只在模块即将扩展或已出现真实维护痛点时动手拆分；其余时候维持现状，把精力留给功能与验证。

### 阶段 4 — 架构决策（H4 governance 整合 + M4 常量单源 + M5 i18n 迁移 + React 去留）
单独立项，每个先做影响分析再动代码。

## 4. 执行记录

### 2026-09-03 — 阶段 1 清理（低风险）
- ✅ 删根 `nginx.conf;C` 空目录、`.experience-*.log` ×2
- ✅ 删 `Server-NestJS/data/` 实验 sqlite ×5（ct/ct2/ct3/ct4/consistency，grep 确认 0 引用）+ `data/backups/front.sqlite.mojibake-*.bak`
- ✅ 清空 `Server-NestJS/uploads/` 全部 <1k stub（数百个测试/演示占位，全 <1k 确认非真实上传）
- ✅ 删 3 个孤儿文件：`ai/dto/chat-response.dto.ts`、`users/interfaces/user.interface.ts`、`ai/interfaces/index.ts`（barrel，成员直引保留）——git rm 前 grep 确认 src/test 0 引用 + 无 spec 依赖
- ⏭️ L5 verify-golden 去重**取消**（两脚本非重复，见上）；L6 gitignore 补漏**取消**（已全覆盖）

**验证**：清理后后端 build + 全量单测通过（见提交记录）。

### 2026-09-03 — 阶段 2：授权子域下沉（AuthorizationExplainerService）
- ✅ 新建 `Server-NestJS/src/ai/authorization-explainer.service.ts`：从 AiService 迁入 `explainAuthorization` / `getAuthorizationChain` / `getAuthorizationReasons`（原 `_authorizationReasons`），逻辑逐字不变，只读授权解释。
- ✅ `ToolRegistry` 提为模块级 `useClass` provider（AiService useFactory 注入后仍在原处注册工具，**87 行工具注册零搬迁**）；explainer 共享同一实例查工具风险级。
- ✅ `audit.service:899` 与 `auth.controller:344/350` 从 `AiService` 切到 `AuthorizationExplainerService`——切断两条 service 级反向运行时依赖（环 2/4/5 的 service 部分）。
- ✅ `ai.service.ts` 净减 131 行；热路径 4 处 `_authorizationReasons` 改经 explainer。
- ✅ spec 同步（4 处 new AiService 补参、getAuthorizationChain 测试迁 explainer、audit provider token 换）。
- ⏭️ M1 demo-provider dev-only **取消**（有意的确定性兜底）；环 1/环 3 核实为类型级（无运行时环，环 1 compactor import 改 import type 可选做）。

**验证**：`npm run build` 过 + 全量 **231 suite / 1993 tests 全过**（阶段 1 后无回归）。

## 5. 待办（未做项）

- [x] 阶段 2 残余 · **环 1**（2026-09-21 完成）：`conversation-compactor` 的 `AiServiceConfig` 改 `import type`。它只在类型位置被使用，TS 本就擦除该 import、运行期无此边；标注是为让意图可见，并防将来开启 `verbatimModuleSyntax` 时这条边重新长出来。（`src/ai/conversation/conversation-compactor.ts`）
- [ ] 阶段 2 残余 · **module 级 forwardRef 环**（ai↔auth↔org↔flows）为已知架构权衡——根治需 Explainable Authz 端点归属调整（auth controller 的 explainable 端点迁出 ai 域）+ 共享 provider 梳理，**建议并入阶段 3/4 统一做**
- [ ] 阶段 3：god service 拆分（**变更驱动，策略见 §3「阶段 3 执行策略」**）——优先 audit.service → ai.service（可复用 AuthorizationExplainerService 下沉经验）；auth 地基刀按触发条件执行（见 §3a）
- [ ] 阶段 4：governance/audit 语义整合架构立项；状态/风险词汇常量单源；Flutter i18n 中文映射迁移；React 预览版去留
- [ ] M3：demo-data.ts 832 行 seed 拆分评估

---

## 6. 测试健康（2026-09-14）

全库测试体检：**261 suite / 2412 单元 + 26 suite / 328 e2e 全过**；安全模块分档门控 6/6。本轮 5 提交补齐缺口并把阈值锁档：

| 提交 | 内容 |
|------|------|
| `0e0c0945` | `governance-data-source` 0%→100% spec；覆盖率排除口径补 `!src/**/main.ts`（入口文件） |
| `c71e91b1` | 治理 sidecar 边界用例（88%→98.4%）；阈值 **85/70/80/85 → 86/72/81/86** |
| `e1bbd521` | CRM Customer 360（90.1%→96.5%）、queue 降级分支（84.3%→98.6%）、proactive-ai 边界 |
| `880b5b87` | **app.module DB 选项工厂抽到 `config/typeorm-options.ts`（0%→100%）**（postgres 分支此前零覆盖，且是 2026-09-10 生产迁移事故发源地 → 加回归锁）；flows 错误分支；app.module 回归纯装配并排除 |
| `539b1712` | flows 内建定义一致性校验 + `onModuleInit` 注册；删 `condition.node` 不可达 `default` |

指标：全局 statements/branches/functions `91.2·77.8·87.3` → **`94.2·79.0·88.5`**；关键模块 crm 90→96.5 · queue 84→98.6 · config 60.9→95.7 · flows 86→95 · typeorm-options 0→100。

**两处生产代码改动**（均带回归锁，非纯测试）：`app.module` 抽取 `buildTypeOrmOptions`、`condition.node` 删死分支 + 类型收窄。

**测试侧待办**：
- [ ] **⑨ `ai.service.spec.ts` 拆分**（2026-09-14 记；2026-09-15 **触发条件收紧为三条**）——当前 **2533 行**。**触发 = 三条全满足**：① 该文件工作树干净（✅ 已满足）② **相邻 authz/casl 工作流已提交收口**（`src/authz/`、`builtin-role-rules.ts`、`AddRolesPermissions`/`AddDeptIdToTodosEvents` 迁移、casl/scope/events/todos 改动——该线涉及 AI 工具授权，很可能要改本 spec）③ **不在发版窗口内**（B 段历史改写 + v1.0.10 发版优先）。**仅"文件干净"不够**——大文件重排 + 共享 mock 状态与在途工作冲突的返工成本高。触发后按子域拆（chat / stream / tools / memory / confirmations / approvals），共享 setup 提为 helper。
- [ ] ⑥ 剩余零散分支：`flows/node-registry`、`flow-definition.schema`、若干 entity/dto 的装饰器分支（价值低，可忽略）。

> 每次阶段执行后在此追加记录（比照 release-precheck 执行记录惯例）。


### 2026-09-18 — 阶段 3 第一刀：审计聚合域下沉（AuditStatsService）
- ✅ 新建 `src/ai/audit/audit-stats.service.ts`：从 `AuditService` 迁入 `getStats` / `getAllStats` / `getCostBreakdown`，
  **逻辑逐字不变**（只读聚合，依赖仅 logRepo + `@Optional` cache）。写入路径与哈希链留在原处。
- ✅ **地基先行**：新增 `src/ai/audit/by-day.ts` 的纯函数 `byDayAggregation`——它被**报表域**（`getActionReport`）
  与**统计域**共用，且「什么算 blocked、什么只算 error」的口径就长在里面；复制一份会让两种答案悄悄分叉，故先提为单源。
- ✅ 接线：`audit.controller` 2 处、`admin-ai.service` 1 处改注入新服务（后者原先只把 `AuditService` 用于成本聚合，
  故**替换而非叠加**，不留死依赖）；`AiModule` providers + exports 注册。
- ✅ spec 搬迁**不改断言**：`getCostBreakdown` 与 `getStats/getAllStats` 两段整段迁入 `audit-stats.service.spec.ts`；
  跨服务的契约校验（PC-2 无越界键 ⊆ 冻结契约）留在原 spec 并改用新实例；controller / admin-ai spec 补依赖。
- ⚠️ **两次过程失误（均未进提交）**：① 首次删除被迁走的代码时**误删 `ActionReport` 接口**——编译器当场抓到、已加回；
  ② 防重复插入的守卫断言用子串匹配，被 `ActionReportExport` 命中而拒绝执行，改精确后走通。
- **结果**：`audit.service.ts` **1298 → 1132 行**（-166）；新增 `audit-stats.service.ts`(169) + `by-day.ts`(47)。
- **验证**：全量 **278 suite / 2638 tests 全过**；三闸（semantic-single-source / language / evidence-canonical）全绿。
- **下一刀候选**（按变更驱动原则，不排期）：审计的**查询域**（`getUserLogs`/`getLogs`/`submitFeedback`/`_queryLogs`，纯读、依赖少）
  → **证据/报表域**（`getActionReport*`/`getEvidenceRoot`/`getInterpretation`/`getChain`，依赖 `_payload` 与 `_identityChainFromRow`
  两个共享 helper，需再抽一次地基）。

### 2026-09-18 — 阶段 3 第二刀：审计查询域下沉（AuditQueryService）
- ✅ 新建 `src/ai/audit/audit-query.service.ts`：迁入 `getUserLogs` / `getLogs` / `submitFeedback` / `_queryLogs`
  + `AiAuditLogWithUser` 视图类型（依赖仅 logRepo + `aiActionLabel`）——**逻辑逐字不变**。
- ✅ 接线：`audit.controller` 3 处（列表/本人列表/反馈）改注入新服务；`AiModule` providers + exports。
- ✅ spec 搬迁**不改断言、不改夹具**：7 条查询用例 + `submitFeedback` 段 + `agentId 过滤` 段整段迁入
  `audit-query.service.spec.ts`；跨服务契约校验与 payload 绑定那 2 条留在原 spec。
- ⚠️ **两次过程失误（均未进提交）**：① 提取脚本**静默丢了 7 条被搬用例**——**全量总数正好少 7** 才暴露，
  从 git 取回补上；② 补回的用例因依赖旧文件里的查询构造替身与行夹具而失败，那些片段**逐字取回**而非重写。
- **结果**：`audit.service.ts` **1132 → 994 行**（本轮工作累计 1298 → 994，**-304**）；新增 162 行。
- **验证**：全量 **279 suite / 2638 tests 全过**（与本刀前同数，一条未丢）；三闸全绿。
- **下一刀候选**：**证据/报表域**（`getActionReport*` / `getEvidenceRoot` / `getInterpretation` / `getChain`）——
  依赖 `_payload`（写入侧 canonical 定义）与 `_identityChainFromRow` 两块共享 helper，**需先抽地基**（同第一刀的 byDay 处理）。

### 2026-09-19 — 阶段 3 第三刀：证据/报表域下沉（AuditEvidenceService）
- ✅ 新建 `src/ai/audit/audit-evidence.service.ts`：迁入 `getActionReport` / `getActionReportExport` / `getEvidenceRoot` /
  `getInterpretation` / `getChain` + **`verifyChain` / `_chainSlice`** + `_buildSignature` / `_evidenceRootRestPaths` /
  `_identityChainFromRow` + 三个只服务本域的模块级解析 helper + 五个证据类型。**逻辑逐字不变**。
- ✅ **地基先行**：`_payload`（无 this 的纯函数）提为 `src/ai/audit/payload.ts` 的 `buildPayload`——它被**写入侧（算 hash）**
  与**证据侧（导出）**共用；复制一份不会响亮失败，只会悄悄算出不同 hash、等验链坏掉才暴露。钉住其键集的契约测试一并迁入 `payload.spec.ts`。
- ✅ **`verifyChain` 随读侧迁入**（非留在写入侧）：它被报表调用，本身是读侧校验，写入路径只是失效其缓存；留下会让新服务反向依赖那个更大的类
  （健康清单警告的「跨类调用爆炸」）。**代价是私有字面量变成了跨模块契约** → `audit:verify` 提为 `src/ai/audit/cache-keys.ts` 常量单源。
- ✅ 接线：`audit.controller` 5 处 + `ai.controller` 1 处（证据根）改注入新服务；`AiModule` providers + exports；
  删去 `AuditService` 因本次拆分而**变成死依赖**的 5 个入参（`effectsRepo`/`authorizationExplainer`/`agentService`/`operationAudit`/`governancePolicy`）。
- ✅ **契约键序闸按文件路径解析**导出侧 → 搬迁使其 **fail-loud**（而非静默通过），已更新闸内路径，三处一致校验恢复常绿。
- ⚠️ **另发现并单独修掉**（`31dc942b`）：GA 套件的离线窗口夹具写了硬编码日期，离线窗口是「距今 24h」→ **隔夜必挂**；
  与本次拆分无关，为让回归可信而单列一笔。教训：**窗口类判据的夹具必须相对当前时间构造**。
- **结果**：`audit.service.ts` **994 → 273 行**（本轮工作累计 **1298 → 273，−1025**）；新增三文件（736 + 46 + 10）。
  留在原类的只有**写入链 + 每日配额**。
- **验证**：全量 **280 suite / 2638 tests 全过**（拆分前同数，逐条比对无丢失）；三闸全绿。
- **下一刀候选**（变更驱动、不排期）：`AuditService` 剩余为「写入（`log`/`_lastHash`）+ 每日配额（`reserveDailyUsage`/`releaseDailyUsage`）」——
  后者其实不属于审计，是 AI 每日限额，可独立成 `UsageQuotaService`；届时 `AuditService` 只剩真正的写链职责。

### 2026-09-19 — 阶段 3 第四刀：每日配额下沉（AiDailyUsageService）· **audit 线收官**
- ✅ 新建 `src/ai/audit/ai-daily-usage.service.ts`：迁入 `reserveDailyUsage` / `releaseDailyUsage` / `_todayKey`
  （依赖仅 `usageRepo`，并发语义原样保留：原子条件 UPDATE 而非「读-判-写」）。**`AuditService` 至此只剩写入路径。**
- ✅ 接线：`AiService` 注入新服务（4 处调用）；`AiModule` providers + exports；**该模块的 AiService factory 也需补参数**
  （它是手工 `new AiService(...)`，不在 Nest 自动注入路径上——漏了它只在编译期暴露）。
- ✅ spec：配额 describe（4 例）整段迁入 `ai-daily-usage.service.spec.ts`（断言一字未改）；
  `ai.service.spec` 拆出 `mockUsageQuota` 并更新 **5 处按位置构造**；`failure-path-corpus.spec` 的 3 处构造按新签名修正。
- ⚠️ **如实记下本刀的成本**：`AiService` 构造参数增至 **22 个**，且改动落在一个 **3003 行**的 spec 上。
  为 30 行代码付这个代价，是一笔真实交易——尤其 `AiService` 自己就是下一刀的目标。仍判定值得：
  **一个掌管 AI 限流的审计服务，名不副实**。
- ⏸️ **实体不动**：`AiDailyUsage` 被**独立治理面**与**迁移配置**引用，挪文件会牵出远超本刀的改动；
  服务现置于其实体旁，目录命名的尴尬**如实记录**而非顺手抹平。
- **结果**：`audit.service.ts` **273 → 217 行**——本轮四刀累计 **1298 → 217（−1081）**，且职责单一（写入链）。
- **验证**：全量 **281 suite / 2638 tests 全过**（拆分前同数，**逐文件核对**）；三闸全绿。
- **audit 线阶段 3 收官**：写入 / 聚合统计 / 查询 / 证据报表 / 配额 五域已全部独立。
  按执行策略，后续目标为 **`ai.service`（主战场，2134+ 行）** → `crm`/`admin`/`org`（500+）；仍**变更驱动、不排期**。

### 2026-09-19 — 阶段 3 第五刀：工具门控下沉（ToolGateService）· **主战场第一刀**
- ✅ 新建 `src/ai/tools/tool-gate.service.ts`：迁入「这个工具、这个主体、此刻能不能跑」的判定
  （R5 阻断 / 策略开关 / 角色白名单 / 特性开关 / adminOnly / 邮箱验证）与档位判定
  （是否需确认 / 是否走 R4 / 风险级）。**行为逐字不变**。它是依赖链最下游——执行域与 R4 域都要调它，故先拆。
- ✅ **地基先行**：`externalToolProvider` 由「AiService 私有字段」提为共享持有者 `src/ai/tools/external-tool-registry.ts`
  （运行期由网关注册，为避开模块循环）。**一个类自己用没问题，两个类要用就不可能**。注册入口留在 `AiService`，网关侧接缝不变。
- ⚠️ **该地基带来一个真实语义变化，已如实记录**：提供者从**每实例私有**变为**共享**。生产只有一个 AiService → 行为不变；
  差异只在「新建第二个实例」处显现，正好一个测试命中——它现在传空持有者，而这恰是它本来断言的意思
  （「没有提供者的服务只返回内置工具」）。
- ✅ 顺带清掉死依赖：`featureFlagsService` 全文只有一处使用（在门控里），参数随门控离开 AiService。
- ✅ **漂移门 fail-loud 拦下搬迁**：`governance-binding.spec.ts` 按**源码文件**扫描拒绝词汇，词随门控搬走后它变红；
  扫描面补上新文件即恢复（与契约键序闸同类：**这两道闸都靠"会红"证明自己在工作**）。另：spec 中 5 处按位置构造 + 20 余处依赖戳点按新归属重定向。
- **结果**：`ai.service.ts` **2515 → 2370 行**（−145）；新增两文件（178 + 38）。构造函数参数净 +1（+门控 +持有者 −死依赖）= 23。
- **验证**：全量 **281 suite / 2638 tests 全过**（拆分前同数）；三闸全绿。
- ⚠️ **本刀没有做的事（必须直说）**：`chatImpl` 仍是 **967 行**，文件仍是 2370 行。剩余可抽子域约三分之一，
  **大头就是那一个方法**。走这一步是因为门控是后两刀（执行 / R4）的前置，不是因为它显著缩小了这个类。
- **下一刀候选**：执行域（`_executeWriteTool` / `_executeReadTool` / `_captureDecisionEvidence` / `_executeAgentReadTool` / `isProxyTool`，~186 行，依赖本刀的门控）
  → 再下 R4 审批域（~148 行）→ 呈现/摘要域（~152 行，自足）→ 工具清单+MCP（~201 行）→ **最后才轮到 chatImpl**。

### 2026-09-19 — 阶段 3 第六刀：执行域下沉（ToolExecutionService）· **主战场第二刀**
- ✅ 新建 `src/ai/tools/tool-execution.service.ts`：迁入**读工具**（内置/外部同源）、**写工具**（执行点门控复查 + 幂等
  + 前后快照 + 副作用登记）、**plan/子代理只读执行器**、`isProxyTool` 判型与 `proxyResultId`。**行为逐字不变**。
  与门控的分工写进文件头：门控判「能不能跑 / 要不要确认」，本服务只管「跑」——但写工具执行前仍复查门控，
  因为发起与执行之间有等待窗口（R3 确认 / R4 审批），期间策略可变。
- ✅ **接线后清掉两个真死依赖**：`toolEffectsService` 与 `snapshotCaptor` 在 `AiService` 内**只被 `_executeWriteTool` 使用**，
  随执行域离开后成为死参数，一并删除（同第五刀清 `featureFlagsService` 的口径）。
- ⚠️ **一处偏离上一刀的分组，如实记录**：`_captureDecisionEvidence` 未随执行域搬进服务，而是提为纯模块
  `src/ai/audit/decision-evidence.ts`。理由：它**无 `this`、无依赖**，与 `ai-business-event.ts` 是同一类东西
  （把一次工具调用的结果归一成审计行上的一个字段）；挂在执行服务上会让**审计行构造依赖执行服务**，方向反了。
- ⚠️ **该函数此前没有直接测试**（`analyze_*` 只在 e2e 里被直接实例化过工具，没穿过本函数）→ 补 `decision-evidence.spec.ts`
  三条护栏。**这不是纯搬迁，是新增测试**，必须写明；拆分纪律要求「行为不变有测试守」，无守护的搬迁等于没搬。
- ✅ **漂移门再次 fail-loud**：`agent_read_only` 随只读执行器搬走后 `governance-binding.spec.ts` 变红，扫描面补上新文件即恢复
  （与第五刀同一道闸、同一种"靠会红证明自己在工作"）。
- ✅ spec 搬迁**不改断言**：6 条写工具用例（幂等 / resultType 推导 / FP-8 空体锚 / 无 effects 直执行 / 外部 MCP）
  + 3 条 NC-3 只读门控用例整段迁入 `tool-execution.service.spec.ts`（只改调用形：`(aiService as any)._executeWriteTool` →
  `toolExecution.executeWrite`）。`ai.service.spec` 保留穿 `chat()` 的用例，5 处按位置构造补参、4 处私有戳点重定向到新服务。
  e2e 四处调用点（failure-path / golden-application / proxy-bridge ×2）改取 `app.get(ToolExecutionService)`。
- **结果**：`ai.service.ts` **2370 → 2175 行**（−195）；新增两文件（217 + 23）。构造注入净 −1
  （+执行服务 −2 死依赖），参数个数 **22 → 21**（同一口径实测 HEAD 与现在）。
- **验证**：全量单测 **283 suite / 2644 tests 全过**（基线 281 suite / 2619 + 未计数的 scenarios-pack 22 = 2641，
  本刀 +3 条决策证据护栏 = 2644，**逐项对得上、无用例丢失**）；e2e **34/35 suite、346 用例过**；三闸 + `protocol:vectors:check` 全绿；
  `test:cov` 通过（全局 93.73/78.39/88.33/94.53，安全分档门控过；新文件 execution 85.29/64.7/75/84.84、
  decision-evidence 100/88.88/100/100）。
- ⚠️ **连带发现，本刀未修（不属本刀，且该线有并发会话在作业）**：`test/governance-plane.e2e-spec.ts` **红**——
  `GovernanceModule` 把自己的 `AuditController` 装在模块里，却未提供 audit 三刀拆出的
  `AuditStatsService` / `AuditQueryService` / `AuditEvidenceService`；Nest 在 `compile()` 即抛
  UnknownDependenciesException。**不止测试**：治理台独立进程（`npm run start:governance`）走同一条装配，**启动即会失败**。
  该缺口自第一刀（`8b9379d2`，audit 聚合域下沉）起就存在——`governance.module.ts` 最后修改是 2026-09-06，
  本刀未动 governance 模块与 `audit.controller.ts`，故非本刀引入。**建议单列一笔修**（补三个 provider + 各自 repo 依赖）。
- **下一刀候选**（变更驱动、不排期）：**R4 双人审批域**（`createR4ApprovalRequest` / `listPendingApprovals` /
  `listDecidedApprovals` / `withUserNames` / `decideApproval` / `executeApprovedTool` / `describeConfirmation` / `_parseRunItems`，~148 行）
  → 呈现/摘要域（~152 行，自足）→ 工具清单+MCP（~201 行）→ **最后才是 `chatImpl`（仍是最大的一块）**。

### 2026-09-20 — 阶段 3 第七刀：R4 双人审批域下沉（R4ApprovalService）· **主战场第三刀**
- ✅ 新建 `src/ai/approvals/r4-approval.service.ts`：迁入 `createR4ApprovalRequest` / `listPendingApprovals` /
  `listDecidedApprovals` / `withUserNames` / `decideApproval` / `executeApprovedTool`。**行为逐字不变**。
  裁决后的执行仍走上一刀的写管道（`ToolExecutionService.executeWrite`）——门控复查 + 幂等 + 副作用登记 + 审计一行未改；
  R3 的离线裁决（Action Center）走的也是这个方法，同一管道。
- ⚠️ **一处偏离上一刀的分组，如实记录**：`describeConfirmation` 与 `_parseRunItems` **没有搬进本服务**。
  它们要 `writeToolSummary` / `_writeImpact` / `_revokeClass` 三块**呈现侧**知识（属下一刀「呈现/摘要域」），
  搬走就得把那一刀提前合并进来，或让审批服务反向依赖 `AiService`（正是健康清单警告的「跨类调用爆炸」）。
  故留在原处，等呈现刀一起走。
- ✅ **清掉两个真死依赖**：`approvalsRepo` 与 `usersService` 在 `AiService` 内只被 R4 方法使用，随之下沉。
  repo 改由新服务 `@InjectRepository` 直接拿（同 `MyConfirmationService` 的写法），工厂不再中转
  `getRepositoryToken(AiConfirmationRequest)`；`UsersService` 整个 import 从 `ai.service.ts` 消失。
- ✅ **构建当场抓出一次参数错位**（正是 `974f6dec` 修过的那类）：删掉 `usersService` 参数后，工厂仍在按位置传它，
  `TS2554: Expected 17-20 arguments, but got 21`。修好后另用脚本**逐位复核 useFactory 签名 ↔ inject 数组**
  （28↔28、逐位类型一致）——这类 bug 单测抓不到、只有构建/启动能抓，故不靠人眼。
- ✅ 接线：`AiController` 三个审批端点改注入新服务（新参数**追加在末尾**，不打乱既有位置）；
  `InternalApprovalsController` **整个丢掉 `AiService` 依赖**（它只用 decideApproval）；
  `MyConfirmationService` 改为**双依赖**（`describeConfirmation` 仍在 AiService，`executeApprovedTool` 走新服务）——
  **这是本刀的成本，如实记下**：拆开了一对本来同源的消费点。
- ✅ spec 搬迁**不改断言**：5 条 R4 用例（审批箱排除 run 聚合行 / 冻结契约键集 ⊆ / 拒绝 self-approve /
  run 行不可经审批入口裁决 / 执行前门控 kill-switch）整段迁入 `r4-approval.service.spec.ts`，
  门控与执行用真实实例（该用例正是穿过它们才成立）。
- ⚠️ **新增两条护栏（非搬迁，必须写明）**：`createR4ApprovalRequest`（落 pending R4 行 + 返回 token）与
  「未注入 repo 时三条降级路径」此前**无直接覆盖**，搬迁时补上。
- ⚠️ **顺带发现、本刀未修**：`ai.service.spec.ts` 有 **5 处 `(aiService as any).usersService` 戳点**——上一刀把
  email 校验/adminOnly 挪进门控时漏改的**死戳点**（门控读自己的 `usersService`），本刀删除 `AiService.usersService`
  后它们指向一个不存在的字段。其中「email 未验证」那条用例的断言其实**空转**（非流式对话本就不执行写工具）。
  HEAD 已如此，非本刀引入；**建议后续单列一笔**（改指 `mockToolGate`）。
- **结果**：`ai.service.ts` **2175 → 2030 行**（−145）；新增 `r4-approval.service.ts`（183 行）。构造注入净 −1
  （+审批服务 −2 死依赖），参数个数 **21 → 20**（同一口径实测）。
- **验证**：全量单测 **284 suite / 2646 tests 全过**（2644 + 2 条新增护栏，搬迁用例守恒、逐项对得上）；
  **e2e 35/35 suite、369 用例全过**（含 `governance-plane`——另一会话已按上一刀报告补齐治理模块 provider，本刀随之转绿）；
  三闸 + `protocol:vectors:check` 全绿；`test:cov` 通过（全局 **94.8/78.59/90.05/95.63**，安全分档门控 6/6；
  新文件 r4-approval 91.54/68.51/100/90.16）。验证过程中并发会话又追加了一套件/2 用例（285/2648），与本刀无关。
- ⚠️ **验证期间的一段插曲，如实记录**：全量 e2e 连续两次在跑到第 9 个套件时**进程硬崩（exit 127，无 jest 失败输出）**。
  先用分批跑覆盖全部 35 套件定位（9+9+9+8 全绿），再复查发现根因是**并发会话正在改写 `ai.module.ts`**——
  崩在其中的一瞬，文件里 `FeatureFlagsService` 只在 inject 里存在而 import 已被删（ReferenceError 直接打死进程）。
  其写入稳定后重跑**全量 35/35 全过**。教训：**并发改写模块文件会让全量 e2e 出现"无输出硬崩"这种假红**，
  判红前先看该文件 mtime 是否在跑动中变化。
- **下一刀候选**（变更驱动、不排期）：**呈现/摘要域**（`writeToolSummary` / `summarizeWriteTool` / `summarizeReadTool` /
  `summarizeToolResult` / `truncateToolResult` + `describeConfirmation` / `_parseRunItems` / `_writeImpact` / `_revokeClass`，~152 行，自足）
  → 工具清单+MCP（~201 行）→ **最后才是 `chatImpl`（仍是最大的一块）**。

### 2026-09-20 — 阶段 3 第八刀：呈现/摘要域下沉（ToolPresentationService）· **主战场第四刀**
- ✅ 新建 `src/ai/tools/tool-presentation.service.ts`：迁入 `writeToolSummary` / `summarizeWriteTool` /
  `summarizeReadTool` / `summarizeToolResult` / `truncateToolResult`（含 HS-5 两个上限常量）+
  上一刀刻意留下的 `describeConfirmation` / `parseRunItems` / `writeImpact` / `revokeClass`。**行为逐字不变**。
  本域只把既有事实（工具名 / 参数 / 结果）翻译成人读文案或受限文本，**不含任何执行或策略判定**。
- ✅ **上一刀记下的成本在本刀还清**：`MyConfirmationService` 的「双依赖」回到单域——它现在只注入
  行 repo、ConfirmationStore、`ToolPresentationService`（呈现）与 `R4ApprovalService`（执行），
  **`AiService` 依赖整个消失**。
- ⚠️ **一处需要说清的方向**：`writeImpact` 要知道目标工具是不是 B 路径代理写，故本域**读** `ToolExecutionService.isProxyTool`
  （呈现 → 执行，单向）。没有反向依赖，也不再复制一份判型（复制会让两处口径悄悄分叉）。
- ✅ 清掉随搬迁变死的 5 个 import（`deriveWriteImpact` / `ConfirmationImpact` / `RevokeClass` / `RunItem` /
  `AiConfirmationRequest`）——编译器逐个点名，未凭印象删。
- ✅ 三处只提旧名的注释同步改指新归属（`sub-agent-orchestrator` 与 `tool.interface` 里的
  `AiService.truncateToolResult`、`r4-approval.service` 头部对 `_writeImpact`/`_revokeClass` 的引用）。
- ✅ spec 搬迁**不改断言**：3 条摘要分支（读/结果/写）+ 3 条 HS-5 截断 + 1 条撤销档容错整段迁入
  `tool-presentation.service.spec.ts`；`ai.service.spec` 5 处按位置构造补参。
- ⚠️ **新增 4 条护栏（非搬迁，必须写明）**：`describeConfirmation` 三种展示模式（immediate / approval / run）
  + 坏 JSON 降级此前**无直接覆盖**，搬迁时补上。过程中我自己写错一条断言（`title` 落空是空串不是 `?`），
  **是测试错不是代码错**——按实现修正断言，未改代码。
- **结果**：`ai.service.ts` **2030 → 1788 行**（−242，本轮四刀累计 2370 → 1788）；新增
  `tool-presentation.service.ts`（271 行）+ spec（154 行）。构造注入 +1（呈现服务），参数个数 **20 → 21**。
- **验证**：全量单测 **286 suite / 2652 tests 全过**（2648 + 4 条新增护栏，7 条搬迁用例守恒、逐项对得上）；
  **e2e 35/35 suite、369 用例全过**；三闸 + `protocol:vectors:check` 全绿；`test:cov` 通过
  （全局 **94.89/78.85/90.17/95.73**，安全分档门控 6/6，ai-tools 92.2%）。
- ⚠️ **新文件行覆盖 76.4%，如实解释**：不是丢了覆盖——是**同一批行从 2000 行的 `AiService` 里集中到一个 271 行的文件**，
  分母骤减后那些本来就未走到的 `switch` 分支（`create_contract` / `query_suppliers` 等）变得显眼。
  搬迁前它们同样未覆盖，只是被大文件稀释。全局与分档门控均通过；如要提升，应作为**独立一笔**补分支用例，不在本刀。
- **下一刀候选**（变更驱动、不排期）：**工具清单+MCP 出口**（`listMcpTools` / `executeToolForExternal` /
  `getToolFingerprint` / `getToolInventory` / `getProxyIntegrationStatus` / `_buildToolDefs`，~201 行）
  → **最后才是 `chatImpl`（仍是最大的一块）**。

### 2026-09-21 — 阶段 3 第九刀：工具对外面下沉（ToolExposureService）· **主战场第五刀**
- ✅ 新建 `src/ai/tools/tool-exposure.service.ts`：迁入目录面（`getToolInventory` / `getToolFingerprint` /
  `listMcpTools` / `buildToolDefs`）、出口面（`executeToolForExternal` / `getProxyIntegrationStatus`）与接缝
  （`registerExternalToolProvider`）。**行为逐字不变**。它们的共同点是**都在服务外部世界**（管理台、MCP 客户端、
  公开 provenance 端点），与「对话内部怎么跑」是两回事。
- ⚠️ **一处超出上一刀候选清单的动作，写明理由**：`registerExternalToolProvider` 也一并搬走（候选清单里没有它）。
  它是 `ExternalToolRegistry` 在 `AiService` 里的**最后一处用途**——留下就等于留一个纯转发方法，而注册的语义
  本就属于「对外面」。搬走后 `AiService` 不再依赖 `ExternalToolRegistry`，mcp 网关的注册目标随之改为本服务
  （网关侧只有一处调用 + 一处 spec 断言，接缝仍然单一）。
- ✅ **消费方按依赖裁剪**：`mcp.controller` 与 `app-provenance.controller` 只用了本域方法，**整个丢掉 `AiService` 依赖**；
  `ai.controller` / `admin-ai.service` / `trust-sandbox` 另有对话职责，改为**双依赖**（如实记下这一刀的成本）。
- ✅ 清掉随搬迁变死的 5 个 import（`ToolDefinition` / `resolveRevokeClass` / `effectiveGateMode` /
  `ExternalToolProvider` / `ExternalToolDef`）——编译器逐个点名；`AiService` 构造注入净 0（+对外面 −持有者），
  参数个数仍 **21**。
- ✅ spec 搬迁**不改断言**：MCP 出口方法（listMcpTools 3 + executeToolForExternal 7）、工具清单/集成诊断 6 条、
  `buildToolDefs` 2 条，以及散落在治理/摘要两个 describe 里的 2 条（治理策略覆盖开关、MCP 清单禁用跳过）
  共 **20 条**整段迁入 `tool-exposure.service.spec.ts`。消费者 spec（mcp.controller / app-provenance /
  admin-ai / trust-sandbox / mcp-gateway）与 3 个 e2e 套件按新归属改注入点。
- ⚠️ **新增 1 条护栏（非搬迁，必须写明）**：`getToolFingerprint` 此前**无直接覆盖**（`/app/provenance` 公开端点的
  唯一数据来源），搬迁时补上。
- ⚠️ **搬迁途中出过两次过程失误（均未进提交）**：① 用 node 脚本跨 shell 写临时文件时路径解析不同（node 把 `/tmp`
  当 `D:\tmp`），切块一度丢失——**从 HEAD 取回原文**而非凭记忆重写；② 漏改一个多行调用里的裸 `aiService`。
  两次都是编译器/测试当场抓到。
- **结果**：`ai.service.ts` **1788 → 1593 行**（−195，本轮五刀累计 2370 → 1593）；新增
  `tool-exposure.service.ts`（228 行）+ spec。构造注入净 0（+对外面 −持有者），参数个数 **21 → 21**。
- **验证**：全量单测 **287 suite / 2653 tests 全过**（上一刀为 286/2652：+1 套件 = 新 spec，+1 用例 = 新增护栏，
  20 条搬迁用例守恒、逐项对得上）；
  三闸 + `protocol:vectors:check` 全绿；`test:cov` 通过（全局 **94.96/78.87/90.22/95.8**，安全分档门控 6/6；
  新文件 93.33/80.35/91.66/95.58）。
- ⚠️ **e2e 这次没能给出"全量一次过"的结论，如实记录**：36 个套件**全部通过**（分批 9+9+9+9 与逐个单跑均绿），
  但**单进程长跑会在跑到第 3～8 个套件之间硬崩（exit 127，无 jest 汇总）**，且这次**可复现**。
  为排除本刀嫌疑做了两步：① 一整批**剔除所有本刀改过的套件**仍崩；② 逐对/逐套单跑全过。
  故判定为**既有的 e2e 长跑脆弱性**（内存充足 16.6G、无并发测试进程），与本次拆分无关；
  **建议单列一笔**（可在 CI 侧分片跑 + `--detectOpenHandles`/`--logHeapUsage` 定位）。
- **下一刀候选**（变更驱动、不排期）：**`chatImpl`**（仍是最大的一块，~900 行）——它下面已无独立子域，
  要么按「循环内阶段」再分，要么承认它是本类的核心而停手；这一步值得先想清楚再动。

### 2026-09-21 — 阶段 3 第十刀：Provider 路由与回退下沉（ProviderRoutingService）
- ✅ **上一刀记的「先想清楚再动」落实为一次核账**：所谓 `chatImpl ~900 行` 是旧数——实测 `chatImpl` 只有
  ~318 行，真正的大块是 `chatStreamImpl`（614 行），且它的内部是**确认流 / run 聚合 / 审计行 / SSE yield 交织**，
  没有干净接缝。于是改从**独立块**下手：`FALLBACK_CHAIN` + `resolveProvider` + `tryFallback` +
  `streamWithProviderFallback` ≈ 117 行，只依赖 provider 工厂与默认 provider 名。
- ✅ 新建 `src/ai/providers/provider-routing.service.ts`：选路（请求指定 > 默认）、回退链、非流式回退、流式回退
  （CR-28 首块错误才回退、已产出内容则透传）。**行为逐字不变**。它与 `RouterAgent` 的分工写进文件头：
  那个是**意图**路由，本域是**供应商**路由。
- ✅ **顺手去掉一处死字段**：`resolveProvider` 返回的 `conversation: null` 无人读（调用点解构了却从不使用，
  也是既有 lint warning 的来源），本域只返回 `{ providerName, provider }`；调用点同步去掉该解构。
- ✅ **依赖净 0 的换位**：`AiService` 首个协作者由 `LlmProviderFactory` 换成 `ProviderRoutingService`
  （工厂里唯一残留的 `getProvider`（回退成功后取实际生效的 provider）也改走本域 `provider(name)`），
  构造参数仍 **21**；`AiService` 不再直接持有 provider 工厂。
- ⚠️ **组装方式的如实说明**：本域要读「默认 provider 名」，而该配置对象在 `useFactory` 里现造，
  故与 `ConversationCompactor` 同法**在组装期手动构造**（不是 Nest provider）——有先例，非新发明。
- ✅ spec 搬迁**不改断言**：流式回退 2 条 + 选路 5 条共 **7 条**整段迁入 `provider-routing.service.spec.ts`，
  仅调用形改为本服务（`resolveProvider({message})` 的形参也只留它真正读的 provider 名）。
- ⚠️ **搬迁途中一次过程失误（未进提交）**：切块脚本的结束锚点把**相邻 describe 的闭合括号一并切掉**，
  两个 spec 都出现括号失衡；用括号计数当场定位并补齐，未靠肉眼。
- **结果**：`ai.service.ts` **1593 → 1476 行**（−117，本轮六刀累计 **2370 → 1476**）；新增
  `provider-routing.service.ts`（157 行）+ spec（123 行）。构造注入净 0（+路由 −工厂），参数个数 **21 → 21**。
- **验证**：全量单测 **288 suite / 2653 tests 全过**（+1 套件 = 新 spec，7 条搬迁用例守恒、逐项对得上）；
  e2e **36 套件 / 372 用例分四批全过**（本次连上一刀崩过的批量 3 也通过——进一步印证那是环境性抖动，非代码）；
  三闸 + `protocol:vectors:check` 全绿；`test:cov` 通过（全局 **94.96/78.9/90.19/95.79**，安全分档门控 6/6；
  新文件 94.11/70/83.33/95.91）。
- **下一刀候选**（变更驱动、不排期）：**`chatStreamImpl`（614 行）**——真要在它身上动，得先**画清内部阶段**
  （内容安全 → 会话装载 → 首轮流 → run 预扫描/聚合 → 逐条确认/审批/执行 → 审计落行 → 收尾），
  且要接受「一次只搬一个阶段、每搬一次全量回归」的节奏；**或就此停手**：本类的核心编排已清晰可读，
  继续拆会把「一次对话」切成需要来回跳转的多段。

### 2026-09-21 — 阶段 3 第十一刀：流式归并下沉（StreamAccumulator）
- ✅ **先画图再动手**：按上一刀说的，把 `chatStreamImpl` 的内部阶段画了出来（入口准备 61 行 / 轮次循环 513 行 /
  超轮次收尾 30 行；循环内 B1 取流 · B2 归并 · B3 流错收尾 · B4 纯文本收尾 · B5 消息回填 · **B6 run 预扫描 121 行** ·
  **B7 逐条执行 280 行** · B8 轮末）。结论：**中间的 500 行是确认协议的运行时表示，没有干净接缝**——
  搬走任何一段都得把 `yield` 通道一起搬，那是重新设计。真正可搬的只有两处纯块。
- ✅ 本刀只做第一处：新建 `src/ai/providers/stream-accumulator.ts`，把 **B2 chunk 归并**提成纯对象
  （文本累积+转发 / 推理只累积 / tool_call 按 index 拼装 / error 记下+转发 / done 取 usage）。
  **归并规则逐字不变**——包括「后到的 id/name **覆盖**前值」「缺 index 视作 0」这两条容易被误读的语义。
- ✅ **六个可变局部随之消失**（`fullText` / `reasoningText` / `hasToolCalls` / `accumulatedToolCalls` /
  `streamError` / 逐 chunk 的 usage 累加），循环体从 35 行缩到 5 行：`const forward = acc.apply(chunk); if (forward) yield forward;`
  ——**转发语义显式化**（只有文本与错误往外发），主方法的「边转发边累积」不再靠读者自己从 if 链里推。
- ✅ 无 DI 改动：本类由循环内 `new` 出（每轮一个实例），不进模块 providers——**本刀只碰 1 个文件 + 2 个新文件**。
- ⚠️ **新增 8 条护栏（非搬迁，必须写明）**：这段归并此前**没有直接覆盖**（只有穿大方法的集成级断言），
  故新 spec 逐条钉住归并规则。**新文件行/语句/分支/函数覆盖 100%**——与第八刀那个 76% 的新文件形成对照：
  差别在于这次是**纯逻辑**且规则被逐条写成了断言。
- ⚠️ **一次过程失误（未进提交）**：写脚本做批量改名时，`private usage` 字段与 `get usage()` 取值器同名 →
  编译器报重复标识符；另有一处 B6 循环里残留的 `idx`（改成 `for (const tc of acc.toolCalls())` 后不再存在）。
  两处都是构建当场抓到的。我自己的测试断言也写错过一条（把「后到的 name 会覆盖」误写成「会被忽略」）——
  **改的是测试不是代码**，并把该语义在用例标题里挑明。
- **结果**：`ai.service.ts` **1476 → 1448 行**；`chatStreamImpl` **610 → 589 行**（−21）。新增
  `stream-accumulator.ts`（106 行）+ spec（86 行）。
- **验证**：全量单测 **289 suite / 2661 tests 全过**（+1 套件、+8 条新增护栏）；
  e2e **36 套件 / 372 用例**——首次跑批次 1/2 硬崩（exit 127，**这次崩的是与上次不同的批次**），重试全过，
  再次印证该硬崩与代码无关而是环境抖动；三闸 + `protocol:vectors:check` 全绿；
  `test:cov` 通过（全局 **94.97/78.92/90.22/95.81**，安全分档门控 6/6）。
- **下一刀候选**（变更驱动、不排期）：同一张图的**第二处纯块**——B7e/f 的**审计行组装**（83 行，成功与拒绝
  两条分支各写一遍十几字段的 `log({...})`，字段集必须一致，正是会悄悄分叉的地方）。**B6/B7 的协议主体不动。**

### 2026-09-21 — 阶段 3 第十二刀：tool_call 审计行组装下沉（buildToolCallAudit）· **ai.service 收官**
- ✅ 新建 `src/ai/audit/tool-call-audit.ts`：`buildToolCallAudit(input)` 产出 `AuditEntry`，
  接管四处 `tool_call` 审计行的字段集（流式成功 / 流式 deny / 非流式成功 / 非流式 deny）。**产出逐字不变**。
- ✅ **本刀的正当性有实物证据，不是"看着重复"**：四处字面量里躺着
  「CR-2：流式工具执行审计（**对齐非流式 runToolLoop**）」「**T5 跨入口一致**：流式 deny 也标 source=bridge
  （对齐非流式 deny 与两路成功分支）」——**这些注释本身就是"漂移过一次、被人手工对回来"留下的疤**。
  审计行字段集是对外契约（管理台时间线、A-8 denied 视图、blocked 聚合都按列读），一处漏列 = 同一动作
  在不同入口呈现不同事实。故本刀**四处一起收**（只收流式两处会留下跨入口那半边风险）。
- ✅ **四处差异被显式参数化**（不再靠人记）：`pendingApproval`（R4 待批不算失败，**只有流式有**）、
  `result` vs `errorMessage`（执行过 vs 未执行）、`authorization`（放行快照 vs deny reasons）、`bridge`。
  两条规则写进模块头：**未执行恒 isError**；**businessEvent / evidence 只在真正执行过时派生**。
- ✅ **无 DI 改动**：纯函数，不进 providers——本刀只碰 1 个文件 + 2 个新文件（同上一刀）。
- ⚠️ **省下的行数有限（−13），价值不在行数**：在于字段集**只写一次**、四处差异**有名字**。
  如实地把这一点写在这里，避免后来者以为这一刀是为了缩短文件而做。
- ⚠️ **新增 5 条护栏（非搬迁）**：四处内联字面量此前**无直接覆盖**。其中两条钉的是**有值键集**
  （成功行 vs deny 行各自的确切键列表）——这正是本模块存在要保护的东西：谁再给某一路加字段而漏另一路，
  测试当场变红。新文件行/语句/分支/函数覆盖 **100%**。
- ✅ **行为等价由既有断言背书**：`ai.service.spec` 里已有 6 处对 `tool_call` 行的断言
  （deny 行 `isError===true` + `authorization` 为 reasons JSON + `source==='bridge'`、成功行 usage/detail），
  全量跑绿即证四处产出未变——**不需要新写集成断言**。
- **结果**：`ai.service.ts` **1448 → 1435 行**；`chatStreamImpl` 589 → 580 行。新增
  `tool-call-audit.ts`（61 行）+ spec（89 行）。**阶段 3「主战场」至此收官**：六域 + 两个纯块全部出列，
  累计 **2370 → 1435 行（−40%）**，剩下的 `chatStreamImpl` 主体是确认协议的运行时形状，**按图不再动**。
- **验证**：全量单测 **290 suite / 2666 tests 全过**（+1 套件、+5 条新增护栏）；
  e2e **36 套件 / 372 用例四批一次全过**（本次未复现硬崩）；三闸 + `protocol:vectors:check` 全绿；
  `test:cov` 通过（全局 **94.97/78.95/90.23/95.81**，安全分档门控 6/6）。
- **后续（变更驱动、不排期）**：`ai.service` 主战场收官后，阶段 3 余项为 **H3 中型 god service**
  （`crm.service` 571 / `admin.service` 598 / `org.service` 568）与**触发条件驱动**的 auth 地基刀；
  另有阶段 4（governance 语义整合等）与两条已记录的待办（`usersService` 死戳点、e2e 长跑硬崩）。
- ✅ **收官后补跑 `./scripts/release-gate.sh`：PASS，24 pass / 0 fail**（确定性模式）——含 Gate1 黄金闭环、
  三旗舰 + 生成模块 + 跨入口 T5 + KB-4 失败路径 + 撤销验收 + 信任行为矩阵 + 治理台 HTTP + **审计链并发压测**、
  CE-1 协议语料/wire/术语/证据 canonical/场景包、Private 数据不出域 + 迁移一致性。
  **为什么这一条必须写进来**：内存里刚固化的教训④——`scripts/` 既不在构建 tsconfig 里、也不是测试，
  **搬走方法/改构造签名会让 CLI 脚本静默烂掉**（实证：审计链压测因 09-18 的拆分空转两天，到 09-20 门禁变红才暴露）。
  本次十二刀后补跑，**24 项逐项真跑全过**，说明这条线上没有重复那个错误；后续每刀收口都应带上这一步。

### 2026-09-21 — 阶段 3 第十三刀：AI CRM 分析域下沉（CrmAnalyticsService）· **H3 第一刀**
- ✅ **先定域再动刀**：`crm.service` 591 行里，真正可切的是**派生读**——风险打分（`analyze_customer_risk`
  工具核心）、长期未跟进检测（AI Follow-up Agent）、业务全景看板（AI Intelligence Dashboard）、
  跨客户管道读取（AI Sales Agent）。它们**只读不写**，与「客户/订单/跟进/任务/风险 的增删改查」是两件事。
  其余六个子资源 CRUD **刻意不动**：`getCustomerDetail` / `getCustomer360Data` 要横跨全部六个仓库，
  按实体拆成六个服务会让这两个聚合方法依赖六个服务——正是健康清单警告的「跨类调用爆炸」。
- ✅ 新建 `src/crm/crm-analytics.service.ts`（`analyzeRisk` / `detectIdleCustomers` / `getDashboard` /
  `listAllOpportunities` + `RiskAnalysis` 类型）。**行为逐字不变**。
- ✅ **地基先行，且它是安全谓词**：新建 `src/crm/customer-ownership.ts` 的 `assertCustomerOwner(repo, id, userId)`——
  查询同时限定 `id` 与 `userId`、查不到即 404（**不区分「不存在」与「不属于你」**，避免枚举他人客户）。
  CRUD 侧 16 处 + 分析侧 1 处**共用同一个实现**；若各留一份，两条路径的判据会悄悄分叉。
- ✅ 接线：`CrmModule` 注册并导出；`CrmController` 改双依赖（CRUD 走 `CrmService`、分析/看板走本服务）；
  `AiModule` 注入并把三个工具（管道分析 / 风险分析 / 闲置检测）的构造指向本服务——`SummarizeCustomerTool`
  仍走 `CrmService.getCustomer360Data`（聚合读，未搬）。
- ⚠️ **一个真实偏差被 e2e 抓出（本刀自曝，已修）**：`test/golden-application.e2e-spec.ts` 里
  `new AnalyzeCustomerRiskTool(crmService)` 直接把 `CrmService` 实例交给工具——工具的参数类型是**结构化接口**
  （`CrmServiceLike`），而 `test/` **不在构建 tsconfig 里**，所以「少了 analyzeRisk」编译期看不见，只有跑起来才炸。
  这正是上一刀记下的教训的**第二个面**：不只是 `scripts/`，**`test/` 同样不被编译覆盖**。
  修法：e2e 改注入 `app.get(CrmAnalyticsService)`。**教训：改一处被工具消费的方法归属，要连"谁把服务交给工具"一起找。**
- ⚠️ **另两次过程失误（均未进提交）**：① 切块脚本**重复使用过期偏移量**（先删 risk 接口后偏移已变），
  把 `crm.service.ts` 截断成半截方法——改用「锚点全部先解析、**从后往前删**」后一次成型；
  ② 同一脚本的结束锚点把 `detectIdleCustomers` 之后**六条顶层裸 `it`（CRUD 用例）一并吞进分析域**——
  还原文件、按正确边界重做（该 spec 的 CRUD 用例是**直接挂在顶层 describe 下**的裸 `it`，不是嵌套 describe，
  awk 用四空格缩进过滤时看不见，故第一次没发现）。**两次都是"看清边界再删"，不是靠重试。**
- **结果**：`crm.service.ts` **591 → 373 行**（−218）；新增 `crm-analytics.service.ts`（251 行）、
  `customer-ownership.ts`（23 行）+ spec（179 行）；`crm.service.spec.ts` 469 → 340 行（8 条用例守恒搬迁）。
  `CrmService` 构造依赖不变（7 仓 + org）。
- **验证**：全量单测 **291 suite / 2666 tests 全过**（+1 套件 = 新 spec，8 条用例守恒）；
  e2e **36 套件 / 372 用例四批全过**（**首跑批次 3 挂 1 条 = 上述真实偏差，修后复跑全绿**——这正是 e2e 该干的事）；
  三闸 + `protocol:vectors:check` 全绿；`test:cov` 通过（全局 **94.98/78.93/90.23/95.81**，安全分档门控 6/6；
  `crm.service.ts` 语句/行覆盖 **100%**、`customer-ownership.ts` **100%**、新分析服务 90.38/74.71/95.23/89.47）；
  **`./scripts/release-gate.sh` PASS 24 / 0**（黄金闭环经新服务真跑）。
- **下一刀候选**（变更驱动、不排期）：H3 余下两处 —— `admin.service`（598）/ `org.service`（568）；
  以及两条已记待办（`usersService` 死戳点、e2e 长跑环境性硬崩）。

### 2026-09-21 — 阶段 3 第十四刀：平台观测域下沉（AdminObservabilityService）· **H3 第二刀**
- ✅ **接缝由既有 spec 指路**：`admin.service` 早已有按子域切开的四个 spec（analytics / monitor / ops / trash）——
  测试的组织方式本身就说明了域边界。本刀取 **monitor + ops**：两者同答一个业务问题
  「**这套系统现在怎么样**」（健康 / 依赖 / 计数 / 指标 + 近 24h 错误 → 派生告警 + 审计日趋势），
  五个私有 helper（`_readMetrics` / `_checkRedis` / `_recentErrors` / `_deriveAlerts` / `_getAuditTrend`）
  只服务它们自己，**无一处外泄**。
- ✅ 新建 `src/admin/admin-observability.service.ts`。**行为逐字不变**。
- ✅ **一处刻意留下并写明**：`_getStorageUsage` **留在 `AdminService`**——它只被平台总览（`getOverview`）用，
  与本域无交集。搬过去就得让总览反向依赖观测服务，为一个私有探针不值。（`_getCountsByDay` 同理留下。）
- ✅ 接线：`AdminModule` 注册并导出；`AdminController` 改双依赖（两个端点）；`AdminAiService` 也用了
  `getMonitorSummary`（系统 AI 助手的平台实时上下文）→ 一并改依赖。**这次是构建抓到的**（`src/` 内，
  不同于上一刀那个 e2e-only 的漏网）。
- ⚠️ **spec 搬迁需要一次"夹具合并"的诚实说明**：监控与运维两个 spec 的夹具**在指标值上互相冲突**
  （监控用例断言 0% 错误率、运维用例要 10% 才触发告警）。合并进同一文件后，把**运维用例原本的指标夹具
  写进该用例自身**（90/10），**断言一字未改**——搬的是夹具不是期望。另补 `andWhere`/`groupBy` 到新文件的
  query-builder 替身（原属运维 spec 的替身能力）。
  `admin.service.ops.spec.ts` 5 条用例：4 条入新 spec、`_getStorageUsage` 那条**留给 monitor spec**
  （它测的是留在 `AdminService` 的方法）→ 文件删除。
- **结果**：`admin.service.ts` **643 → 444 行**（−199）；新增 `admin-observability.service.ts`（253 行）+
  spec（194 行）；`admin.service.monitor.spec.ts` 233 → 206（移出 4 条、移入 1 条）；
  **删除** `admin.service.ops.spec.ts`。套件数净 0（删 1 增 1）、用例数守恒（44 条 admin 用例不变）。
- **验证**：全量单测 **291 suite / 2666 tests 全过**；e2e **36 套件 / 372 用例四批一次全过**；
  三闸 + `protocol:vectors:check` 全绿；`test:cov` 通过（全局 **94.99/78.91/90.24/95.83**，安全分档门控 6/6；
  新观测服务 90.32/70.23/80.95/91.96、`admin.service` 函数覆盖 **100%**）；
  **`./scripts/release-gate.sh` PASS 24 / 0**。
- **下一刀候选**（变更驱动、不排期）：**H3 最后一处 `org.service`（626 行）**；
  或转阶段 4（governance 语义整合等）+ 两条已记待办。

### 2026-09-21 — 阶段 3 第十五刀：组织通讯录下沉（OrgDirectoryService）· **H3 收官**
- ✅ 新建 `src/org/org-directory.service.ts`：**成员视角的只读视图**——我的组织与部门路径、部门树、
  同组织成员（脱敏白名单）、组织内审批待办统计（ORG-7 / ORG-5）。四种都**按调用者本人所属组织**限定范围、
  **只读**、不提供任何管理写入，与 `OrgService` 的「组织/部门/成员/邀请增删改查」（管理端）是两件事。
  **行为逐字不变**（含 `_myMember` / `_deptPath` 两个只服务本域的私有 helper）。
- ✅ **地基先行（同 CRM 刀先例）**：`_ensureOrg` 是 **10 处共用**的存在性谓词（CRUD/邀请/通讯录都要过），
  提为 `src/org/org-lookup.ts` 的具名函数 `ensureOrg(repo, id)`——**同一条判据只有一处实现**。
- ⚠️ **一处刻意保留的口径差异**：成员端 `listMyMembers` 走**白名单**（无 email/phone/username），
  管理端 `listMembers` 给 email **掩码**——两者**故意不同**，注释里点明，避免后来者"统一"掉其中一边。
- ✅ 接线：`OrgModule` 注册导出；`OrgController` 改双依赖；**三个 AI 组织工具**（可用性 / 成员目录 / 审批待办）
  改为**双依赖**——它们既取通讯录视图，又用 `getUserOrgId` 做**范围前置检查**，而后者是跨模块广泛使用的
  范围谓词（26 处引用），**不动**。工具的类型接口随之拆成 `OrgScopeLike` + `OrgDirectoryLike`。
- ⚠️ **一次真实缺陷，被既有装配冒烟拦下（本刀自曝，已修）**：我给 AiService 工厂**签名**加了 `orgDirectory`
  却**漏了 inject 数组**（31 签名 ↔ 30 注入）→ 位置整体错位、`toolRegistry.register is not a function`。
  **这正是 `974f6dec` 那个 bug 的同款**，也是「单测不 boot 容器」那条教训的对象——而本仓已有
  `src/app-wiring.spec.ts` 装配冒烟（另一会话所加），**它当场变红**。我随即用逐位对齐脚本复核到 31↔31。
  **教训照旧：改工厂签名，必须同步 inject 并复核逐位对齐。**
- ⚠️ **另三次过程失误（均未进提交）**：① 用脚本做接口拆分时把三个工具文件改坏（泛化了多行返回类型）→
  **回退后手工逐处改**（脚本化的"聪明"手术不如可核对的手改）；② 生成的新 spec 尾部多一个闭合括号、
  且**行尾混合**（CRLF/LF）导致匹配失败 → 归一后按行序删除；③ **PC-3 冻结契约原是一条跨三形用例**
  （`getMyOrg` / `listMembers` / `listMyMembers`），因服务归属必须拆成两半：**①③ 进新 spec、② 留原 spec**，
  断言**各自保留**；② 失去 ① 顺带设的 org 夹具，故补一行它自己的最小夹具（**夹具搬迁，断言未改**）。
- **结果**：`org.service.ts` **627 → 494 行**（−133）；新增 `org-directory.service.ts`（163 行）、
  `org-lookup.ts`（20 行）+ spec（226 行）；`org.service.spec.ts` 729 → 578（7 条纯块搬出 + PC-3 拆分）。
- **验证**：全量单测 **292 suite / 2667 tests 全过**（+1 套件、+1 用例 = PC-3 由 1 条拆为 2 条）；
  e2e **36 套件 / 372 用例**——批次 2 首跑硬崩、重试全过（既有环境抖动）；三闸 + `protocol:vectors:check` 全绿；
  `test:cov` 通过（全局 **95/78.9/90.24/95.83**，安全分档门控 6/6；`org-directory` 行覆盖 **100%**、
  `org-lookup` **100%**、`org.service` 行覆盖 **100%**）；**`./scripts/release-gate.sh` PASS 24 / 0**。
- 🏁 **H3 收官**：`crm` 591→373、`admin` 643→444、`org` 627→494。**阶段 3 全部三个层级已处置完毕**
  （H1 ai.service 六域两纯块、H2 audit 五域、H3 三个中型服务）；余项为**触发条件驱动**的 auth 地基刀、
  两条已记待办，以及阶段 4（governance 语义整合等）。

### 2026-09-22 — 阶段 4 开篇：M4 复核的增量（approval 风险词汇单源 + CRM 风险等级接到单源）
- ✅ **先做影响分析，再动代码**（阶段 4 的既定纪律）。四项逐条核过：
  - **crm/pm 任务状态**：**判为「不该合并」**——见 §2 M4 复核更正（2026-09-22，`5e54211d`）：
    值相同但属两个限界上下文，共享常量会让两者无法各自演进。
  - **riskLevel「三处独立」**：是**三个不同概念**（工具 R0–R5 / 客户 low…critical / 审批 low…high）——不该合并。
  - **分页 DTO**：不是缺陷（手写路径服务层都做了钳制）；真问题在**响应形状无单源**（三种并存）——属**契约决定**，未擅动。
  - **`@Column default` 字面量**：72 处，替换成常量是纯 churn、可读性反而下降（`default: TASK_STATUSES[0]` 不如 `'pending'` 自明）→ **不做**。
- ⚠️ **本刀的自我更正，如实记录**：我起初按旧表述动手**合并了 crm/pm 任务状态**（新建 `common/task-status.ts`）。
  落笔后核对到并发会话已在 `5e54211d` **明确裁定「不合并」**（其理由：限界上下文耦合）——**遂整体回退**
  （两个实体恢复各自常量、删除新文件），改按他们的结论走。**教训：动手前不仅要读文档当前正文，还要查同一主题最近有没有已经落地的裁定。**
- ✅ 增量落在他们点名的**唯一还没有单源的那一个**上：`ApprovalRiskLevel`（`APPROVAL_RISK_LEVELS = ['low','medium','high']`）
  写进 `approval-request.entity.ts`（与既有 `REQUEST_STATUSES` 并列），预审打分的两处赋值随之受类型检查——
  写错等级名会在编译期暴露。**刻意不与 CRM 的 `RISK_LEVELS` 共用**：后者的 `critical` 有无是**语义差异而非遗漏**。
- ✅ 同时补上他们诊断里的那类缺口**在本域的另一处**：「已有单源没被喂到底」——`RiskAnalysis.level` 此前是裸 `string`，
  现改为引用 `crm-customer.entity` 的 `RiskLevel`（单源已是它，只是没喂到结果类型上）。
- **验证**：全量单测 **293 suite / 2671 tests 全过**；e2e **36 套件 / 372 用例四批一次全过**；
  三闸 + `protocol:vectors:check` 全绿；`test:cov` 通过（全局 **95/78.9/90.25/95.83**，安全分档门控 6/6；
  `approval-request.entity` 行覆盖 100%、`approval.service` 行覆盖 100%）；
  **`./scripts/release-gate.sh` PASS 24 / 0**。
- **阶段 4 余项**：H4 governance 语义整合（独立架构立项，牵涉治理台进程，**不在本次范围**）；
  M4 剩余两项**已判为不做或不擅自做**（见上）；M5 Flutter i18n 中文映射（方向项）；
  React 预览版去留（**待用户决定**）；`module forwardRef` 环根治。
