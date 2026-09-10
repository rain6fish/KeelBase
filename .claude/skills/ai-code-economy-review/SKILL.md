---
name: ai-code-economy-review
description: AI Code Economy Review（反 AI Slop）—— diff-first 审查新增代码的必要性/复用/重复/过度抽象/过度工程化/代码膨胀/删除机会。触发：用户说「code economy 审查」「反垃圾代码审查」「review economy」「检查这版是否过度设计」，或发布前跑 release-precheck 第四层。
---

# AI Code Economy Review

> **职责边界**：不重复 OpenCodeReview（代码缺陷）、Claude Review（工程质量）、mattpocock code-review（Standards+Spec+Fowler smells）。本 skill 只负责：**Necessity + Reuse + Duplication + Abstraction + Complexity + Code Expansion + Deletion**。mattpocock 已发现 Middle Man/Speculative Generality 等——本 skill 用其结果作为证据，不重新执行 smell review。

## 检查维度（六项）

1. **Necessity** — 新增代码是否被 Requirement 需要？
2. **Reuse** — 已有代码/平台能力（CASL/Governance/Audit/AI Tools/Protocol/Memory/RAG/MCP/FLOW）是否可直接复用？
3. **Simplicity** — 实现是否明显复杂于需求？
4. **Proportionality** — 代码增量是否与需求规模匹配（`LOC ≠ Quality`，LOC 只是 Expansion Signal）？
5. **Deletion** — 是否主动寻找可以删除而不改变行为的代码？
6. **Maintainability** — 新增代码的长期维护成本是否超过其价值（Net Value）？

## 架构边界保护（重要）

KeelBase 以下类型 abstraction **不因「只有一个实现」就判为垃圾**——它们是真实边界，判断「不必要」必须给出具体证据：

```
Security boundary / Governance boundary / Audit boundary / Transaction boundary
Domain boundary / Plugin boundary / Protocol boundary / External integration boundary
```

例：`ProxyToolRevokerService`（外部补偿边界）、`CaslAbilityFactory`（权限边界）——即使单一实现，也是必要抽象。

## Scope × Complexity 判断

每个 diff 至少回答：

```text
Requirement Complexity:  LOW / MEDIUM / HIGH
Implementation Complexity: LOW / MEDIUM / HIGH
Proportionality: PROPORTIONAL / QUESTIONABLE / DISPROPORTIONAL
```

**不要因为代码量大就自动判定为 Slop**——先看 Requirement Complexity。

## 执行步骤

1. **确定范围**：commit / branch / merge-base / 工作树 diff；默认最近未推送（`git diff origin/main..HEAD`）
2. **统计**：`git diff --stat` → Added / Deleted / Net LOC（仅作 Expansion Signal，非质量分）
3. **Scope×Complexity**：判断 Requirement vs Implementation Complexity → Proportionality
4. **读取 diff**：逐文件读新增/改动行
5. **按需回查仓库**：仅当判断重复/复用/架构关系时，搜索已有实现（grep/搜索）
6. **Dead Code 确认**：可疑未用代码必须 grep 调用点——无引用 = FACT，否则 SUSPECTED
7. **对照检查维度产出 findings**

## Finding 格式（每项必须证据化）

```markdown
### [Severity: HIGH|MEDIUM|LOW] <Category>
- File: <path:line>
- Evidence: <FACT: ... | SUSPECTED: ...>
- Reason: <为什么是问题>
- Recommendation: <DELETE | REUSE | SIMPLIFY | CONSOLIDATE | REFACTOR | ADD> + 具体做法
- Confidence: HIGH | MEDIUM | LOW
```

**FACT**（有引用/结构证据）vs **SUSPECTED**（AI 推断）——禁止把推断写成事实。

## 推荐动作优先级

```text
DELETE > REUSE > SIMPLIFY > CONSOLIDATE > REFACTOR > ADD
```

不默认通过增加代码解决问题。

## 输出格式

```markdown
# AI Code Economy Review

## Summary
- Scope: <commit/branch>
- Changed files: N
- Added/Deleted/Net LOC: +X / -Y / +Z
- Requirement Complexity / Implementation Complexity / Proportionality

## Findings
<按上面的 Finding 格式>

## Reuse Opportunities
...

## Deletion Opportunities
...

## Verdict
PASS / WARN / REFACTOR / REJECT
```

## Dead Code 证据化原则（核心，防止假阳性）

**Dead Code MUST NOT be inferred from a single search result.**

报告 Dead Code 为 **FACT** 前，必须按序执行：

1. Search exact symbol（精确符号）
2. Search references（引用点）
3. Search imports（导入处）
4. Search dynamic / reference patterns where applicable（动态引用/模式，如 NestJS DI、Flutter Provider、装饰器注册）
5. Consider framework conventions（框架约定——NestJS/Flutter/TS 中调用关系不一定是简单文本引用）
6. Only then classify as FACT（全部确认后才写 FACT）

任一搜索方式受限 → 降级为 **SUSPECTED** 并在 Evidence 注明搜索范围。宁可漏报，不可假阳性。

## 行为约束

- **Review = automatic；Fix = human/explicit**：默认只报告不改码。用户明确说「refactor-ai-slop」才允许自动修复（当前未启用，需真实案例验证后单独决定）
- **PASS 也是结果**：好代码（含复杂但合理的架构边界代码）要 PASS，不为发现问题而发现问题
- **不首版做评分表**：不输出 `Score: 87`，只输出 PASS/WARN/REFACTOR/REJECT + 证据

## 与 CLAUDE.md §15 的关系

§15 是「生成时约束」（减少 Slop 产生）；本 skill 是「事后兜底」（识别残留）。配合使用。

## 验证案例（发布接入前跑一遍）

| Case | 场景 | 期望 |
|------|------|------|
| 1 Good Code | 合理简单符合架构 | PASS |
| 2 Over-engineering | 大量 abstraction 的真实修改 | WARN/REFACTOR（unnecessary abstraction/wrapper/complexity）|
| 3 Reuse | 已有能力可复用却平行实现 | Detect reuse opportunity（指出已有实现位置）|
| 4 Dead Code | 未调用新增代码 | FACT: No references found（grep 确认）|
| 5 Complex but Legitimate | Governance/Audit/Security/Protocol 真实复杂功能 | 不误判为 Slop（识别架构边界）|

验证后统计 True/False Positive/Negative——False Positive 偏高时**优化判断规则**而非增加更多规则。
