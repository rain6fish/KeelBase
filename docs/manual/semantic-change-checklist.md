# 语义变更检查单 / Semantic-change Checklist

> **目的**：让「语义变更必须先落契约（Protocol / 向量语料 / Schema / 文档单一真源）再改代码」成为可评审的流程闸（CE-1 C1 语义化载体；公开仓不含内部编号）。机器闸（金样本 diff / conformance / wire Schema 冻结 / 术语闸）已常绿，本检查单补**评审操作面（reviewer-facing）**一环。
> **Purpose**: the reviewer-facing companion to the single-source rule — a per-face mapping + review checklist. Machine gates are already evergreen; this adds the human review layer.
>
> **规则真源 = [semantic-single-source.md](semantic-single-source.md)**（规则 + 语义源清单 + `check-semantic-single-source.mjs` 机器闸）。本文件是其**操作面**（语义面→伴生物映射 + reviewer 勾选），不另立第二套规则表述。
> 语料/金样本用法见 [specs/protocol/README.md](../../Server-NestJS/specs/protocol/README.md)；协议真源见 [ai-governance-protocol.md](../protocols/ai-governance-protocol.md)。

---

## 1. 语义面 → 必须同步的伴生物（单源映射）

改动命中任一**语义面**，同一 PR 必须同步对应伴生物，否则机器闸红、评审打回：

| # | 语义面（代码/行为） | 须同步的伴生物 |
|---|---|---|
| 1 | 审计哈希链 / canonicalJSON 语义（§2） | `specs/protocol/canonical-json-v1-vector.json` + `audit-hash-v1-vector.json`（`generate-protocol-vectors.mjs` 重生成）· `audit-chain.reproduce.spec.ts` 样例若变 |
| 2 | 委托 token 签发/验签（§3） | `specs/protocol/delegation-token-v1-vector.json` · `docs/protocols/ai-governance-protocol.md` §3 |
| 3 | 工具风险分级 / gate 语义（§4，含 R0-R5/riskStrategy 表） | `specs/protocol/risk-level-v1-vector.json` · 治理策略 schema `schemas/v1/governance-policy.schema.json` · 协议 §4 |
| 4 | 工具 wire / AI 工具治理面 | `schemas/v1/tool-definition` / `ai-tool-inventory`（含新增工具类字段）· 协议 §4.4 |
| 5 | SSE / WS 事件名或载荷 | `schemas/v1/sse-event` / `ws-frame`（事件名全集枚举冻结）· 协议 §2.5/相关 spec |
| 6 | confirmation（R3/R4/run 聚合，decision 语义） | `schemas/v1/confirmation-request|decision|confirm-decision-body|internal-approvals-execute|governance-confirmation-item` |
| 7 | trace step / 决策轨迹 | `schemas/v1/trace-step`（`step.type` 枚举冻结敏感点） |
| 8 | side-effect / revoke 语义（KB-6 revokeClass / status） | `schemas/v1/side-effect-revoke` · 协议/不承诺清单口径 |
| 9 | 审计 payload（v1/v2 键集）/ evidence 包格式 | `schemas/v1/audit-payload|evidence-package` · 协议 §2.5 · `verify-evidence.mjs` |
| 10 | REST 信封 / 错误体 / ChatResponse / 会话视图 / headless | `schemas/v1/api-response|error-body|chat-response|conversation-data|headless-chat-response` |
| 11 | 跨系统上报/回调（external/*、internal/*、sidecar policy） | `schemas/v1/external-*|internal-approvals-execute|sidecar-policy-push` |
| 12 | **对外术语 / 产品语言** | `ai-governance-protocol.md`（单一真源）+ `docs/manual/product-language.md` 词表；不允许第二套表述（术语闸扫描覆盖） |

## 2. 变更流程（先契约后代码）

1. 判定是否命中上表语义面；
2. 命中 → **先**更新语料/Schema/协议文档（含 `schemas/v1/` 冻结：新增形状走 `schemas/v2/` + registry + 冻结清单）；
3. 改代码；
4. 跑门禁（下表），全绿才算合规；
5. PR 附评审清单勾选（见下）。

## 3. 门禁命令（全绿要求）

| 门禁 | 命令（cd Server-NestJS） | 作用 |
|---|---|---|
| 向量漂移 | `node scripts/generate-protocol-vectors.mjs --check` | 现实现 = 已提交金样本 |
| conformance | `npm run conformance` | 语料驱动复现三协议（30/30） |
| 生产复现 + wire 冻结 | `npm run test:protocol-corpus` | AuditChainService=金样本 + registry 清单/样例过 schema |
| 术语闸 | `node scripts/check-protocol-language.mjs --check` | 对外语言/协议文档无第二套表述 |

## 4. 评审清单（reviewer 勾选）

- [ ] diff 是否触碰表 1 任一语义面？（否 → 跳过下两项）
- [ ] 语料 / Schema（v1 冻结或 v2 新增）/ 协议文档是否**同一 PR** 同步落地？
- [ ] 金样本是否重生成并提交（`generate` 后无 diff）？
- [ ] wire Schema：改动是否 bump 到 `schemas/v2/` 并更新 registry + 冻结清单（而非原地改 v1）？
- [ ] 机器门禁（表 3）是否全绿？
- [ ] 对外术语是否仍与 `ai-governance-protocol.md` + `product-language.md` 单一真源一致？

---

## 相关 / Related

- [specs/protocol/README.md](../../Server-NestJS/specs/protocol/README.md) — 语料/金样本/冻结用法与单源规则
- [ai-governance-protocol.md](../protocols/ai-governance-protocol.md) — 协议单一真源（§5.1 认证与 wire Schema v1）
- [product-language.md](product-language.md) — 产品语言词汇表（对外标准词）
