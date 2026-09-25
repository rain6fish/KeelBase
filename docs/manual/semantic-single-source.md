# 语义单源规则（CE-1 C1） / Semantic Single-Source Rule

> **规则**：触及 **tool / 治理 / 审计 / 事件** 语义的实现改动，须**同批**落契约——即「**先落契约，再改代码**」。对抗「同一语义两处实现各自漂移」。

**「落契约」的两种形态**（契约 2026-09-21 出仓前后各一种）：
- **出仓前**：改本仓 `Server-NestJS/specs/protocol/` 内的向量/金样本/schema；
- **出仓后**：契约仓先提交，**本仓同批推进子模块指针**（`Server-NestJS/specs/protocol` 这条**裸路径**）。

为什么出仓后只剩指针一条路：本仓能观测到的契约动作就这一个 —— 另一个门 `contract-not-edited-here` 明确**禁止**在本仓直接改 `specs/protocol/` 内的文件。

## 为什么 / Why

KeelBase 的关键能力 = 同一 Application Semantic Layer 连 Build 与 Run（ADR-0002）。语义散落两处实现（TS 实现 + 契约）时，二者会静默分叉——审计哈希链、R0-R5 风险分级、业务事件命名、wire Schema 一旦分叉，"跨语言可复现"就失效。单源规则把它变成**机器可判定的纪律**（CE-1 三作用②：能力进化仲裁桥）。

## 语义源清单 / Semantic sources（变更需同批契约）

| 语义源实现 | 语义 |
|---|---|
| `Server-NestJS/src/common/audit-chain/` | canonical JSON / 哈希链 / HMAC 算法 |
| `Server-NestJS/src/common/wire-schema/` | wire Schema（SSE/确认/trace/side-effect/audit payload…） |
| `Server-NestJS/src/ai/interfaces/tool.interface.ts` | R0-R5 风险级 + 策略表 |
| `Server-NestJS/src/ai/audit/ai-business-event.ts` | 业务事件命名 |

**契约真源**（任一命中即视为已落契约）：`Server-NestJS/specs/protocol/` 内的向量/金样本/registry/schema（**出仓前形态**）、以及**子模块指针本身** `Server-NestJS/specs/protocol`（**出仓后形态**，裸路径、精确匹配）。

## 流程 / Workflow

1. 改语义（上表文件）→ **先**在契约仓落向量/金样本/schema，再**推进本仓子模块指针**，**同批**提交（出仓前则是直接改 `specs/protocol/` 内文件）。
2. 纯重构 / 注释 / 无契约影响 → 提交信息加 trailer `[no-semantic-change]`（评审可见理由）。
3. 闸判定：命中语义源但无契约变更 → 失败；命中豁免 trailer → 通过。

## 机器闸 / Machine gate

```bash
cd Server-NestJS
npm run check:semantic-single-source --base origin/main   # 与 base...HEAD 比对
npm run check:semantic-single-source --files "a.ts b.json"  # 直接给变更文件（测试）
npm run check:semantic-single-source --list                 # 打印语义源/契约清单
```

- 无可用 base（首推 / shallow clone）→ 跳过，不误伤。
- CI：`semantic-guard` job（**硬门禁**：无契约变更即红；纯重构加 trailer `[no-semantic-change]` 豁免）。无可用 diff base（首推/shallow）→ 脚本自行跳过。

## 与 CE-1 其他件的关系 / Related

- B1 向量语料 / B2 canonical 金样本（`generate --check` CI 漂移门）/ B3 wire Schema v1 冻结——本闸是其**流程侧**（谁先落），B1/B2/B3 是**产物侧**（落什么）。
- C2 术语单源（`check-protocol-language.mjs`）管**对外措辞**；本闸管**实现↔契约**。
- **评审清单（reviewer-facing，互补件）**：[semantic-change-checklist.md](semantic-change-checklist.md)——把本规则落成「语义面 → 须同步伴生物 → 门禁命令 → reviewer 勾选」的操作表；本文件是**规则真源**，清单是其操作面，二者不另立第二套表述。

## 口径 / Scope notes

- 语义源清单**保守**（高信号，宁少报）：清单外的实现改动不判红。扩展 = 在 `scripts/check-semantic-single-source.mjs` 的 `SEMANTIC_SOURCES` 加一行。
- 豁免 trailer 需在提交信息中**可见**（评审可复核；不提供静默绕过）。
