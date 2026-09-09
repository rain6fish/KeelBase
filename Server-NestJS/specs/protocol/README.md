# Protocol Specs / 协议语料与 wire Schema（CE-1）

> 本目录承载「AI 治理协议」的**机器可校验语料**与 **wire 对象 Schema v1 冻结**——把 Proof Card / Evidence 文化从"留档"变"常绿门禁"（roadmap CE-1）。宿主 = TS 主仓；"载体可替换"是下游推论，不在此承诺任何 Java 载体。
> Hosts the protocol's machine-checkable corpora and the wire-object Schema v1 freeze — making trust verifiable *every commit* (CE-1). Host = TS main repo; no third-party carrier is promised here.

## 目录 / Layout

```
specs/protocol/
├── canonical-json-v1-vector.json    # §2.3 canonicalJSON 金样本（flat/nested/array/null/number/unicode 边界）
├── audit-hash-v1-vector.json        # §2 hash / legacy 派生 / 链校验 / 篡改反例
├── delegation-token-v1-vector.json  # §3 委托 token（相对时间构造 → 确定性、无时间戳）
├── risk-level-v1-vector.json        # §4 风险分级派生 + RISK_STRATEGY 表
├── wire-schema-registry.json        # wire 对象 Schema v1 冻结清单（对象 → schema → 样例）
└── schemas/v1/
    ├── *.schema.json                # 每 wire 对象一份 JSON Schema（draft-07，self-contained/$id 互引用）
    └── samples/*.json               # 每对象一份已提交代表样例
```

## 用法 / Usage（`cd Server-NestJS`）

| 目的 | 命令 |
|---|---|
| 语料漂移检测（现实现重算 vs 已提交，diff 即红） | `node scripts/generate-protocol-vectors.mjs --check`（npm `protocol:vectors:check`） |
| 语义变更后**重新生成**语料 | `node scripts/generate-protocol-vectors.mjs`（npm `protocol:vectors`） |
| 语料驱动 conformance（canonical/hash/delegation/risk） | `npm run conformance` |
| 生产 `AuditChainService` 复现 canonical 金样本 | `npm run test:protocol-corpus`（或 `test:wire-schema` 仅 wire） |

## CI / 门禁

- `.github/workflows/ci.yml` `protocol-conformance` job：先 `generate-protocol-vectors.mjs --check`（金样本漂移），再 `verify-protocol-conformance.mjs`（语料驱动，篡改/断链/aud/过期/签名篡改必须拒）。
- `test` job（jest）自动覆盖：`audit-chain.reproduce.spec.ts`（生产实现 = 金样本）+ `wire-schema.spec.ts`（registry 对象清单冻结 + 每样例过 schema）。
- `scripts/release-gate.sh` Gate `Trust(CE-1 协议语料+wire Schema)`。

## 规则 / Rules

- **单源（CE-1 L3 / C-1）**：语义变更必须先落本目录（升语料/Schema 版本）再改实现；金样本由现实现生成（实证优先，不预设"正确答案"）。语料文件与 schema 文件名均含版本段，**不含时间戳**——确定性、可 CI diff。
- **wire Schema v1 = 固化当前形状**（人工策展快照，非自动派生）。新增 wire 对象或形状变更 → 先加 `schemas/v2/` 并更新 `wire-schema-registry.json` + 冻结清单断言，再改代码。
- **语义变更评审清单**：触 tool/治理/审计/事件语义的改动 → 先按 [docs/manual/semantic-change-checklist.md](../../docs/manual/semantic-change-checklist.md) 落语料/Schema/协议文档再改代码（评审闸）。
- 来源锚见各 schema 的 `description` 与 `wire-schema-registry.json` 的 `source`（抽取时点行号，权威以 `src/` 为准）。

## 第三方自认证 / Third-party Self-cert

声明兼容本协议的实现可用同一份语料复现：自身实现复算 §2.2 hash、§3 委托 token 验签、§4 风险派生，与 `*‑v1‑vector.json` 比对一致即视为通过（协议 §5.1）。canonical 嵌套边界语义以 `canonical-json-v1-vector.json` 为准。
