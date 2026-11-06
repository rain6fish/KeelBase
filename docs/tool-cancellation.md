# Tool Cancellation / 工具取消契约（AW-14）

> AW-18 answered *what a cancellation can do* (a per-tool classification). This slice answers *what a
> cancellation did*: the signal reaches the executor and the tools, a cancellation is recorded as a
> process (`requested` → `confirmed` / `unknown`), and the conclusion (`aborted` / `abandoned`) never
> claims a stop we did not observe.
>
> AW-18 回答的是「取消**能**把工具怎么样」（逐工具分类）。本切片回答「这次取消**做到了什么**」：
> 信号到达执行器与工具，取消被记成一个**过程**（`requested` → `confirmed` / `unknown`），结论
> （`aborted` / `abandoned`）绝不声称一个我们没有观察到的停止。

## 1. The signal path / 信号的路径

| 层 | 本切片做了什么 |
|---|---|
| 接口 | `AiTool.execute(args, userId, signal?)` —— **可选**第三参；61 个既有工具不改也能编译运行 |
| 注册表 | `ToolRegistry.execute(name, args, userId, signal?)` 原样转交 |
| 执行上下文 | `tools/tool-cancellation.ts` 的 `toolExecutionScope`（AsyncLocalStorage）：入口为这一轮开作用域，执行器在调用方没显式传 `opts.signal` 时读取它。**显式信号优先** |
| 入口 | WebSocket `ai:abort`（以及 socket 断开 / 新 `ai:chat` 顶掉旧流）中止这一轮的 `AbortController` |
| 执行器 | `executeRead` / `executeWrite` 把内部控制器的信号交给工具；控制器在**调用方中止**与**有界窗口到点**时触发 |
| 工具 | `query_events`（`yes`）、`create_event`（`unknown`）在动手前检查；`ProxyTool`（`no`）把信号交给 `proxyFetch` |

The executor owns an internal `AbortController` linked to the caller's signal. A tool therefore always
sees a signal that fires on both the caller's abort and the executor's bounded window — the tool does
not need to know which one fired.

执行器持有内部 `AbortController` 并接上调用方信号。于是工具看到的信号在**调用方中止**与**执行器有界
窗口到点**时都会触发 —— 工具不必知道是哪一种。

## 2. The three states and the conclusion / 三态与结论

| 取消状态 | 含义 | 可达分类 |
|---|---|---|
| `requested` | 已要求停下；对 `no` 工具来说，要求就是终点（要求停不下它） | `no` |
| `confirmed` | 请求之后工作**确实返回**了（失败也算返回：事实是「停了」，不是「成功了」） | `yes` |
| `unknown` | 停没停无法确认：`yes` 工具在确认窗口内没返回，或工具本身是 `unknown` | `yes`（未返回）· `unknown` |

结论只有一个判据：

```ts
reading = abortable === 'yes' && state === 'confirmed' ? 'aborted' : 'abandoned'
```

- `aborted` —— 工作已停；**不对停之前做过什么下断言**（局部写的事务回滚由事务边界保证）。
- `abandoned` —— 结局停在 `unknown`。读的人（或模型）不得把「我们停止等待」读成「它没有执行」。
- 确认窗口 `CANCELLATION_CONFIRM_WINDOW_MS = 500`：只用于 `yes` 工具，等它**真的返回**。声明「能停」
  不等于它停了。
- `unknown` 工具即使返回了，也只到 `unknown`：返回的是**我们这侧的等待**，不是目标侧的工作。

### 记进哪里 / Where it lands

- **不改协议字段**：审计 `outcome` 的冻结词表（`executed / pending / blocked / refused / declined /
  failed`）不变，被取消的调用仍记 `failed`（绝不记 `executed`）。
- 三态与结论写在既有 `errorMessage` 句子里（`cancellation requested` / `confirmed` / `unknown`），
  随 `tool_call` 行入账。
- 写路径：`aborted` ⇒ `releaseClaim(key, 'aborted')`（与 `execute_failed` 同口径，重试仍可用）；
  `abandoned` ⇒ **占位留 `claimed`**（结局未知，不释放 —— 释放等于邀请一次可能重复的写）。

## 3. Continuation warrant / 执行点之后的授权凭据边界

**The warrant: after the execution point, no further authorization re-check happens until the tool
returns. This slice does not shrink that window to zero; it gives cancellation as the only mid-flight
control, and makes the ledger say which of the two happened.**

**凭据边界：执行点之后、工具返回之前，不再复查授权。本切片不把这个窗口缩到零 —— 它把「取消」作为
在途唯一控制，并让账上如实说出两者中的哪一种发生了。**

- **Where the window starts** — the write path re-checks, at the execution point: `enabled` / role
  allow-list / feature flag (`assertToolAllowed`), declared field scope (`assertWithinDeclaredScope`),
  destination binding (AUTHZ-1), and the approval requirement (ACT-7). That is the last authorization
  decision for this call.
- **What the window covers** — one tool call: from the executor invoking `execute` until the tool
  returns (or the cancellation resolves). It is **not** the turn: the next tool call re-checks from
  scratch, and a revocation that lands mid-flight denies the *next* call.
- **What this slice guarantees inside the window** — a cancellation (user abort, socket loss, or the
  bounded window) is requested; a tool that can stop stops before its first mutation if it observes the
  signal; otherwise the ledger says `abandoned` / `unknown`, the claim stays `claimed`, and a late
  write that does land is recorded as a normal effect (so it can be revoked).
- **What it does not guarantee** — that a revoked user's in-flight call is *stopped*. For `no` /
  `unknown` tools it may complete. The compensation is the existing effect revocation, not a stop.
- **What a later addition must define** (not done here): real mid-flight re-check points (before each
  outbound call? before commit?), and the failure policy when the re-check cannot be answered
  (fail-closed = treat as cancelled; unanswerable = `unknown`, never "stopped"). Any such addition must
  upgrade this table rather than leave the warrant implicit.

**边界起点** —— 写路径在**执行点**复查：`enabled` / 角色白名单 / 特性开关（`assertToolAllowed`）、
声明的可写字段域（`assertWithinDeclaredScope`）、目的地绑定（AUTHZ-1）、审批要求（ACT-7）。这是这次
调用的最后一个授权决定。

**边界覆盖什么** —— 一次工具调用：从执行器调用 `execute` 到工具返回（或取消落定）。它**不是**整轮：
下一次工具调用从头再查，在途落下的撤权会拒绝**下一次**调用。

**本切片在窗口内保证什么** —— 取消（用户中止、连接断开、有界窗口）会被提出；观察信号且停得掉的
工具在第一次写之前停下；否则账上记 `abandoned` / `unknown`，占位留 `claimed`，真落下的迟到写照常
记成副作用（因此可撤）。

**本切片不保证什么** —— 被撤权用户的在途调用**被停掉**。`no` / `unknown` 工具可能跑完。补的是既有
的副作用撤销，不是停止。

**将来补做时必须定义的**（本轮不做）：真正的中途复查点（每次出站调用前？提交前？），以及复查得不到
答案时的失败政策（fail-closed = 当作已取消；答不上来 = `unknown`，绝不是「已停止」）。任何这样的补充
都应更新本节，而不是让凭据边界继续只存在于口头。

## 4. Coverage of this slice / 本切片的覆盖

**Covered / 已覆盖**

| 面 | 内容 |
|---|---|
| 接口与注册表 | `execute` 第三参可选；注册表转交；类型检查全仓通过 |
| 执行上下文 | `toolExecutionScope` + WS `ai:abort` / 断开 / 新流顶旧流 |
| 执行器 | `executeRead`、`executeWrite`（含无账本降级路径与外部写分支），三态判定与结论 |
| 工具（3 类代表） | `query_events`（本地读，`yes` ⇒ `aborted`）；`ProxyTool`（外部代理，`no` ⇒ `abandoned` / `requested`）；`create_event`（本地写，`unknown` ⇒ `abandoned` / `unknown`） |
| 出站中止 | `proxyFetch` 接受外部信号；调用方中止**不**被报成超时 |
| 账 | 审计 `errorMessage` 携带三态与结论；占位释放/保留按结论分派 |

**Not covered / 未覆盖（有意留给后续）**

- **其余 ~58 个工具**：不改也能编译运行；它们忽略信号，读数仍由分类决定（`yes` 的本地读在未返回时
  只会到 `unknown`，不会假报 `aborted`）。
- **外部 MCP `callTool`**：provider 接口不带信号 ⇒ 一律 `unknown` / `abandoned`。
- **SSE / HTTP 入口**：本切片只接 WS 的 `ai:abort`；SSE 客户端断开的控制器另做。
- **R4 审批重试路径**：没有入口作用域，也就没有信号；行为与今天一致（无取消）。
- **跨会话继任者重试同一逻辑外部动作**：幂等键仍含 `conversationId`，另一会话不会被拦 ——
  roadmap AW-14 的该项**未做**。
- **离线窗口到期路径**（`expireStale`）：另一件在做，不碰。
- **协议字段**：不新增；审计 `outcome` 词表不变。

## 5. How to re-check / 复核

```bash
cd Server-NestJS
npx jest src/ai/tools/tool-cancellation.spec.ts src/ai/tools/tool-abortability.spec.ts
npx tsc -p tsconfig.build.json --noEmit
```

Mutating `cancellationReading` to always return `'aborted'`, or making the executor report `confirmed`
without observing settlement, turns the corresponding cases red.

把 `cancellationReading` 改成恒返回 `'aborted'`，或让执行器在没有观察到返回时就报 `confirmed`，对应
用例会转红。
