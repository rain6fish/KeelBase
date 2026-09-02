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

## 5. 相关

- [security-showcase.spec.md](security-showcase.spec.md) — A2 对抗性证明（运行时边界演示）
- [adversarial-proof.md](benchmark/adversarial-proof.md) — Gate 2 证据链
- [keelbase-dna.md](keelbase-dna.md) — Trust Verifiable / Design for Recovery
