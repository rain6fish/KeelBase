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
- **治理策略（GovernancePolicy）**：工具开关 + 角色白名单，**每次工具调用实时查库取角色**（角色降权立即生效）。
- **数据范围（user_scoped）**：每个工具调用携带认证用户，只能读/写本人（或同组织）的数据。
- **拒绝检查清单（AuthorizationDeniedError.reasons）**：`risk_policy`（R5 阻断）/ `tool_enabled`（治理禁用）/ `role_allowed`（角色白名单）/ `feature_flag`（开关关闭）/ `admin_only` / `user_scoped`——结构化失败原因进入决策轨迹与审计，前端可渲染「为何阻止」。

### L5 Side-effect Governance（副作用治理）

- **人工确认**：写操作触发确认（批准 / 拒绝 / 本会话信任），确认后才执行；R4 需双人审批。
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
  → 执行 → 副作用记录（L5）
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
| Authorization Contract 协议化（Protocol 显式声明授权模型） | ⬜ 方向（当前由生成模块自动接线承担） |
| 重量级 RBAC 产品（Keycloak / Casbin / Shiro 等） | ⬜ **明确不做**（与差异化定位一致） |

---

*相关文档：* [README](../README.md) · [旗舰应用规格](flagship-applications.md) · [架构边界](architecture-boundary.md)
