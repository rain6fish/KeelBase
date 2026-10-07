# Application Protocol 2.0 · BLD 字段增量（`permission` / `sideEffect`）— 需求确认书 / Application Protocol 2.0 · BLD Field Increment (`permission` / `sideEffect`) — Requirements

> 版本 / Version: v1.0（需求确认 / Requirements）
> 日期 / Date: 2026-10-07
> 状态 / Status: **需求已核；落码已拍 = 留作触发式**（2026-10-07 用户，见 §6 **D-1**）；规格见 `docs/protocol-2.0-bld.spec.md`
> 归属 / Home: Build 平面 —— §22.17 backlog 的 **BLD** 项，roadmap §2.1 P0-9 的 ⬜ 子项
> 关联 / Related：`docs/module-protocol.md` §3.6（**已落地的那一半**）｜ `scripts/generator/schemas/module-spec.schema.json`｜`docs/protocol-trust-proof-card.spec.md:29`

---

## 1. 要解决的问题 / 1. The Problem

BLD 的原始表述（§22.17 backlog）：**「协议加 permission / scope / tool / risk / sideEffect / confirmation 字段，验收 = AI 生成真正消费它（打通 Build→Run 同一契约；安全『生成进』而非『后贴』）」**。

即：一个模块的 AI 工具**带着治理语义被生成出来**，而不是先生成、再由人在运行时外挂。这份需求书只回答一件事——**那六个字段里还没落的部分，今天需不需要落**。

## 2. 现状核实 / 2. Where It Actually Stands

按本仓口径（**读代码 + `git log`，不凭表上表面状态**）逐项核到 2026-10-07：

| BLD 点名的字段 | 协议里有没有 | 生成器消费了吗 | 证据 |
|---|---|---|---|
| `scope` | ✅ 有 | ✅ 消费 | `schemas/module-spec.schema.json` 的 `scope`（`org` / `dept`）；`templates-backend.mjs` 据此生成 `orgId` / `deptId`；`docs/module-protocol.md` §3.2 |
| `tool` | ✅ 有 | ✅ 消费 | `aiTools.enabled` / `query` / `create`（`templates-ai.mjs` 按声明开关工具）；§3.6 |
| `risk` | ✅ 有 | ✅ 消费 | `aiTools.{query,create}.riskLevel`；`templates-ai.mjs:15-17`（缺省 R3）与 `:47`（query） |
| `confirmation` | ✅ 有 | ✅ 消费 | `aiTools.create.requiresConfirmation`；`templates-ai.mjs:17`（缺省 R3/R4 为真）+ `:128` 发射到工具类 |
| `permission` | ❌ **不是协议字段** | ⚠️ **写死** | 生成物恒定发射 `readonly permissions = { requireVerifiedEmail: true }`（`templates-ai.mjs:128`），**不由 spec 决定** |
| `sideEffect` | ❌ **不是协议字段** | ⚠️ **推导** | 生成实体的 `@DeleteDateColumn`（`templates-backend.mjs:270-276`）使 `revokeClass` 被运行时判为 `local_compensate`；spec 里**没有**可声明的写工具副作用档位 |

**结论**：**六项里四项已落**，BLD 的**目标**（安全生成进、Build→Run 同一契约）在已落部分上**是成立的**。未落的是 `permission` 与 `sideEffect` —— 两者今天都**不是协议字段**。

## 3. 需求依据 / 3. Is There a Requirement

协议红线（`docs/module-protocol.md` §5）要求每个字段先过一问：**「AI 不生成它行不行？」** —— 能手写就手写，协议厚了会变成低代码平台。

据此逐问：

- **`permission`**：今天生成物**已经**带着权限前置（`requireVerifiedEmail`），只是值**写死在模板里**。把它变成可声明的字段，收益 = 让个别模块能改这一条；**风险 = 交给 spec 一个安全开关**（关掉邮箱验证是**放宽**，需要理由）。今天**没有任何已检入的 spec 需要它**。
- **`sideEffect`**：今天生成物**已经**可撤销（软删 → `local_compensate`），档位由实体元数据**推导**得出、且**只有一个可能取值**。声明它的收益 = 允许某个模块**声明自己不可撤销**；今天同样**没有消费方**。

⇒ **如实结论**：按红线与 §15.4（禁投机抽象），**这两个字段今天都不该加**——它们没有需求依据，只是「BLD 的字段清单还差两项」这个形式上的空缺。

## 4. 那 BLD 缺的到底是什么 / 4. What BLD Is Actually Missing

不是两个字段，而是**一条约束**：BLD 的字段清单写于 2026-09-04，此后 `scope` / `tool` / `risk` / `confirmation` 由 P0-9b 与 §3.6 陆续落地，**但表未回填**——于是清单里那两项至今显示为「未做」，看起来像欠账。这正是本仓四次误用过的那个形状：**实现已超前、表未回填**。

## 5. 结论 / 5. Conclusion

1. **BLD 的目标已由已落部分满足**；`permission` / `sideEffect` 两项**不构成缺口**，而是**未被任何 spec 需要的可配置性**。
2. 若要开闸，**判据不是「清单还差两项」，而是「出现一个真实的 spec 需要这两者之一」** —— 具体形状见规格文档 §7。
3. 用户 **2026-10-07 指令「就 P0-9」「开 BLD：先写规格」** ⇒ 本件按「**开闸、先出规格**」执行：规格把两个字段的**语义、最小形态与验收**定下来。**落码与否**随后由用户拍定 —— **结论 = 留作触发式**（§6 **D-1**）：规格与需求书**即本件的全部产出**，落码待规格 §7 的触发条件成立。

## 6. 待拍板 / 6. Decisions Needed

| # | 决定 | 选项 | 影响 |
|---|---|---|---|
| D-1 | 这两个字段**现在落码**吗 | (a) 落（按规格 §3 的消费点）｜(b) **只出规格、留作触发式**（第一个真实 spec 需要时再落） | (a) 会向协议引入两个今天无人读的键，撞 §15.4；(b) 记录与规格都在，随时可落。**✅ 已拍（2026-10-07，用户）：取 (b) 留作触发式** —— 触发条件写死在规格 §7；规格 §8 的实施顺序原样保留备用 |
| D-2 | 若落，`permission` 的取值面 | (a) 只暴露 `requireVerifiedEmail`｜(b) 另加角色门 | (b) 等于把授权表达搬进协议，撞 §5 红线「权限变体不写协议」，**不建议** |
| D-3 | 若落，`sideEffect` 的可声明档位 | (a) 只允许「声明不可撤销」这一种收窄｜(b) 允许声明任意档位 | (b) 需要 spec 声明一个运行时另算的值，两处真源 |

---

*本件与规格 `docs/protocol-2.0-bld.spec.md` 成对；按 `CLAUDE.md` §11.3，两者齐备才进入编码阶段。*
