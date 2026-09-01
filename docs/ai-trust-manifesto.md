# 企业 AI 信任宣言 / Enterprise AI Trust Manifesto

> 给企业决策者 / 采购 / 架构师的一份**可执行选型标准**——当你的组织要引入"AI Agent 系统"，用这四问检查它是否真正可信任。它不是宣传，而是可以当场验证的检查清单。
> For enterprise decision-makers / procurement / architects — an **executable evaluation standard**. When your organization brings in an "AI Agent system", run these four checks to see whether it is genuinely trustworthy. This is not marketing; it is a checklist you can verify on the spot.

> 原则出处：[KeelBase DNA](keelbase-dna.md)（工程哲学）。本宣言把这些原则**转译成采购语言**——为什么重要、问什么、期望什么。

---

## 为什么需要它 / Why

AI Agent 与传统软件不同：它**自主行动**、**读取并可能修改业务数据**。传统软件的信任假设（"代码不会自主越界"）不再成立。企业需要一套**新的检查方式**，判断一套 AI 系统是否在边界内工作——而不是听厂商声称。

这四问回答一个核心问题：

> **当 AI 出错、被诱导、或自作主张时，系统靠什么守住边界？**

---

## 四问 / The Four Checks

### 问 1：安全边界在 Runtime，还是只在 Prompt？

**为什么重要**：如果边界只是"我们告诉 AI 不要这样做"，那么 Prompt Injection、模型幻觉、Agent 规划失误都可能绕过它。边界必须在**执行路径上强制执行**，而不是依赖模型"听话"。

**怎么问**：
- 越权访问他人数据时，是运行时拒绝（403 / DENY），还是模型"自觉"不这么做？
- 权限检查在**工具执行前**发生，还是在模型生成后依赖它遵守指令？
- 能现场演示一次"诱导 AI 越权"而系统仍然拒绝吗？

**期望（PASS）**：给系统一个明显越权的请求 → 系统在运行时返回拒绝，与模型"是否听话"无关。

### 问 2：能力 ≠ 授权吗？

**为什么重要**：AI 能调用的能力，不等于它被允许执行的能力。授权边界必须独立于模型能力——即使模型知道某个 API、能生成 SQL、理解数据结构，也要被边界限制。

**怎么问**：
- 写操作（改数据）与读操作是**同一级别**的控制，还是有**分级**（读自动 / 写确认 / 高风险阻断）？
- 高风险动作（删除、大额、外部操作）是否有**额外门槛**（人工确认 / 双人审批 / 直接阻断）？
- Agent 能列出它"被允许"做的事，与它"能"做的事，是两回事吗？

**期望（PASS）**：写操作触发确认、高风险动作被阻断——这些由系统策略强制执行，不是模型自觉。

### 问 3：可信是可验证的，还是声称的？

**为什么重要**：安全/可靠性应该是**可运行的证明**，不是文档里的承诺。你要能亲手打破它、验证它。

**怎么问**：
- 有没有**可运行的验证**（脚本 / 测试集），当场证明"越权拒绝、写需确认、审计链完整"？
- AI 的每一步行动是否**可追踪**（谁发起的、为什么允许、做了什么、结果如何）？
- 审计记录是否**防篡改**（改动会被发现）？

**期望（PASS）**：一个验证脚本当场跑通"越权 → DENY、写 → 确认、审计 → 完整、撤销 → 生效"。不是口头保证。

### 问 4：重要动作可恢复吗？

**为什么重要**：没有不出错的 Agent。关键是出错后能否**撤销 / 补偿**，而不是假设不会错。

**怎么问**：
- AI 造成的业务变更（创建记录、修改状态）能否**撤销 / 恢复**？
- 撤销是否**记录在审计**里（谁撤的、何时、恢复到什么）？
- 跨系统（AI 写入了外部业务系统）的变更，有补偿机制吗？

**期望（PASS）**：让 AI 创建一个业务记录 → 撤销它 → 记录消失 / 标记已撤销，且全程可审计。

---

## 为什么这四问有效 / Why These Four

- **它们指向架构，不是指向厂商声明**——都可以当场运行验证。
- **它们覆盖 AI 失败的四种现实**：被诱导（问 1）、自作主张（问 2）、事后说不清（问 3）、出错无法挽回（问 4）。
- **它们可以写进采购条款**——"系统必须通过这四项现场验证"成为可执行的要求。

---

## 参考实现 / Reference Implementation

KeelBase 按上述四问构建，并公开可运行的验证（[verification-index.md](manual/verification-index.md)）：

| 问 | KeelBase 验证 |
|---|---|
| 1 Runtime 边界 | `verify-permission-denied.mjs`（越权 403，8/8）· CASL 行级权限 |
| 2 能力≠授权 | `verify-trust-proof.mjs`（R5 阻断 / 人工确认，15/15）· 工具风险分级 R0-R5 |
| 3 可信可验证 | 审计哈希链 `verify` · `security-showcase.md` 验收清单 · 全量单测门禁 |
| 4 可恢复 | 副作用撤销 + 回收站 · java-starter 补偿脚手架 · `verify-golden-crm.mjs` 撤销断言 |

> 这四问不绑定 KeelBase——任何企业 AI 系统都应能通过。KeelBase 只是按此构建并公开验证结果的其中一种实现。

---

## 相关 / Related

- [keelbase-dna.md](keelbase-dna.md) — 工程哲学（四问的原则出处）
- [verification-index.md](manual/verification-index.md) — 可复现验证清单
- [security-showcase.md](manual/security-showcase.md) — 安全展示
