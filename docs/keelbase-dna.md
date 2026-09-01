# KeelBase DNA — 工程哲学 / Engineering DNA

> KeelBase 的工程哲学与产品 DNA。它既是**对外主张**，也是**内部架构决策的检查清单**——每个新功能 / PR / 能力取舍都要过这五句、四原则。
> The engineering philosophy and product DNA of KeelBase. It is both an **external thesis** and an **internal checklist for architecture decisions** — every feature / PR / capability trade-off is measured against these five sentences and four principles.

---

## 一句话 / The Sentence

> **AI Generates. Architecture Constrains. Runtime Governs. Tests Verify. Humans Decide.**
>
> **AI 负责生成，架构负责约束，运行时负责治理，测试负责验证，人类负责最终决策。**

```
AI          →  Generate（生成）
Architecture→  Constrain（约束边界）
Runtime     →  Govern（强制执行边界）
Tests       →  Verify（验证行为）
Human       →  Decide（拥有最终决策权）
```

对应 Roadmap 战略三角：**Build**（AI 生成 + 架构约束）→ **Run/Trust**（运行时治理 + 测试验证）→ 人类最终决策贯穿始终。

---

## 四核心原则 / Four Core Principles

> 十条衍生原则的对外压缩版——每条都**有代码实现证据**（不是口号），并配「打破它」的可运行验证。

### P1 — Runtime over Prompt（运行时优先于 Prompt）

> 业务安全边界必须由 **Runtime 强制执行**，而不是依赖 Prompt 描述。
> Business security boundaries must be **enforced at runtime**, not merely described in prompts.

即使 Prompt Injection、Agent 犯错、LLM 幻觉、Tool 参数错误、Agent 自主规划都发生，**Runtime 仍然守住边界**。

**实现证据**：
- 行级权限：CASL `PoliciesGuard` + `subject('Event'|'CrmCustomer', obj)`（`src/common/casl/`）——越权 403 是运行时拦截，非提示建议
- 审计哈希链：`AuditChainService`（HMAC-SHA256 + 域分离 key + verify）——篡改即断链
- 确认门控：写工具 `requiresConfirmation` → 人工确认后才执行

**打破它**：`node Server-NestJS/scripts/verify-permission-denied.mjs`（双账号越权 403，实测 8/8）

### P2 — Capability ≠ Authority（能力 ≠ 授权）

> Agent 可以拥有很强的能力，但它实际能够执行的能力必须受授权边界限制。
> An Agent may be capable of more than it is authorized to do.

AI 能调用某个 Tool、知道某个 API、能生成 SQL、能理解数据库结构——**都不代表它被允许执行**。

**实现证据**：
- 工具风险分级 R0-R5 + `riskStrategy`（`src/ai/governance/`）：R1 读自动 / R3 写确认 / R4 双人审批 / R5 阻断
- 治理策略表 `ai_governance_policy`（工具开关 / 确认 / 角色白名单，实时生效）
- sidecar 工具门控（S-2：`SIDECAR_TOOLS` → R5 阻断 / R3-R4 hold-and-release）

**打破它**：`verify-trust-proof.mjs`（正常成功 / 越权 403 / R5 阻断 / 人工确认 / 撤销，六场景实测 15/15）

### P3 — Trust Must Be Verifiable（可信必须可验证）

> 可信不是一句宣传语，而是一组可以运行的验证结果。
> Trust must be verified, not claimed.

KeelBase 不说"很安全"，而是给出可执行的证明：Clone it. Run it. Try to break it.

**实现证据**：
- 审计哈希链 `verify`（`/audit/verify` 返回 valid / brokenIndex）
- 验证资产：`verification-index.md`（一站式可复现清单）+ `security-showcase.md` + `release-gate.sh` + 全量单测门禁（214 套 / 1864+ 测试）
- 证据包导出（D-4：ActionReport + 哈希链校验 + HMAC 签名，可提交审计机构）

**打破它**：`verify-trust-proof.mjs` + `security-showcase.md` 验收清单（攻击集 12/12 全挡）

### P4 — Design for Recovery（设计可恢复）

> 不要假设 Agent 永远正确，要设计可恢复的系统。
> Do not assume perfect Agents. Make important actions recoverable.

比"绝对不出错"更工程化——**可撤销 / 可补偿**。

**实现证据**：
- 副作用撤销：`/ai/tool-effects/:id` 撤销（软删 + 回收站可恢复）+ 用户侧 `/ai/my/tool-effects/:id`
- 补偿脚手架：`KeelBaseCompensationSupport`（java-starter，幂等账本 + 审计 + 撤销补偿端点）
- 字段级变更审计（E-1：before/after 快照，人工复核）

**打破它**：`verify-golden-crm.mjs` 步骤 7（创建 → 确认 → 审计 → 撤销，8/8）

---

## 产业原则 / Industrial Principle

### Augment, Don't Replace（增强，不替换）

> AI 应该增强现有业务系统，而不是要求企业为了 AI 推倒重来。
> Bring AI to existing business systems instead of forcing enterprises to rebuild them.

**实现证据**：AI Bridge（OpenAPI → Proxy 工具，读 R1 / 写 R3）+ keelbase-java-starter（委托身份 + 工具导出 + 补偿）+ Integrator Kit Reference Project（传统 Java CRM → AI CRM）。

---

## 自举 / Self-bootstrapping

KeelBase 的 DNA 不只约束 Agent 与 AI 生成代码——**也约束开发 KeelBase 本身的 AI**：

| 原则 | 对产品 | 对项目开发 |
|---|---|---|
| AI-generated untrusted | Agent 行为默认不被信任 | AI 生成代码默认不被信任 → Code Economy Review + 全量测试门禁 + **生成 provenance** |
| Tests Verify | 运行时行为可验证 | 每次提交前审计 + 验证脚本 |
| Humans Decide | 写操作需人工确认 | 关键决策（推送 / 方向）由人把关 |

**生成 provenance（已落地）**：`keelbase init` 生成的每个模块目录写 `.keelbase-provenance.json`（来源 spec/openapi/cli + 生成器版本 + 协议 + 生成时刻）——与运行时 Business Action 链对应：运行侧「行为可追踪」、工程侧「代码可溯源」。`keelbase inspect` 展示各模块生成证明。

> **用 DNA 构建 DNA**——KeelBase 自己就是这套哲学的第一个、也是最有说服力的例子。

---

## 架构决策检查清单 / Architecture Decision Checklist

新功能 / PR / 能力取舍，过四问：

1. **边界是 Runtime 执行，还是 prompt 依赖？**（P1）——加安全能力时问：这条规则在运行时强制执行吗，还是只写进了 prompt / 文档？
2. **Capability ≠ Authority 保持了吗？**（P2）——新工具 / 新 Agent 能力，授权边界与能力边界是否明确分离？
3. **行为可验证吗？**（P3）——这个能力的正确性 / 安全性，有没有可运行的验证（测试 / 审计 / verify 脚本）？
4. **重要动作可恢复吗？**（P4）——AI 能产生的副作用，是否可撤销 / 可补偿？

**"为什么 KeelBase 不让 Agent 直接写数据库？"** ——因为 `Capability ≠ Authority`，且每个副作用必须被治理、可验证、可恢复。

---

## 相关 / Related

- [ai-trust-manifesto.md](ai-trust-manifesto.md) — 企业 AI 信任宣言（四原则 → 采购/选型四问）
- [verification-index.md](manual/verification-index.md) — 可复现验证清单（P3 的落地）
- [security-showcase.md](manual/security-showcase.md) — 安全展示（P1/P2/P3 的可运行证明）
- [adoption-30min.md](manual/adoption-30min.md) — 30 分钟接入治理（MOAT-1）
- [keelbase-java-starter](https://github.com/rain6fish/KeelBase-java-starter) — 产业原则的 Java 侧落地
