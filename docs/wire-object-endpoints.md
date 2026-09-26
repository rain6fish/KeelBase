# Wire object → endpoint (the reference implementation) / 对象 → 端点（参照实现）

## English

The scenario packs' `replay` asserts about **wire objects**, not paths — a `call` names an object or a
tool, and each runtime maps that to its own surface. This is **the reference implementation's answer to
that mapping**, written down so a third party can run the corpus against it without reverse-engineering
the mapping out of `test/scenario-replay.e2e-spec.ts`, and so that **an object a runtime does not
expose** can be told apart from **a mapping that is wrong**. (Two carriers replaying the same corpus is
what surfaced the need: see `docs/protocols/conformance-profile.md` §2.4.)

| wire object | the reference's surface | notes |
|---|---|---|
| `audit-chain-verification` | `GET /api/v1/audit/verify` | gated behind `manage all` — which is why the corpus's audit step names an administrator |
| `permission-decision` | `POST /api/v1/auth/permissions/explain` | `{action, subject}` in, the frozen decision out |
| `evidence-package` | `GET /api/v1/ai/governance/evidence-root/:resultType/:resultId` | the exported root *is* the package |
| `side-effect-revoke` — the governance view | `GET /api/v1/ai/governance/action/:resultType/:resultId` | read back from a business action |
| `side-effect-revoke` — an effect | `GET /api/v1/ai/my/tool-effects` | the caller's own effects |
| `side-effect-revoke` — revoke result | `DELETE /api/v1/ai/my/tool-effects/:id` | a non-owner gets 404, which the corpus reads as `expect: null` |
| `tool-invocation` | `ToolExposureService.executeToolForExternal` | the governed entry; its transports are `POST /api/v1/mcp` (`tools/call`) and the chat shapes |
| `my-confirmation-item` | `GET /api/v1/ai/my/confirmations` | the "waiting on me" list |
| `confirmation-decision` | the `confirmation_decision` event on `POST /api/v1/ai/chat/stream` | **stream-carried**: `POST /api/v1/ai/confirmations/:token` answers `{ok, trustTool}`, and the corpus does not assert this object at all (§2.4) |
| `permission-capability-list` | `GET /api/v1/auth/me/permissions` | what this identity may do, and on what basis |
| `capabilities` · `app-provenance` · `app-readiness` · `app-version` | `GET /api/v1/app/capabilities` · `/app/provenance` · `/app/readiness` · `/app/version` | |

**Every object the corpus currently asserts about is served here.** The entries this implementation
cannot serve are the ones the corpus moved out by ruling — the confirmation flow, and
`security-showcase`'s runtime-specific endpoint — not mapping gaps.

**Scope.** The table covers the objects the corpus asserts about, deliberately not the whole registry: a
row means "the corpus may name this and the reference answers it", and a missing row means it does not.

## 中文

场景包的 `replay` 断言的是 **wire 对象**、不是路径——`call` 点名一个对象或一件工具，各 Runtime 自己把它映射到
自己的面。**本文件是参照实现对这个映射的回答**，写下来的目的是：第三方不必从 `test/scenario-replay.e2e-spec.ts`
里**逆推**映射就能在它上面跑这份语料，并且**「某个 Runtime 没暴露该对象」与「映射写错了」**能分得开。（**两载体
跑同一份语料**才让这个需要现形：见 `docs/protocols/conformance-profile.md` §2.4。）

| wire 对象 | 参照实现的面 | 备注 |
|---|---|---|
| `audit-chain-verification` | `GET /api/v1/audit/verify` | 卡在 `manage all` 之后——**这正是**语料那一步点名管理员的原因 |
| `permission-decision` | `POST /api/v1/auth/permissions/explain` | 入参 `{action, subject}`，出参是冻结决策 |
| `evidence-package` | `GET /api/v1/ai/governance/evidence-root/:resultType/:resultId` | 导出的根**就是**那个包 |
| `side-effect-revoke` — 治理视图 | `GET /api/v1/ai/governance/action/:resultType/:resultId` | 由业务动作反查 |
| `side-effect-revoke` — 一条副作用 | `GET /api/v1/ai/my/tool-effects` | 调用者本人的副作用 |
| `side-effect-revoke` — 撤销结果 | `DELETE /api/v1/ai/my/tool-effects/:id` | 非本人得 404，语料把它读作 `expect: null` |
| `tool-invocation` | `ToolExposureService.executeToolForExternal` | 受治理的入口；它的传输是 `POST /api/v1/mcp`（`tools/call`）与对话两种形状 |
| `my-confirmation-item` | `GET /api/v1/ai/my/confirmations` | 「待我确认」列表 |
| `confirmation-decision` | `POST /api/v1/ai/chat/stream` 上的 `confirmation_decision` 事件 | **流承载**：`POST /api/v1/ai/confirmations/:token` 只答 `{ok, trustTool}`，而**语料根本不断言这个对象**（§2.4） |
| `permission-capability-list` | `GET /api/v1/auth/me/permissions` | 这个身份能做什么、依据是什么 |
| `capabilities` · `app-provenance` · `app-readiness` · `app-version` | `GET /api/v1/app/capabilities` · `/app/provenance` · `/app/readiness` · `/app/version` | |

**语料当前断言到的对象，这里全部答得出来。** 本实现服务不了的条目，是**裁定移出语料**的那些——确认流程、
以及 `security-showcase` 的运行时特有端点——**不是映射缺口**。

**范围**：本表覆盖**语料断言到的**对象，**有意不是**整个 registry：**有行** = 语料可能点名它、参照实现答得出来；
**无行** = 本实现不暴露它。
