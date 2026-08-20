# Explainable Authorization 设计（W5⑦：为何允许 / 为何阻止 + 依据）

> 2026-08-20 设计（Trust 深化主力，0820 综合评审「AI Security & Governance UX 产品化首步」）。目标：让**用户与管理员都能理解权限决策的依据**——被拒时知道「为何阻止」，被允许时知道「依据什么」。当前 CASL 只有 `allow/deny` 布尔结果，缺「解释」。
> 守上限：挂旗舰内、验证优先，非独立大模块。

## 1. 问题

当前权限决策（CASL `ability.can()`）返回布尔，403 只有「无权访问/Forbidden resource」：

- **用户**：被 AI 拒绝「不能删除这个客户」→ 不知道是「不是你的数据」还是「高风险需审批」。
- **管理员**：Security Review 看到某工具被拒 → 不知道是「工具开关关」还是「角色白名单」还是「治理策略」。
- **AI**：Agent 调工具被 `_assertToolAllowed` 拦 → 反馈给用户的是通用拒绝，非依据。

## 2. 解释模型（三层依据）

权限决策 = 三层规则的**叠加**，解释即回答「哪一层、哪条规则、为何」：

```text
① 角色基础规则    admin → manage all；user → manage 资源（行级条件 { userId: sub }）
② 行级条件        subject 对象是否匹配规则条件（所有权 / org_id 域 / 公开资源）
③ 治理策略(HS-9)  AI 工具开关 enabled / allowedRoles / requiresConfirmation / audit 粒度
```

解释结果结构：

```ts
interface PermissionExplanation {
  allowed: boolean;
  reason: string;                 // 用户可读：「只能操作自己的数据」/「需要管理员权限」/「工具已禁用」…
  basis: {
    layer: 'role' | 'row' | 'governance' | 'default-deny';  // 命中/拒绝的层
    rule?: string;                // 命中规则（如 can('manage','CrmCustomer',{userId})）
    subject: string;              // 资源（如 crm/customers）
    action: string;               // read/write/delete
  }[];
  deniedBy: 'casl' | 'governance' | 'policy' | null;  // 阻止来源
}
```

## 3. 端点设计

### 3.1 `GET /auth/me/permissions`（本人，能力清单）

返回当前用户**能做什么 + 依据**（前端「我的权限」视图）：

```json
{
  "role": "user",
  "basis": "role=user：可管理本人拥有的资源（行级 { userId } 条件）",
  "resources": [
    { "subject": "events",   "action": "manage", "scope": "own", "reason": "只能操作自己创建的事件" },
    { "subject": "crm",      "action": "manage", "scope": "own", "reason": "只能操作自己的客户/订单/任务" },
    { "subject": "admin",    "action": "manage", "scope": "none", "reason": "需要管理员角色" }
  ]
}
```

### 3.2 `POST /permissions/explain`（本人，决策解释）

对「某 action × 某资源（可选对象 id）」返回为何 allow/deny——用于调试与治理 UX：

```json
{ "action": "write", "subject": "crm/customers", "objectId": 42 }
→ { "allowed": false, "reason": "只能操作自己的数据（该客户属于他人）", "deniedBy": "casl" }
```

### 3.3 403 响应增强

`ForbiddenException` 自动携带 `explanation`（对前端可读的「为何阻止」）：

```json
{ "code": 403, "message": "无权访问此客户", "data": { "explanation": { "deniedBy": "casl", "reason": "只能操作自己的数据" } } }
```

## 4. UX（挂旗舰内，验证优先）

| 面 | 视图 | 展示 |
|----|------|------|
| **工作台** | 「我的权限」 | 本人能力清单（基于 3.1），用户理解自己 AI 能做什么 |
| **工作台** | AI 拒绝提示 | 对话中 AI 拒绝时，附带「为何」（基于 3.3 的 explanation，如「这是别人的数据」） |
| **管理台** | Security Review | 按用户/资源查权限决策依据（基于 3.2），管理员排查「为何某用户被拒」 |

## 5. 实现落点（后续，不占当前开发）

1. **CaslAbilityFactory** 增加 `explain(action, subject, object, user)`：内部遍历规则，输出命中/未命中 + 依据（纯函数，可单测）。
2. **auth.controller** 增加 `GET /me/permissions`；**权限相关 403** 由 `PoliciesGuard` 统一附加 explanation（不改各 controller）。
3. **AI 侧**：`_assertToolAllowed` 拒绝时返回治理依据（工具开关/角色/确认规则），Agent 反馈给用户「为何不能」。
4. **前端**：工作台「我的权限」页 + AI 拒绝卡片展示依据；管理台 Security Review 视图（复用现有审计数据 + explanation）。

## 6. 验证

- 单测：`casl-ability.factory.spec` 增加 explain 断言（本人 allow / 他人 deny / admin all / 治理策略 deny）。
- e2e：`GET /me/permissions` 结构 + 403 带 explanation。
- 旗舰验证：AI 拒绝场景（越权/未验证邮箱/工具禁用）在对话中展示依据。

## 相关

- [security-verification-matrix.md](security-verification-matrix.md) — 越权测试矩阵（Trust 回归）
- [architecture-boundary.md](../architecture-boundary.md) — 安全分层防线（Permission 是最终防线①）
- [protocol-models.md](../protocol-models.md) — Trust Model（Permission/CASL）
