# KeelBase 权限架构设计 / Authorization Architecture

> **定位**：KeelBase 的权限体系是一套 **Authorization Architecture**——以业务授权与数据级访问控制为核心，并向 **AI Agent / Tool Governance** 延伸的授权模型，而非传统 RBAC 权限系统。
>
> CASL 是这套架构中**授权决策层的一项技术组件**（提供 Action / Subject / Conditions / Fields 的细粒度授权），不是产品的权限定义本身。

---

## 1. 为什么不是"CASL 权限系统"

传统企业系统权限链：

```
User → Role → Permission → API → Database
```

AI 企业应用的权限链：

```
User → Agent → Tool → Business Operation → Database
```

差异在中间层：**Agent 不是普通用户**——它会自主选择 Tool、参数和执行路径。因此仅凭 API 权限（RBAC）不足以约束 AI。KeelBase 需要的是：

```
User Authorization
  + Agent Authorization
  + Tool Authorization
  + Data Scope
  + Side Effect Governance
  + Human Confirmation
  + Audit
```

这才是 Business-safe Agent Runtime 的权限含义：**"AI 能不能代表这个用户执行这个业务动作"**，而不是"企业用户怎么管理角色"。

---

## 2. 五层权限模型（L1–L5）

| 层 | 职责 | KeelBase 实现 |
|---|---|---|
| **L1 Identity** | 谁？（User / Organization / 认证） | JWT（access+refresh 轮换）、登录锁定、MFA、SSO/OIDC、邮箱/短信验证；User / Org / Department / Member |
| **L2 Business Authorization** | 这个人理论上能做什么？（Role / Permission） | CASL AbilityFactory + PoliciesGuard + @CheckPolicies + 行级校验；Explainable Authz |
| **L3 Agent Authorization** | Agent 可以代表他做什么？ | Agent Registry（ai_agents）+ trust_level R1–R5；委托身份（D4）；headless key 归属 |
| **L4 Tool & Data Governance** | 具体 Tool 能操作什么数据？ | 工具风险级 R0–R5；工具权限元数据（featureFlag / adminOnly / requiresConfirmation）；治理策略（开关 + 角色白名单）；数据范围（user_scoped） |
| **L5 Side-effect Governance** | 即使允许，也不一定能直接执行 | 人工确认；幂等；副作用可撤销（tool-effects）；审计哈希链；决策轨迹 |

```
L1 Identity ─ User / Organization
     ↓
L2 Business Authorization ─ Role / Permission / CASL Ability
     ↓
L3 Agent Authorization ─ Agent → allowed capabilities
     ↓
L4 Tool & Data Governance ─ Tool → Action → Resource → Data Scope
     ↓
L5 Side-effect Governance ─ Confirmation / Idempotency / Revoke / Audit
```

---

## 3. 分层详细设计

### L1 Identity（身份）

- **认证**：JWT access token（payload 含 sub / username / role）+ refresh token 轮换策略（每次使用更新、旧 token 立即失效）；登录锁定（连续失败阈值）；MFA（TOTP）；企业 SSO（OIDC 动态发现）；邮箱/短信验证码。
- **会话**：refresh token 存 SHA-256 哈希（非明文）；会话可远程登出；`/auth/sessions` 管理。
- **组织**：User / Organization / Department / Member（角色：owner / member / admin），组织级数据共享（同组织成员可读/管理待办等）。

### L2 Business Authorization（业务授权）

- **能力规则（CaslAbilityFactory）**：
  - `admin` → `can('manage', 'all')`
  - `user` → `can('manage', 'User', { id: user.sub })`、`can('manage', 'Event', { userId: user.sub })`、各旗舰实体（Crm*/Pm*/Approval*）行级所有权
- **策略守卫**：全局 `PoliciesGuard`（JwtAuthGuard 之后执行），`@CheckPolicies((a) => a.can(...))` 做路由级声明；服务/控制器层用 `@CurrentAbility()` 做行级对象校验（`subject('Customer', obj)` + `ability.can(...)`）。
- **Explainable Authz（可解释授权）**：
  - `describeForUser`：解析能力规则为用户可读的「权限清单 + 依据」（角色 + 资源 scope all/own + reason）
  - `explain`：对「某 action × 资源」返回决策 + 依据（`/auth/permissions/explain`）
  - `explainForTarget`：管理员为目标用户反查决策依据（`/auth/permissions/explain/target`）

### L3 Agent Authorization（Agent 授权）

- **Agent Registry（ai_agents）**：注册 Agent 的正式定义（id / name / owner / purpose / capabilities / **trust_level**）。最小版本从 headless API Key 自动注册；子 Agent 名在运行时归责。
- **trust_level R1–R5**：R1 读自动执行 / R2 轻量 / R3 写需人工确认 / R4 双人审批 / R5 阻断（不可逆/外部动作）。
- **委托与身份（D4）**：Agent 调用链归责（父动作 id / 上层 agent / 委托上下文 / 业务意图 / 来源通道），审计按 agent_id 归因到人；headless API Key 以 key 归属用户身份执行。

### L4 Tool & Data Governance（工具与数据治理）

- **工具风险级（ToolRegistry）**：每个 AI 工具注册 riskLevel + riskStrategy：
  - R1（auto）：只读，自动执行
  - R3（confirmation）：写操作，需人工确认
  - R4（human_approval）：双人审批
  - R5（block）：阻断，不进入确认/执行
  - 外部 MCP 工具按 readOnly 自动声明风险级（A2：readOnly→R1，非只读→R3）
- **工具权限元数据（permissions）**：`featureFlag`（特性开关）、`adminOnly`（仅管理员）、`requiresConfirmation`。
- **治理策略（GovernancePolicy）**：工具开关 + 角色白名单 + **可写字段域 / destination 白名单**（§7.2），**每次工具调用实时查库取角色**（角色降权立即生效）。
- **工具目的地（destination）**：写落到哪个系统——外部 MCP 工具是其 server 名、B 路径代理工具是其声明 audience、其余为本地运行时。单一源解析（`src/ai/tools/tool-destination.ts`），签发与执行两侧共用，供 AUTHZ-1 的目的地绑定与 destination 白名单使用。
- **数据范围（user_scoped）**：每个工具调用携带认证用户，只能读/写本人（或同组织）的数据。
- **拒绝检查清单（AuthorizationDeniedError.reasons）**：`risk_policy`（R5 阻断）/ `tool_enabled`（治理禁用）/ `role_allowed`（角色白名单）/ `feature_flag`（开关关闭）/ `admin_only` / `user_scoped` / `field_domain`（越出可写字段域）/ `destination_allowed`（目的地不在白名单）/ `destination_binding`（确认 artifact 绑定的目的地与当前不一致）——结构化失败原因进入决策轨迹与审计，前端可渲染「为何阻止」。

### L5 Side-effect Governance（副作用治理）

- **人工确认**：写操作触发确认（批准 / 拒绝 / 本轮信任），确认后才执行；R4 需双人审批。确认 artifact 绑定**目的地**（audience，AUTHZ-1）——签发时记录、执行时比对，跨目标复用被拒（不变量见 failure-semantics 向量 `confirmation_audience_mismatch_rejected` / 语料 FP-11）。
- **副作用记录（tool-effects）**：AI 创建的业务记录登记（目标类型 + 当前状态），支持撤销（软删 + 回收站恢复）。
- **审计哈希链**：AI 审计 + 操作审计链式 SHA-256，`/audit/verify` 可验证完整性，篡改即失败；请求体敏感字段自动打码。
- **决策轨迹（Decision Trace）**：用户请求 → AI 决策 → 工具调用 → 授权检查（含拒绝原因）→ 人工确认 → 数据变化，全链路可追溯。

---

## 4. AI 工具调用的运行时执行顺序

```
用户请求 → JWT 认证（L1）
  → 工具风险级检查：R5 → 阻断（risk_policy）（L4）
  → 治理策略：工具开关（tool_enabled）→ 角色白名单（role_allowed，实时查库）（L4）
  → 特性开关（feature_flag）→ adminOnly（L4）
  → 数据范围（user_scoped，限定本人/组织数据）（L4）
  → 写操作 → 人工确认（L5）
  → 执行 → 声明面复查：可写字段域（field_domain）/ destination 白名单（destination_allowed）（L4）
            + 确认 artifact 的目的地绑定（destination_binding，AUTHZ-1）（L5）
  → 副作用记录（L5）
  → 审计哈希链 + 决策轨迹（L5）
  → 可撤销（L5）
```

> 权限判断发生在**运行时**，不依赖 AI"记住规则"。被拒绝不是异常，而是系统正常工作——拒绝原因结构化进入决策轨迹与审计。

---

## 5. 与 Application Protocol 的关系

KeelBase 的 Build 侧以「应用协议」为约定生成业务模块，权限随之生成：

```
Application Protocol → 实体/API → CASL 所有权 → AI 工具（读 R1 / 写 R3 需确认）→ 审计接线
```

生成的业务模块自动携带：CASL 行级所有权、AI 读/写工具（写需确认）、操作审计。这构成**Authorization Contract 方向**——协议描述资源/动作/授权范围/Agent 工具/副作用策略：

```yaml
resource: Customer
actions: [read, create, update, delete]
authorization:
  scopes: [organization, owner, department]
agent:
  allowed_tools: [customer.search, customer.analyze, customer.createTask]
side_effects:
  customer.create: { confirmation: required }
  customer.delete: { allowed: false }
```

> 当前 Authorization Contract 已以「生成模块自动接线」形式落地；协议显式声明授权模型（scopes / agent tools / side_effects）是后续方向。

---

## 6. 现状 vs 待办

| 项 | 状态 |
|---|---|
| L1 Identity（认证 + 组织） | ✅ 已实现 |
| L2 Business Authorization（CASL + Explainable Authz） | ✅ 已实现 |
| L3 Agent Authorization（Registry + trust_level + 委托） | ✅ 已实现（最小版） |
| L4 Tool & Data Governance（风险级 + 治理策略 + 数据范围 + 结构化拒绝） | ✅ 已实现 |
| L5 Side-effect Governance（确认 + 撤销 + 审计哈希链 + 决策轨迹） | ✅ 已实现 |
| 确认 artifact 的目的地绑定 + 授权层参数域/destination 白名单（AUTHZ-1/AUTHZ-2） | ✅ 已实现（2026-09-24：`audience` 列 + 执行点比对；治理策略 `writableFields` / `allowedDestinations`）——声明面在**工具元数据**，不进协议，理由见 §7.2 |
| Authorization Contract 协议化（Protocol 显式声明授权模型） | ⬜ 方向（当前由生成模块自动接线承担） |
| 前端能力裁决（页面 / 菜单 / 按钮显隐） | ✅ 已实现（2026-09-15：消费 `GET /auth/me/permissions` 能力清单；roles 管壳 + 能力细门，见 `docs/web-front.spec.md` §4/§5） |
| 重量级 RBAC 产品（Keycloak / Casbin / Shiro 等） | ⬜ **明确不做**（与差异化定位一致） |
| 外置授权对接（OIDC 企业 SSO 已具备） | ⬜ 方向（按客户，待评估） |
| 通用数据范围（本人 / 本部门 / 本部门及以下 / 组织 / 自定义） | ✅ **已实现且可配置**（2026-09-15：结构化 where 构造器 + `ancestors` 子树下钻 + 写入盖章 + **按角色配置 `roles.data_scope`**）——见 `docs/data-scope.spec.md` |
| 动态 RBAC 数据（`roles` / `permissions` / `role_permissions` / `user_roles`） | ✅ 表 + 种子已落地，`CaslAbilityFactory` 由**数据驱动**（`RoleRuleRegistry` 装配时载入内存，工厂保持同步）；**管理面未做**（权限-4） |

---

## 7. 与主流框架对比 / 企业落地方向

| 维度 | KeelBase | Spring Security | Spring Auth Server / Keycloak | Sa-Token / Shiro | Casbin / MyBatis-Plus |
|---|---|---|---|---|---|
| 认证 | ✅ 强（锁定/MFA/OIDC 内建） | ⚠️ 框架，逐项自配 | ✅ IAM 全家桶 | ✅ 轻量 | — |
| 授权模型 | CASL 声明式 + 条件 | @PreAuthorize + SpEL + 角色 | 授权服务器（发 token） | RBAC 注解/路由 | 模型驱动 ACL/RBAC/ABAC |
| 行级数据权限 | ✅ 内建（conditions） | ❌ 原生无，需 Filter/拦截器 | — | ❌ | ✅ MyBatis-Plus 拦截器 |
| 动态 RBAC / 权限点 | ❌ 无（双角色硬编码） | ⚠️ 需自建表 | ✅ Keycloak 有 | ✅ 菜单权限表 | ✅ Casbin 策略存 DB |
| 菜单/按钮/字段级权限 | ⚠️ 菜单 + 按钮：能力契约驱动（2026-09-15）；字段级 ❌ | ⚠️ 自建 | ✅ | ✅ | — |
| 数据范围（本人/部门/组织） | ⚠️ 本人 + org（<br>机制已支持本部门/子树，待按角色配置） | ❌ 需补 | — | ❌ | ✅ 现成 |
| 授权服务器 / IAM | ❌ 无（OIDC 客户端） | — | ✅ 是服务器 | ✅ 有服务端 | — |
| 审计 | ✅ 哈希链 + Explainable | ⚠️ 无内建审计链 | ✅ 有事件 | ⚠️ 弱 | — |
| AI Agent 治理 | ✅ 独有 | ❌ | ❌ | ❌ | ❌ |

**定位**：KeelBase 与主流 Web 权限框架不是同物种——它是 **AI Agent 治理运行时**。传统 RBAC（动态角色/权限点/菜单按钮）对 KeelBase 是 hygiene 非卖点（差异化定位，§1/§6），因此明确不做重量级 RBAC 产品。

**企业应用落地方向（按客户二选一）**：
- **外置授权（推荐给已有 IAM 的企业）**：对接 Keycloak / Spring Authorization Server——KeelBase 走 OIDC 企业 SSO（已支持），IAM/RBAC 职责外置，KeelBase 保持「AI 治理运行时」定位。
- **自建轻量动态 RBAC（作为基座能力，按需）**：加 roles/permissions 表 + 管理端配置，`CaslAbilityFactory` 从配置构建而非硬编码；一并补通用数据范围（部门/组织维度，复用 org 模块）。触发点：出现多角色企业客户或 v1.1 后按需。状态：待评估（2026-08-28）。

### 7.1 组件栈：CASL 是授权核心，不找「Spring Security for Node」/ Component stack: CASL is the authorization core, not "Spring Security for Node"

**目标**：让 KeelBase 生成 / 运行的普通企业应用具备 **Page → Action → API → Row → Field** 的完整授权链，并让 **Human Authorization 与 AI Authorization 进入同一个 Trust Runtime**（§2 的 L1–L5 即该平面）。**能力要有，独立的 RBAC 产品不急着做**——与本节定位一致（不做同类脚手架式平台）；构建顺序见 §9。
**Goal**: ordinary enterprise apps generated / run by KeelBase should carry the full **Page → Action → API → Row → Field** authorization chain, with **human and AI authorization entering the same Trust Runtime** (the L1–L5 plane in §2). The **capability must exist; a standalone RBAC product is not urgent** (consistent with this section's positioning); build order per §9.

授权分两层——**下层安全基础设施与上层授权语义分开**：
Authorization has two layers — the **security infrastructure below and the authorization semantics above stay apart**:

| 层 / Layer | TS | Java |
|---|---|---|
| 请求入口 / 认证 · Request entry & authn | NestJS Guards + Interceptor + Passport / JWT / OIDC | Spring Security + OAuth2 / OIDC / JWT |
| **企业授权语义 · Enterprise authorization semantics** | **CASL → KeelBase Authorization → Trust** | **KeelBase Authorization → Trust** |

- **CASL 保持为授权核心组件**（能力声明 + 条件），**不替换**。CASL ≈ Authorization/Ability；Spring Security ≈ Authentication + Request Security + Authorization infrastructure——**两者不同层**，不存在「找个 Node 版 Spring Security 把 CASL 替掉」。
  **CASL stays the core authorization component** (ability + conditions); it is **not replaced**. CASL ≈ authorization/ability; Spring Security ≈ authentication + request security + authorization infrastructure — **different layers**, so "find a Node Spring Security to replace CASL" is a category error.
- **不追求对称性（选型陷阱）**：Java 用 Spring Security 是 Spring 生态使然；Node/Nest 的惯用组合本就是「框架原语（Guard / Interceptor）+ Passport 策略 + 授权库」。为对称而引入「大一统安全框架」是陷阱。
  **Do not chase symmetry (a selection trap)**: Java uses Spring Security because of the Spring ecosystem; the idiomatic Node/Nest combination is framework primitives (guard / interceptor) + Passport strategies + an authorization library. Importing a "one-size-fits-all security framework" for symmetry is a trap.
- **KeelBase 自持的部分继续向上**：Enterprise Authorization Semantics + Business-safe AI Trust（本文件 §1–§5）。
  **What KeelBase owns keeps moving up**: enterprise authorization semantics + business-safe AI trust (§1–§5 of this document).
- **组件评估**：`@nestjs/passport` / `@nestjs/jwt` / `openid-client` ✅ 认证适配层；Auth.js ⚠️ 偏 Web 应用框架，不作 KB 核心；Keycloak ⚠️ 外部 IdP，按客户接（见上「企业落地方向」）；OPA ⚠️ 暂不需要（与 Java 侧 ADR-0004 Option E 同判）。
  **Component assessment**: `@nestjs/passport` / `@nestjs/jwt` / `openid-client` ✅ authentication adapters; Auth.js ⚠️ web-app oriented, not a KB core; Keycloak ⚠️ external IdP, per-customer integration (see "enterprise direction" above); OPA ⚠️ not needed now (same ruling as Java-side ADR-0004 Option E).

### 7.2 裁决：参数域与 destination 白名单落在**工具元数据**，不进协议 / The ruling: the argument domain and the destination allowlist live in tool metadata, not in the protocol

**Decision.** The authorization layer may declare, **per tool**, the writable field domain (`writableFields`) and
the destination allowlist (`allowedDestinations`), checked against the actual request at the execution point. That
declaration lives in **tool metadata — the governance policy's per-tool override, beside `allowedRoles`**. It does
**not** go into the Application Protocol.

**Why not the protocol.** The escalation bar is "it must be identical across runtimes", and it is not:

1. **The protocol already draws this line.** In `governance-policy.schema.json`, the per-tool override is
   `additionalProperties: true` — extensible by design. The confirmation wire objects are `additionalProperties: false`.
   The protocol itself separates *local, extensible policy* from *frozen cross-runtime shape*, and this declaration is
   the former. It would be read as the latter only by putting it there.
2. **A field domain is a fact about a local business model.** It names the settable fields of *this* application's
   entity. Two runtimes running different applications will legitimately declare different domains for the same tool
   name — so a shared shape would have to be a container with no shared content, which is a schema that says nothing.
3. **What does cross the boundary is already covered.** The *decision* (allow / deny) and its evidence travel in
   `permission-decision` and in the `authorization.checks` carrier, whose check names are free strings. The denial
   for an out-of-domain field therefore already has a wire home; only the *declaration* is new, and the declaration
   is local.
4. **The precedent is not in the protocol either.** `allowedRoles` — the declaration this one sits beside — is not in
   the protocol. Splitting one policy surface across two homes would make "where do I change this?" depend on which
   half you happen to be changing.
5. **The cost is asymmetric.** The contract repository is additive-only: a wire object or a new version is a published,
   irreversible artifact that every peer runtime must agree on byte-for-byte. That bar is for shared shape, not for a
   list of local field names.

**Boundary (unchanged).** Both declarations are **closed lists compared literally** — a list of argument names, and a
list of destination identifiers. There is **no policy-expression DSL and no runtime interpretation of rules**; an
implementation that started evaluating expressions here would have left the architecture, not extended it.

**Known limit, stated rather than implied.** The field domain bounds **which fields** may appear, not **what values**
they carry: `writableFields: ['status']` permits `status` and says nothing about whether `status` is a legal value.
Value constraints stay where they already are — the tool's own validation, and the `parameters` schema the model
reads as a hint. Widening the domain into value predicates is the DSL this deliberately does not build.

**Relation to exact binding.** They **coexist** and neither implies the other. The confirmation binds the exact
arguments: it answers "is this the argument set that was approved", and it can only accept or reject the whole set.
The domain answers "which fields may this tool write at all", which is the question exact binding cannot express —
"may change `status`, may not change `owner`". Binding the exact arguments is *stricter* in one direction (it cannot
be widened after the fact) and *silent* in the other (it cannot say anything about a re-issue with different fields).

**Where it is enforced.** At the **execution point**, on the actual request — the same place, and for the same reason,
as the existing gate re-check: the wait between issuing and executing (an R3 confirmation, an R4 approval, an
offline decision) is long enough for a declaration to be tightened, and a declaration that only held at issue time
would not be a constraint.

---

**裁决。** 授权层可以**按工具**声明**可写字段域**（`writableFields`）与 **destination 白名单**（`allowedDestinations`），
在执行点按**实际请求**校验。该声明住在**工具元数据——治理策略的按工具覆盖项，与 `allowedRoles` 同处**，
**不进** Application Protocol。

**为什么不进协议。** 进协议的门槛是「**跨运行时必须一致**」，而它不一致：

1. **协议自己已经画了这条线。** `governance-policy.schema.json` 里按工具覆盖项是 `additionalProperties: true`
   —— 按设计可扩展；而确认类 wire 对象是 `additionalProperties: false`。协议本身就把「**本地可扩展策略**」与
   「**跨运行时冻结形状**」分了开；本声明属前者，放进协议会被读成后者。
2. **字段域是关于本地业务模型的事实。** 它命名的是**本应用**实体的可写字段。两个跑不同应用的运行时，对同一个
   工具名会各自声明不同的域。故共享形状只能做成一个「容器里没有共享内容」的 schema——那是一个什么都说不出的 schema。
3. **确实要跨边界的那部分，已经有承载面。** **决策**（放行/拒绝）与它的证据走 `permission-decision` 与
   `authorization.checks` 承载面，后者检查名是自由字符串。故「越域字段」的拒绝早就有 wire 归宿；
   新的只有**声明**本身，而声明是本地事实。
4. **那个先例本身也不在协议里。** 与之并排的 `allowedRoles` 不在协议里。把同一个策略面拆到两处，
   会让「这条改在哪」取决于你恰好改的是哪一半。
5. **代价不对称。** 契约仓只能**加**：一个 wire 对象或一个新版本，是**已发布、不可撤回**的产物，
   每个同行运行时都必须逐字节认同。那条门槛是给**共享形状**的，不是给一列本地字段名的。

**边界（未变）。** 两条声明都是**封闭列表、逐字比较**——一列参数名，一列目的地标识。**不引入策略表达式 DSL，
不做运行期规则解释**；若实现开始在这里求值表达式，那是离开了这套架构，而不是扩展了它。

**与精确绑定的关系。** 两者**并存**，且互不蕴含。确认绑定精确参数：它答「这是不是被批准的那组参数」，
且只能整组接受或整组拒绝。字段域答「这个工具究竟能写哪些字段」——那正是精确绑定表达不了的问题：
「可改 `status`、不可改 `owner`」。精确绑定在一个方向上**更严**（事后不可放宽），在另一个方向上**沉默**
（对「换一组字段再来一次」说不出话）。

**在哪执行。** 在**执行点**、按**实际请求**执行——与既有门控复查同一位置、同一理由：从签发到执行之间的等待
（R3 确认、R4 审批、离线裁决）足够长，声明可以在这段时间里被收紧；只在签发时成立的声明就不是约束。

**如实写出的已知边界。** 字段域限的是**哪些字段可以出现**，不是**它们携带什么值**：
`writableFields: ['status']` 允许 `status`，却对「`status` 是不是一个合法取值」不发一言。值的约束留在原处
——工具自身的校验，以及模型当作提示读的 `parameters` schema。把域扩成值谓词，就正是本裁决刻意不建的那套 DSL。

---

## 8. 对照实证：同类企业脚手架（源码级）

> §7「hygiene 非卖点」这一判断，用两家中国主流企业脚手架做**可核查**的对照。证据取自上游源码，非二手描述。

**关键发现：页面 / 按钮 / 数据行三层，两家都是各自手写的私有实现，没有现成库。**

| 能力 | 平台 A | 平台 B |
|---|---|---|
| 页面/菜单 + 按钮 | **菜单与按钮同一张表**：`menu_type` 区分目录/菜单/按钮、`perms` 权限标识、路由字段 | **权限与按钮同一张表**：`menuType` 区分一级/子菜单/按钮、`perms`、路由字段 |
| 按钮判权 | 手写字符串式权限标识匹配（自有字符串校验 API，类注释自称"首创"） | 同构自实现 |
| 数据行 | AOP 切面**拼 SQL**：全部 / 自定义 / 本部门 / 本部门及以下 / 仅本人（**角色级**枚举） | AOP 切面 + 「规则挂菜单」式数据规则表（字段+条件+值，前端可视化配置） |
| 字段级 | **无** | **无** |

**三条结论**

1. **没有现成库可买**：两家**仅为认证与强制点共用 Spring Security**（与 KeelBase 同层），页面/按钮/数据行的权限模型全是自写代码。故 KeelBase 做这三层是"补齐"而非"重复造轮子"——**这类能力本来的实现方式就是自建**。§6 的"明确不做重量级 RBAC 产品"指的是不做**产品化的 RBAC**，不是不做**能力**。
2. **"不做同类脚手架式平台"有实证支撑**：字段级**两家皆无**——该层是全行业空缺；若 KeelBase 只补页面/按钮/数据行，即成为"同类平台的 AI 化版本"。差异必须来自 §1 / §5 的那条链：人机双权限 + 风险确认 + Audit + Revoke + 跨 Runtime 契约。
3. **可借鉴**：平台 B 的「规则挂菜单」式数据规则表比平台 A 的 5 档枚举表达力强，是"按项目交付配置数据范围"的参考形状；但其 **AOP 注入 + 查询侧拼 SQL** 的做法，KeelBase 须**结构化**（scope 描述子，如已冻结的 `org-membership-scope`），不拼 SQL 串——避免注入面、保住 Explainable。

---

## 9. 交付档位：按项目交付配置的能力子集

> **性质**：这是**项目交付模式**（同一产品语义按不同项目要求配置能力子集），**不是产品定位变更**——KeelBase 的定位（Business-safe AI Runtime）不变。

四层能力（页面 / 按钮 / 数据行 / 字段）**不要求每次全开**：按交付对象配置子集，由 KeelBase **统一管理**——单一能力源 = wire 契约 `permission-capability-list` / `permission-decision`；`/app/capabilities` 暴露本交付**实际开启的档位**。

| 档 | 典型项目 | 开启能力 | 规则来源 | 管理面 |
|---|---|---|---|---|
| **A · 轻量单项目** | 小企业独立系统 | 身份 + 页面/菜单 + 按钮 + API + 行级(本人) + 审计 | 生成期 / 配置文件声明的 角色→能力 | 无（改配置走交付流程） |
| **B · 标准企业应用** | ERP / OA 类 | A + 数据范围（部门 / 组织树 / 自定义）+ 字段级（可选） | 数据表（roles / permissions） | KeelBase Admin（角色 / 组织 / 授权矩阵） |
| **C · 政企 / 已有 IAM** | 信创、大型企业 | B + 外置身份（OIDC / LDAP / AD / MaxKey）+ 字段级 | 数据表 + 外置身份事实 | KeelBase Admin（底层协调 IdP） |

**优先序**

1. **先让能力契约成为前端唯一裁决输入**——页面/菜单（现由前端 `meta.roles` 硬编码承担）与按钮显隐都接到已冻结的 `permission-capability-list`。**不建 RBAC 表**即可拿到页面 + 按钮两层。
2. 再做**通用数据范围**（本人 / 部门 / 组织树 / 自定义）——ERP/OA 的实际验收点，也是真工程量。（**2026-09-15：机制已落地**，见 `docs/data-scope.spec.md`；级别来源可配置属后续）
3. 字段级与管理面随档 B / C 触发。

**与 §7「企业落地方向」的关系**：§7 的"外置授权 / 自建轻量动态 RBAC"是**身份层与授权层**两个选择，不是二选一——身份走适配器（可外置 IAM），授权数据自持（档 B / C 需要）。触发点不变：出现多角色企业客户或 v1.1 后按需。

---

*相关文档：* [README](../README.md) · [旗舰应用规格](flagship-applications.md) · [架构边界](architecture-boundary.md)
