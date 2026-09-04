# Audit Authorization Snapshot — 审计「为什么允许」事件时点快照

> 规格文档。对应 roadmap T.9「审计『为什么允许』事件时点快照」。
> 状态：⬜ 待实现 → 🔶 实现中 → ✅ 完成。日期：2026-09-01。

## 1. 问题

A-6 compliance 证据包的 `authorization.allowed`（「为什么允许」依据）在导出时用**当前**治理策略/CASL 重算，而非动作发生时刻的评估结果：

- **拒绝路径**：`ai_audit_logs.authorization` 列已落库（`JSON.stringify(err.reasons)`，拒绝 checks）✓ 事件时点
- **放行路径**：`authorization` 列 NULL，导出时 `explainAuthorization` 重算 ✗

若导出前策略/角色已变化，签名包（HMAC 覆盖 compliance 段）内的放行授权依据会与事件当时实际评估不一致，削弱证据时效真实性（OCR + code-review Standards 双确认，SUSPECTED）。

## 2. 方案

### 写入侧（ai.service.ts 放行 tool_call 审计）

放行路径的工具调用审计补写事件时点授权快照：

```json
{ "allowed": true, "tool": "<toolName>", "riskLevel": "R1", "strategy": "auto", "checks": [...] }
```

- 数据源：`_authorizationReasons`（`_assertToolAllowed` 通过后、执行前已计算，含治理策略 enabled/role + 数据范围 + 风险分级）
- **对象格式**（非数组）：`parseChecks` 只认 JSON 数组 → 放行快照不会被误判为 denied，向后兼容
- 拒绝路径不变（数组）

### 导出侧（audit.service `_identityChainFromRow`）

```ts
const denied = parseChecks(row.authorization);          // 拒绝（数组）
let allowed = null;
if (!denied) {
  allowed = parseAllowedSnapshot(row.authorization);     // 放行快照（对象 allowed:true）
  if (!allowed && toolName) {                            // 历史数据无快照 → 降级重算
    allowed = await this.aiService?.explainAuthorization(toolName, row.userId) ?? null;
  }
}
```

- 新增 `parseAllowedSnapshot(raw)`：JSON 解析，`parsed.allowed === true` 时返回 `{ checks, riskLevel }`，否则 null
- **历史数据向后兼容**：旧放行记录无快照 → 维持现状重算
- `allowed` 快照含 `checks`，前端「为什么允许」渲染不变（读 `allowed.checks`）

## 3. 文件改动

| 文件 | 改动 |
|------|------|
| `src/ai/ai.service.ts` | 放行 tool_call 审计（`action:'tool_call'` 成功分支）补 `authorization: JSON.stringify({ allowed: true, ...authz })` |
| `src/ai/audit/audit.service.ts` | 新增 `parseAllowedSnapshot` + `_identityChainFromRow` 优先快照、无快照降级重算 |
| `docs/manual/product-language.md` | （无） |

## 4. 测试

- `ai.service.spec`：放行 tool_call 审计写 `authorization` 含 `allowed: true` + checks
- `audit.service.spec`：
  - `parseAllowedSnapshot` 解析放行对象 / 拒绝数组返回 null / 非法 JSON 返回 null
  - `_identityChainFromRow`：有放行快照 → allowed 用快照（不调 explainAuthorization）；无快照 → 降级重算；拒绝数组 → denied 不变
- 既有 compliance 导出测试保持通过（格式向后兼容）

---

## 5. Policy Evidence（§22.17 ③，2026-09-04 增量）

> 承接 roadmap §22.17 ③「Policy 版本冻结 + 决策可复现」：不仅知道「为什么允许」，还知道**当时依据的是哪一版治理规则**。

### 5.1 写入侧：事件时点策略版本入快照

`AuthorizationExplainerService.getAuthorizationReasons` 改为**单次取策略**（读 `GovernancePolicyService.getPolicy()`），把决策输入（`tool_enabled`/`role_allowed` checks，由同一份策略派生）与**决策时策略版本**同源带回：

- `policyVersion = policy.updatedAt ISO`（无策略行/未配治理 → `null`，语义等同「默认策略」）
- 返回对象新增 `policyVersion`，随 `tool_start`/`confirmation_request` 事件与放行快照自动携带
- 放行 `tool_call` 审计快照（ai.service 成功分支）补 `policyVersion`：

```json
{ "allowed": true, "tool": "...", "riskLevel": "R3", "strategy": "confirmation",
  "checks": [...], "policyVersion": "2026-09-04T09:20:00.000Z" }
```

- **拒绝路径不变**（`authorization` 仍为 checks 数组——A-8/parseChecks 判拒依赖数组形态，不因本项破坏）

### 5.2 导出侧：版本随 allowed 投影携带

`parseAllowedSnapshot` 解析 `policyVersion`；`_identityChainFromRow` 的 `allowed` 在快照含版本时带 `policyVersion`（历史行无版本 → 不注入键，消费端可选）。身份链/合规证据包由此可回答「哪一版规则允许」。

### 5.3 语义与边界

- **决策输入已冻结**：checks（tool_enabled/role_allowed/risk）在事件时点与 `policyVersion` 同源写入 → 证据不随当前策略漂移（与 §1「不复算过去」同源）。
- **可复现口径**：冻结的 checks 即"该版本下的决策记录"；重读恒同（快照优先、不重算）。**跨策略版本真正回放**（拿历史 policy 对象重演决策）需**策略历史表**支撑——超出当前范围，记为后续项（见 roadmap §22.17 ①证据根 / 策略版本化）。
- 前端「为什么允许」可展示 `allowed.policyVersion`（治理抽屉/身份链卡片可选字段）；漂移提示（现策略 ≠ 快照版本 → "决策基于旧版规则"）为后续 UI 增量。

### 5.4 测试

- `authorization-explainer.service.spec`（新）：单次取策略产出 checks + `policyVersion`；禁用工具仍带版本；无治理 → `policyVersion` null
- `audit.service.spec`：快照带 `policyVersion` → `getChain` 的 `allowed.policyVersion` 透出；无版本历史行形态不变（向后兼容）

## 5. 相关

- [security-showcase.spec.md](security-showcase.spec.md) — A2 对抗性证明（运行时边界演示）
- [adversarial-proof.md](benchmark/adversarial-proof.md) — Gate 2 证据链
- [keelbase-dna.md](keelbase-dna.md) — Trust Verifiable / Design for Recovery
