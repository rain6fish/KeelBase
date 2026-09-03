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
| M4 | 状态/词汇单源化不足：crm/pm 任务状态枚举重复、`riskLevel` 词汇 crm/approval/ai-governance 三处独立、分页 DTO 仅 2 模块使用、`@Column default` 写字面量 | 后续收敛到单源（阶段 4 或随手件清理） |
| M5 | 前端 i18n 缺口：Flutter `ai_tool_label.dart` 42 处中文映射 + `oauth_service.dart` 13 处错误串 + SDK 桩（fluwx/tobias 未接真实 key） | 方向项：EN 用户可见中文；SDK 桩待真实密钥/真机联调 |

### LOW — 杂物 / 本地堆积

> 注意：以下几乎全部已被 .gitignore 覆盖（`Server-NestJS/uploads/`、`Server-NestJS/data/backups/`、`*.sqlite`、`*.log`、`artifacts/`），**不入库**，属本地磁盘堆积。

| # | 位置 | 状态 |
|---|------|------|
| L1 | 根 `nginx.conf;C` 空目录（Windows 编辑器误产物，未入库） | ✅ 已删 2026-09-03 |
| L2 | 根 `.experience-backend.log` / `.experience-admin-build.log`（155KB） | ✅ 已删 2026-09-03 |
| L3 | `Server-NestJS/data/` 实验 sqlite（ct/ct2/ct3/ct4/consistency，0 引用）+ `data/backups/*.bak`（乱码残留，backup.ts 轮转只认 .backup） | ✅ 已删 2026-09-03 |
| L4 | `Server-NestJS/uploads/` 数百个 <1k stub jpg/webp（测试/演示占位） | ✅ 已清 2026-09-03 |
| L5 | ~~verify-golden-crm.mjs 重复~~ | ❌ **取消**：与 verify-golden-application.sh 非重复——.mjs 是真实 LLM（DeepSeek）对话视角 8/8，.sh 是确定性 CI 9 项，被 ai-trust-manifesto/adversarial-proof/keelbase-dna 多处引用 |
| L7 | scripts 一次性：`sync-issues-to-gitee.mjs` / `check-java-probe.mjs` / demo 视频链（record-demo*/video/*） | 保留（有参考价值，标注一次性；不占仓库维护成本） |

### 已排除（不是屎山）

- **6 个"零消费者"模块**（books/posts/tags/notes/suppliers/contracts）：后端虽仅 Contracts 被 AI 工具引用，但 **Front-Flutter 整块 feature + Web-Admin-Vue views/api 全栈在用**——是教学竖切 = 项目 DNA，**不删**。
- **Web-Admin-React 滞后**（缺 12 模块页）：实验预览版有意保留（架构边界红线），更新/转正由用户单独决定——**方向决策**非清理。
- **Flutter oauth_service SDK 桩**：待真实密钥/真机联调——**方向项**。
- 6 处超大文件外的近临界文件（ai.controller 442 / rag knowledge.service 444 / flow-runtime 431）：观察，不主动拆。

## 3. 分阶段推进方案

### 阶段 1 — 低风险确定清理（本次已完成，见 §4）
安全立竿见影，验证清理流程可行性。**缺点**：只清表面，不动结构。

### 阶段 2 — 结构修复（import 环 H5 + demo-provider dev-only M1）【待批准】
- **优点**：消除 Nest 循环 DI 启动隐患（5 个环已精确定位，工作量有限）；demo-provider 减生产面；均有测试可验证。
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

- [ ] 阶段 2 残余：环 1 compactor `AiServiceConfig` import 改 `import type`（低优先级，类型级）；module 级 forwardRef 环（ai↔auth↔org↔flows）为已知架构权衡——根治需 Explainable Authz 端点归属调整（auth controller 的 explainable 端点迁出 ai 域）+ 共享 provider 梳理，**建议并入阶段 3/4 统一做**
- [ ] 阶段 3：god service 拆分（auth → audit → ai.service → crm/admin/org，先拆小后拆大；ai.service 拆分时可复用本批 AuthorizationExplainerService 下沉经验）
- [ ] 阶段 4：governance/audit 语义整合架构立项；状态/风险词汇常量单源；Flutter i18n 中文映射迁移；React 预览版去留
- [ ] M3：demo-data.ts 832 行 seed 拆分评估

> 每次阶段执行后在此追加记录（比照 release-precheck 执行记录惯例）。
