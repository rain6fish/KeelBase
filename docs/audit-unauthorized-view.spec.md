# Audit Unauthorized View — 越权尝试一级事件业务化（A-8 收尾）

> 规格文档。对应 roadmap A-8 剩余：「越权尝试一级事件专门视图（含『AI 尝试访问受限信息』业务摘要）+ 行为类型筛选扩展到风险中心/行为回放」。
> 状态：⬜ 待实现 → 🔶 实现中 → ✅ 完成。日期：2026-09-01。

## 1. 现状与问题

- AI 审计页已有「行为类型」筛选（含 denied），走服务端 `denied=true` 过滤（is_error + authorization 非空）✓
- 但 **denied 事件的业务摘要不区分场景**：审计解释器对「被拒/阻断」统一输出「X 的操作被安全策略阻断」，无法区分：
  - **越权尝试**（数据级）：AI 试图访问他人数据，工具内抛 ForbiddenException（errorMessage 含「无权/403」），authorization 列为 null
  - **高风险阻断**（工具级）：R5 不可逆动作，抛 AuthorizationDeniedError（errorMessage 含 `blocked (risk level R5)`）
  - **门控拒绝**：治理禁用/角色白名单/特性开关/adminOnly
- 风险中心（RiskView）denied 日志只展示 `errorLabel(errorMessage)` 或「拒绝原因」，无「越权尝试」专门标识；行为回放（AiTimelineView）无行为类型筛选

## 2. 方案

### 后端（audit-interpreter.service.ts）

细分阻断业务摘要（用 `errorMessage` 语义，无需加字段——`AuditInterpretationRow` 已含 errorMessage）：

```ts
const UNAUTHORIZED_RE = /越权|无权|无权访问|403|permission|access|不是你的|不是属主|其他用户|不属于/i;
const HIGH_RISK_RE = /R5|不可逆|高风险|blocked/i;

// blocked 分支细分：
if (UNAUTHORIZED_RE.test(msg) && !HIGH_RISK_RE.test(msg)) → 「X 的 AI 尝试访问受限数据，已被策略拒绝（越权尝试）」
else if (HIGH_RISK_RE.test(msg))                        → 「X 的 AI 尝试高风险操作，已被安全策略阻断」
else                                                     → 「X 的操作被安全策略阻断」（保留）
```

### 前端

- **RiskView**：denied 日志行标签区分——errorMessage 命中越权 → 红色「AI 越权尝试」；R5/blocked → 「高风险阻断」；否则「被阻断」
- **AiTimelineView**：加行为类型筛选（全部 / AI 执行 / AI 被拒·越权），复用 `isError`/`authorization` 判定
- **AiAuditView**：denied 行用解释器 sentence（后端摘要自动生效）

## 3. 文件改动

| 文件 | 改动 |
|------|------|
| `src/ai/audit/audit-interpreter.service.ts` | UNAUTHORIZED_RE + HIGH_RISK_RE + blocked 分支细分 |
| `src/ai/audit/audit-interpreter.service.spec.ts` | 3 种拒绝场景摘要断言 |
| `Web-Admin-Vue/src/views/risk/RiskView.vue` | denied 行标签区分越权/高风险/阻断 |
| `Web-Admin-Vue/src/views/ai-timeline/AiTimelineView.vue` | 行为类型筛选（全部/执行/越权·被拒） |
| `Web-Admin-Vue/src/i18n/{zh,en}.ts` | 新键：越权尝试/高风险阻断 标签 |

## 4. 测试

- audit-interpreter.spec：越权（无权访问）→ 越权尝试句；R5 blocked → 高风险句；门控禁用 → 通用阻断句
- 前端 vitest：RiskView 标签区分 + AiTimelineView 行为筛选（如有现有测试则扩展）

## 5. 相关

- [security-showcase.spec.md](security-showcase.spec.md) — A2 对抗性证明
- [audit-authz-snapshot.spec.md](audit-authz-snapshot.spec.md) — 放行快照（A-5）
- [adversarial-proof.md](benchmark/adversarial-proof.md) — Gate 2 证据链
