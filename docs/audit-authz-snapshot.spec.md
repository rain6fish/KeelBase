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

> **口径收敛（2026-09-04）**：策略版本采用**内容指纹 revision**（#51，`ai_governance_policy.value` → sha256 前缀、normalize 排序 key，同内容恒同号、变更必变号；无迁移）；审计身份链/合规投影移植自平行实现的 updatedAt 口径——统一为 `policy = { revision, updatedAt }` 嵌套（revision 是权威版本、updatedAt 供人读）。

### 5.1 写入侧：事件时点策略版本入快照

`AuthorizationExplainerService.getAuthorizationReasons` **单次取策略**（`GovernancePolicyService.getPolicy()`），把决策输入（`tool_enabled`/`role_allowed` checks）与**决策时策略内容指纹 revision** 同源带回：

- `policy = { revision, updatedAt }`：`revision` = 策略内容指纹（sha256 前缀 12 hex），`updatedAt` ISO 供人读；无策略行/未配治理 → **不附 policy**（默认策略语义，向后兼容旧快照）。
- 返回对象带 `policy`，随 `tool_start`/`confirmation_request` 事件与放行快照自动携带。
- 放行 `tool_call` 审计快照（ai.service 成功分支）写 `policy`：

```json
{ "allowed": true, "tool": "...", "riskLevel": "R3", "strategy": "confirmation",
  "checks": [...], "policy": { "revision": "a1b2c3d4e5f6", "updatedAt": "2026-09-04T09:20:00.000Z" } }
```

- **拒绝路径不变**（`authorization` 仍为 checks 数组——A-8/parseChecks 判拒依赖数组形态，不因本项破坏）

### 5.2 导出侧：版本随 allowed 投影携带

`parseAllowedSnapshot` 解析嵌套 `policy`；`_identityChainFromRow` 的 `allowed` 在快照含 `policy.revision` 时带 `policy`（历史行无版本 → 不注入键，消费端可选）。身份链/合规证据包由此可回答「哪一版规则允许」。

### 5.3 决策可复现（verifyReproducible）

`GovernancePolicyService.verifyReproducible(recorded)`（recorded = 审计 authorization 快照解析：`tool` + `checks[]` + `policyRevision`）用**当前**策略重放该放行：

- 快照无 `policyRevision`（历史记录）→ `verifiable:false`
- 当前 revision === 记录 revision → 未漂移，可复现
- revision 漂移但该工具 `tool_enabled` 放行判定未受影响 → `toolDecisionChanged:false`，仍可复现
- 漂移且该工具现被禁用 → `toolDecisionChanged:true`，不可复现
- 返回 `{ verifiable, reproducible, policyChanged, toolDecisionChanged, recordedRevision, currentRevision, note }`

### 5.4 语义与边界

- **决策输入已冻结**：checks 与 `policy.revision` 在事件时点同源写入 → 证据不随当前策略漂移（与 §1「不复算过去」同源）。
- **可复现 = 快照优先 + verifyReproducible**：读侧不再重算（§5.2）；要判断「当时为何允许是否仍成立」走 verifyReproducible（对当前策略）。**拿历史 policy 对象真正重演决策**需策略历史表——超出范围，记为后续项（roadmap §22.17 ①证据根 / 策略版本化）。
- 前端「为什么允许」可展示 `allowed.policy.revision`；漂移提示 UI 为后续增量。

### 5.5 测试

- `governance-policy.service.spec`：revision 无行恒同 / 同内容恒同号 / key 顺序无关 / setPolicy 与再读一致；verifyReproducible 四态
- `authorization-explainer.service.spec`：单次取策略产出 checks + `policy.revision`；禁用工具仍带版本；无治理 → 不附 policy
- `audit.service.spec`：快照带 `policy.revision` → `getChain` 的 `allowed.policy` 透出；无版本历史行形态不变（向后兼容）

## 6. 相关

- [security-showcase.spec.md](security-showcase.spec.md) — A2 对抗性证明（运行时边界演示）
- [adversarial-proof.md](benchmark/adversarial-proof.md) — Gate 2 证据链
- [keelbase-dna.md](keelbase-dna.md) — Trust Verifiable / Design for Recovery
