# Application Protocol 2.0 · BLD 字段增量（`permission` / `sideEffect`）— 功能规格 (Spec) / Application Protocol 2.0 · BLD Field Increment (`permission` / `sideEffect`) — Functional Specification

> 版本 / Version: v0.1（草案 / Draft）
> 日期 / Date: 2026-10-07
> 状态 / Status: **规格定稿 · 未落码**（2026-10-07 用户拍定 `docs/protocol-2.0-bld-requirements.md` §6 的 **D-1** = **留作触发式**）—— 本规格即全部产出，落码待 §7 的触发条件成立，实施顺序见 §8
> 归属 / Home: Build 平面（§22.17 backlog 的 **BLD**；roadmap §2.1 P0-9 的 ⬜ 子项）
> 关联 / Related：`docs/module-protocol.md` §3.6（**已落地的四个字段**）｜`scripts/generator/schemas/module-spec.schema.json`｜`Server-NestJS/src/ai/interfaces/tool.interface.ts`

---

## 1. 概述 / 1. Overview

### 1.1 问题 / 1.1 Problem

生成模块的 AI 工具**已经**带着治理语义生成出来（风险级、确认、数据范围、PII 掩码），但其中**两条是写死的**，不由 spec 决定：

- **权限前置**：生成物恒定发射 `readonly permissions = { requireVerifiedEmail: true }`（`templates-ai.mjs:128`）——一个营销页模块与一个财务模块拿到的是同一条。
- **副作用档位**：生成工具**不声明** `revokeClass`；运行时在撤销时由实体元数据**推导**（有 `@DeleteDateColumn` ⇒ `local_compensate`，见 `templates-backend.mjs:270-276`）。

于是「安全生成进」在这两条上只做了一半：值是**生成的**，但**不是声明的**——spec 作者无法表达「这个模块的写不需要邮箱验证」或「这个模块的写不可撤销」。

### 1.2 目标 / 1.2 Goal

把这两条变成**可声明的协议键**，并让生成器**真的消费它**（发射进生成物，经既有运行时闸生效，不新建第二套）：

- `aiTools.create.permission` → 生成物的 `readonly permissions = { … }`
- `aiTools.create.sideEffect` → 生成物的 `readonly revokeClass = '…'`

### 1.3 非目标 / 1.3 Non-goals

- **不做角色 / 能力门**：协议**不表达授权变体**（`docs/module-protocol.md` §5 红线）。`permission` 只覆盖「调用前置条件」这一类既有语义，不把 CASL 能力搬进协议。
- **不新建撤销接线**：`AiTool` 已有 `revokeClass` 字段（`tool.interface.ts:233`，两处消费：`ToolRegistry.register` 的闸 + 工具元数据完备性闸）——本件只让它**可被生成**，不改运行时的判定。
- **不改既有生成物的行为**：不声明 ⇒ 与今天**逐字节相同**（§4）。
- **不覆盖**：`sideEffect` 只表达**档位**，不表达补偿端点 / 外部系统语义（那是外部集成线的事）。
- 不做 `scope` / `risk` / `confirmation` —— 那四个**已在**（`docs/module-protocol.md` §3.6）。

---

## 2. 数据形状 / 2. Data Shape

两个键都落在既有的 `aiTools.create` 对象上（`schemas/module-spec.schema.json`），**仅在 `create` 不是 `false` 时有意义**：

```jsonc
{
  "module": "contracts",
  "fields": [ { "name": "title", "type": "string", "label": "标题" } ],
  "aiTools": {
    "create": {
      "riskLevel": "R3",
      "requiresConfirmation": true,
      "permission": { "requireVerifiedEmail": false },   // ← 新增；缺省 = true
      "sideEffect": "local_compensate"                    // ← 新增；缺省 = 由实体推导
    }
  }
}
```

| 键 | 取值 | 缺省 | 语义 |
|---|---|---|---|
| `create.permission.requireVerifiedEmail` | `boolean` | `true` | 生成工具是否要求调用者邮箱已验证。**缺省即今天的写死值** |
| `create.sideEffect` | `"local_compensate"` \| `"none"` | 不发射（沿用推导） | 生成工具声明的副作用档位；`none` = 如实声明「这次写不可撤销」 |

- **形状约束**：`permission` 只认 `requireVerifiedEmail` 一个键（`additionalProperties: false`）——开口子给「以后加别的权限」正是 §15.4 禁的投机抽象；要加第三个键时按当时的真实需求再开。
- **`sideEffect: "none"` 的连带**：声明不可撤销时，生成实体**仍**保留 `@DeleteDateColumn`（软删是数据语义，不是撤销语义），只是工具**不再声称可撤销**——撤销路径据此如实回报「不可撤销」，而不是留一条假的完成态。

---

## 3. 生成器消费点 / 3. Generator Consumption Points

| 字段 | 落点（现状） | 改动 | 证据 |
|---|---|---|---|
| `permission` | `templates-ai.mjs:128` 写死 `readonly permissions = { requireVerifiedEmail: true };` | 改为按声明发射；缺省仍是 `true` ⇒ 未声明的 spec 产出不变 | `templates-ai.mjs:128` |
| `sideEffect` | 模板**从不**发射 `revokeClass`；运行时撤销时推导 | 声明时发射 `readonly revokeClass = '<值>';` | `tool.interface.ts:233`（字段已存在）；`templates-backend.mjs:270-276`（今天的推导路径） |

- **校验**：两个键加进 `schemas/module-spec.schema.json` 与 `validate.mjs` 的运行时校验（两者同源，见该 schema 的 `description`）。
- **一致性测试**：仓库已有「既有 spec 生成物逐字节不变」的锁定测试——本件的缺省路径必须让它继续绿。

---

## 4. 缺省与向后兼容 / 4. Defaults and Backward Compatibility

- **不声明 = 与今天逐字节相同**：`permission` 缺省 `true`、`sideEffect` 缺省不发射。既有 spec（`specs/*.json`）**一律不带**这两个键 ⇒ 生成物零变化。
- 这**不是**「向后兼容 shim」，是**缺省即既有语义**：两个键只表达「偏离缺省」。
- 校验器对**未知键**仍按今天的口径拒绝（`additionalProperties: false`）——不因为本件放松。

---

## 5. 判据（验收）/ 5. Acceptance Criteria

满足即算达成；**每条都要有可跑的断言**：

| # | 判据 | 怎么验 |
|---|---|---|
| A-1 | 声明 `permission.requireVerifiedEmail: false` ⇒ 生成物发射 `false` | 生成器单测：读产出文件文本断言 |
| A-2 | 不声明 ⇒ 发射 `true`（与今天**逐字节相同**） | 既有「生成物逐字节不变」测试保持绿 |
| A-3 | 声明 `sideEffect: "none"` ⇒ 生成物发射 `readonly revokeClass = 'none'` | 同上 |
| A-4 | 不声明 ⇒ **不发射** `revokeClass`（沿用推导） | 同上 |
| A-5 | 非法值被拒 | `validate.mjs` 单测：`sideEffect: "whatever"` / `permission: { role: "admin" }` 报错 |
| A-6 | 产出**真编译** | 生成一个带这两个声明的模块 → `tsc` / `flutter analyze` / `vue-tsc`（Taro 除外，见 §6） |

---

## 6. 边界与不做 / 6. Boundaries and Non-Goals

- **协议红线**（`docs/module-protocol.md` §5）：不表达关联查询、级联、复杂业务逻辑、**授权变体**。本件两个键都在红线内。
- **不做 Taro 侧**：Taro 的附件形状另有已登记缺陷（`templates-taro.mjs:22-23` 把 `attachment` 映射为 `'string'` 却不产 `<f>Names` 成员），与本件无关，不夹带。
- **不改运行时**：`ToolRegistry` / 撤销路径一行不动——若落码时发现需要改运行时，**停下重新裁**，那意味着本件的前提不成立。

---

## 7. 触发判据 / 7. When to Actually Land It

本件**不因「清单还差两项」而落码**（`protocol-2.0-bld-requirements.md` §3）。触发 = **出现一个真实的 spec** 需要二者之一：

- 有模块**必须**关掉邮箱验证（例如：面向内部系统调用的模块，其调用方本就没有邮箱概念）；或
- 有模块的写**必须**声明为不可撤销（例如：一次外呼 / 一条已发出的通知）。

在那之前，本规格与需求确认书**即为其全部产出**，落码留作触发式。

---

## 8. 实施顺序（若拍板落码）/ 8. If It Is Green-Lit

1. schema + `validate.mjs` 两个键（含非法值拒绝）；
2. `templates-ai.mjs` 两处发射（缺省分支先落地，跑既有逐字节测试应保持绿）；
3. 生成器单测 A-1…A-5；
4. 真实编译 A-6（`docs/module-protocol.md` 的「生成物真编译」步骤）；
5. `docs/module-protocol.md` §3.6 补两行 + roadmap BLD 行回填。

---

*本件与需求确认书 `docs/protocol-2.0-bld-requirements.md` 成对；按 `CLAUDE.md` §11.3，两者齐备才进入编码阶段。*
