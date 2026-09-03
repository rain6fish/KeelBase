# Security Showcase — 对抗性证明产品化（A2）

> 规格文档（A2 产品化：把已有的对抗性证据做成产品内可复现的可见演示）。
> 状态：⬜ 待实现 → 🔶 实现中 → ✅ 完成。日期：2026-09-01。

## 1. 背景与目标

**roadmap A2**：对抗性证明产品化——Prompt Injection（客户 note 恶意指令→Agent 拒绝）+ 越权（跨用户 query→CASL DENY）做成**产品内可复现演示** + 决策轨迹可视化。

**现状**：自动化证据层已全（越权矩阵 39/39、Agent Security Eval 12/12、Agent Benchmark 15/15、Golden 闭环、哈希链 valid），但都是 CLI 脚本 + 文档指南（`docs/manual/security-showcase.md`），验证者/评审看不到**产品内的实时演示**。

**目标**：管理台新增「安全演示」页（Security Showcase），一键运行确定性对抗场景，展示运行时边界（**Runtime over Prompt**）如何拦截，决策轨迹以业务语言呈现。

## 2. 场景定义（确定性，无 LLM）

全部场景直接调用真实防护逻辑（非模拟），输出 `outcome` + `reason` + 决策 `trace`。

| id | 场景 | 防护边界 | 期望 outcome |
|----|------|---------|-------------|
| `injection` | 客户资料注入指令（忽略系统指令/泄露提示词） | HS-8 注入防线 `detectInjection` + `sanitizeExternalContent` | `refused` |
| `unauthorized` | bob 越权读取 alex 的客户 | CASL 行级所有权 `ability.can('read', subject(...))` | `denied` |
| `r5-block` | AI 尝试不可逆动作（删除客户） | R5 策略阻断 `riskLevel('delete_customer')` | `blocked` |
| `confirmation` | AI 写操作（创建跟进任务） | R3 确认门控 `requiresConfirmation('create_followup_task')` | `requiresConfirmation` |

**canary 语义**：演示页是「防线 canary」——若真实防护漂移（注入样本不再命中 / CASL 行级放行 / 工具风险级变更），`run` 直接抛错（HTTP 500）变红，而非返回假绿 outcome 掩盖回归。

**返回结构**（2026-09-03 定稿：`reason`/`trace` 为 i18n key + 参数，**后端不产用户可见文案**，由前端按语言渲染，守 §5.5 #3 双语红线）：

```json
{
  "scenarioId": "injection",
  "outcome": "refused",
  "reasonKey": "injection.reason",
  "reasonParams": { "feature": "…" },
  "trace": [
    { "step": "input",   "key": "injection.input" },
    { "step": "guard",   "key": "injection.guardHit", "params": { "feature": "…" } },
    { "step": "decision","key": "injection.decision" },
    { "step": "outcome", "key": "injection.outcome" }
  ]
}
```

## 3. 后端 API（admin-only）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/ai/security-showcase/scenarios` | 场景清单（id + category；标题/说明/攻击样本文案由前端 i18n 提供） |
| POST | `/api/v1/ai/security-showcase/run/:scenarioId` | 运行场景 → `{ scenarioId, outcome, reasonKey, reasonParams?, trace[{step,key,params?}] }`；防线漂移 → 500（canary fail-loud） |

- 鉴权：`@CheckPolicies((a) => a.can('manage', 'all'))`（管理员）
- 场景实现：
  - `injection`：样例客户 note（含注入特征）→ `sanitizeExternalContent` → `detectInjection`；未命中 → 抛 canary 错误
  - `unauthorized`：固定合成 alex 属主（userId=1）→ 构造 bob 的 CASL ability → `ability.can('read', subject('CrmCustomer', { userId: 1 }))`；竟放行 → 抛 canary 错误
  - `r5-block`：本地注册表 `toolRegistry.riskLevel('delete_customer') === 'R5'` → blocked；非 R5 → 抛 canary 错误
  - `confirmation`：`toolRegistry.riskLevel('create_followup_task') === 'R3'` → requiresConfirmation；非 R3 → 抛 canary 错误
- 模块：`src/ai/security-showcase/`（service + controller），挂载到 `AiModule`；注册表注入真实工具实例（仅读风险元数据，不执行）

## 4. 前端

- 路由：`/admin/#/security-showcase`（安全治理导航组，与 AI 审计/安全审查/AI 评测并列）
- `SecurityShowcaseView.vue`：
  - 场景卡片列表（标题/类别/说明/攻击样本 prompt）
  - 「运行演示」按钮 → `POST run/:id` → 结果区
  - 结果区：outcome 徽章（refused=危险红 / denied=橙 / blocked=深红 / requiresConfirmation=蓝）+ reason/trace 按 `reasonKey`/`step.key` + `params` 经 i18n 双语渲染（`scReason.*` / `scStep.*`），动态值（命中特征/风险级）插值
  - 加载失败：提示错误且不误显空态；运行失败（含 canary 500）弹出错误
- i18n 双语（zh/en），禁用硬编码中文（§5.5 红线）
- 三处导航同步（`routes.ts` consoleChildren + 后端 `ADMIN_PAGE_ROUTES` + `navigate-admin-page.tool` 规则）

## 5. 复用

- `detectInjection` / `sanitizeExternalContent`（`src/ai/security/injection-guard.ts`，HS-8）
- `CaslAbilityFactory.createForUser` + `subject`（CASL 行级）
- `ToolRegistry.riskLevel` / `requiresConfirmation`（W5 风险模型）
- 前端 `AppIcon` / `el-timeline` / `el-tag` 组件模式（对齐治理抽屉）

## 6. 测试与验收

- 后端 spec：4 场景各断言 outcome/reasonKey/reasonParams/trace 结构 + 2 canary drift（注入未命中 / CASL 放行 → fail-loud）；未登录/非 admin 401/403
- 前端 vitest：页渲染 4 卡片 + 运行交互出结果徽章（本地化文案）+ 运行失败提示 + 清单加载失败不显空态；typecheck
- 手工验收：admin 打开 `/admin/#/security-showcase` → 逐个点运行 → 4 场景结果正确、轨迹业务语言清晰
- 文档联动：`docs/manual/security-showcase.md` 补产品页入口；CLAUDE.md §9 API 表登记

## 7. 相关

- [adversarial-proof.md](benchmark/adversarial-proof.md) — Gate 2 证据链汇总
- [security-showcase.md](manual/security-showcase.md) — 验证者指南（命令视角）
- [keelbase-dna.md](keelbase-dna.md) — Runtime over Prompt / Capability ≠ Authority
