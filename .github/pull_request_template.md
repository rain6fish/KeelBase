<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- PR 模板 / Pull Request template — 中英对照；请保留小节标题以便审阅。 -->

## Summary / 说明

<!-- 做了什么、为什么。What changed and why. -->

## Type of change / 变更类型

- [ ] Bug fix 修复
- [ ] Feature 新功能
- [ ] Refactor / docs / chore 重构 · 文档 · 杂项
- [ ] **Semantic change** — touches tool / governance / audit / event semantics 语义变更

## Semantic contract check (single-source rule) / 语义契约检查

> 若改动触及**语义源实现**——`Server-NestJS/src/common/audit-chain/`、`Server-NestJS/src/common/wire-schema/`、`Server-NestJS/src/ai/interfaces/tool.interface.ts`、`Server-NestJS/src/ai/audit/ai-business-event.ts`——须在**同一 PR** 先落契约（`Server-NestJS/specs/protocol` 向量/金样本 或 `schemas` wire Schema）。
> If your change touches the **semantic-source files** above, land the contract (`specs/protocol` vectors/golden or `schemas` wire Schema) **in the same PR**.
>
> 规则真源：[docs/manual/semantic-single-source.md](docs/manual/semantic-single-source.md) · 评审操作面：[docs/manual/semantic-change-checklist.md](docs/manual/semantic-change-checklist.md) · CI 硬门禁 job `semantic-guard`。

- [ ] **Not applicable** — 未触上述语义源文件（未 touch the semantic-source files）
- [ ] **Contract landed in this PR** — 本 PR 已同批更新 `specs/protocol` 或 `schemas`
- [ ] **Pure refactor / no contract impact** — 提交信息含 trailer `[no-semantic-change]`（commit message includes the trailer）

## Testing / 测试

<!-- 跑了什么命令 / 结果。Commands run and results. -->

## Checklist / 清单

- [ ] `npm run build` + 相关测试通过（build & relevant tests pass）
- [ ] 文档随码更新（docs updated with code，如适用）
- [ ] 未提交密钥 / 凭据（no secrets committed）
