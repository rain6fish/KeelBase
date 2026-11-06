# Tool Abortability / 工具可中止性（AW-18）

> 61 个工具同一签名 `execute(args, userId)`：对下游来说，「取消信号能停掉工作」与「信号只停我们的等待、
> SDK 调用仍在跑」长得一模一样。没有这个分类，任何取消都只能记成一个含糊的字。本文件是分类的**单一说明面**：
> 取值、判定顺序、按文件的例外表，以及执行器由此得到的两态读数。
>
> Every tool shares one signature, `execute(args, userId)`, so downstream could not tell "the signal
> stops the work" from "the signal stops only our wait while the SDK call keeps running". Without
> that classification a cancellation can only be recorded as one vague word. This file is the single
> explanation surface: the values, the resolution order, the per-file exception table, and the two
> readings the executor derives from it.

## 1. 三种取值 / Three values

| 取值 | 含义 | 取消后账上记 | 能否断言结局 |
|---|---|---|---|
| `yes` | 信号停的是**工作本身** | `aborted`（还需取消已确认） | 工作已停；不断言停之前做过什么 |
| `no` | 信号停不掉工作（出站调用、子进程） | `abandoned` | 不能 —— 停在 `unknown` |
| `unknown` | 说不准工作会不会停 | `abandoned` | 不能 —— 停在 `unknown` |

- 字段是 `AiTool.abortable`（`src/ai/interfaces/tool.interface.ts`），**仅服务端关切，不暴露给 LLM**。
- **未声明不等于 `yes`**：按第 2 节的规则判定 —— 本地进程内的读是 `yes`，其余（含所有本地写）是
  `unknown`。沉默绝不读成「停得掉」：把停不掉的东西说成 `yes`，正是这个字段要消灭的那种假读数。
- 不新增协议字段：`aborted` / `abandoned` 落在既有的**占位行 / 副作用账**形状上，审计 `outcome` 的冻结词表不变。

## 2. 判定顺序 / Resolution order

`src/ai/tools/tool-abortability.ts` 的 `resolveAbortability` + 执行器的 `abortabilityOf`：

1. **显式声明优先** —— 工具类上的 `abortable`。
2. **外部 MCP 工具 ⇒ `unknown`** —— provider 的行为不在我们手里（执行器先判 `isExternalTool`）。
3. **本地进程内的读（R0/R1、无需确认）⇒ `yes`** —— 它要么已经做完、要么从未开始，不留下还能继续
   改变状态的东西。
4. **其余 ⇒ `unknown`** —— 本地写、未声明的代理/外部工具、查不到的工具名。

## 3. 按文件的分类清单 / Per-file classification

规则覆盖的（不在下表里的文件，按第 2 节规则判定）：

- `src/ai/tools/*.tool.ts` 中，除下表所列者：**读工具（R0/R1、无 `requiresConfirmation`）⇒ `yes`；
  写工具 ⇒ `unknown`**。
- `src/ai/proxy/proxy-tool.ts`（B 路径代理工具）：显式 `abortable = 'no'` —— 出站 HTTP。AW-14 起
  `proxyFetch` 会随调用方信号中止**我们这侧的请求**，但写的目标侧效果无法确认，故分类仍是 `no`。
- 外部 MCP 工具（名字形如 `mcp_<server>_<tool>`，运行期注册）：`unknown`。

例外表 / Exceptions —— 类别规则会判错的文件，逐个显式声明：

| 文件 | 工具 | 声明 | 理由 |
|---|---|---|---|
| `src/ai/tools/web-search.tool.ts` | `web_search` | `no` | 出站 HTTP 到搜索服务商 |
| `src/ai/tools/generate-image.tool.ts` | `generate_image` | `no` | 出站 HTTP 到 provider 的 images 端点 |
| `src/ai/tools/summarize-customer.tool.ts` | `summarize_customer_360` | `no` | 出站 LLM 生成 |
| `src/ai/tools/analyze-sales-pipeline.tool.ts` | `analyze_sales_pipeline` | `no` | 出站 LLM 生成 |
| `src/ai/tools/create-module.tool.ts` | `create_module` | `unknown` | 以子进程跑生成器，信号停不掉（且是 R1 读，类别规则会说成 `yes`） |
| `src/ai/tools/create-module-apply.tool.ts` | `create_module_apply` | `unknown` | 同上（写工具的类别默认已是 `unknown`，此处显式声明以便复核） |

复核方式 / How to re-check:

```bash
# 已有显式声明的文件
grep -rn "readonly abortable" Server-NestJS/src/ai
# 例外表是否仍与声明一致、类别规则是否仍给出预期值 —— 由用例钉住
npx jest src/ai/tools/tool-abortability.spec.ts
```

`tool-abortability.spec.ts` 直接实例化上述真实工具类并断言其分类：**删掉某条声明（例如
`WebSearchTool.abortable = 'no'`）会让对应用例变红**，而不是静默退回 `yes`。

## 4. 执行器的判据 / What the executor does with it

`ToolExecutionService.executeRead / executeWrite` 接受可选的 `signal?: AbortSignal`，调用方没给时读
入口开的执行作用域（AW-14）。工具签名另有**可选**第三参 `execute(args, userId, signal?)`：既有工具
不改也能编译运行，停得掉的工具应当观察它。

- `yes` + 信号：停止等待；**取消得到确认（工具真的返回）**才记 `aborted`。写路径**释放占位**（工作已停、
  事务未提交），与 `execute_failed` 同口径，重试仍然可用。
- `yes` + 信号但工具没返回：确认窗口到点 ⇒ `unknown` ⇒ `abandoned`。**声明「能停」不等于它停了。**
- `no` / `unknown` + 信号或**窗口到点**：停止等待，读数 `abandoned`，句子明说「结果未知（unknown）」。
  写路径**不释放占位**（占位留 `claimed` = 结局未知）：释放等于允许重试，也就等于邀请一次可能重复的写。
- **有界窗口**：`no` / `unknown` 的调用最多等 `NON_ABORTABLE_TOOL_WINDOW_MS = 60_000`（60 秒）。窗口
  取值有意放宽：被放弃是一次醒目读数，只该在真的卡住时触发。外部写另有自己的 `PROXY_FETCH_TIMEOUT_MS`。
- 中止后**从不报成功**；被放弃的那个 promise 挂一个吞错处理（不让它冒成未处理拒绝），但**不拿它去落定
  占位** —— 我们不再看之后它做了什么，那正是我们不知道的部分。

取消三态（`requested` / `confirmed` / `unknown`）、`continuation warrant` 与本切片的覆盖清单见
[docs/tool-cancellation.md](tool-cancellation.md)。

## 5. 已知边界 / Known limits

- **信号只接进了本切片覆盖的工具**（AW-14 第一片）：`query_events`、`create_event`、`ProxyTool`。其余
  工具照旧忽略信号，读数仍由分类决定 —— 忽略信号的 `yes` 工具在未返回时只会到 `unknown`，不会假报
  `aborted`。全量接入见 [docs/tool-cancellation.md](tool-cancellation.md) §4。
- **`yes` 不含「停之前已做了什么」**：它只说工作停了。局部写的事务回滚由事务边界保证，不在本字段的
  断言里。
- **类别规则对「新增的本地读」默认 `yes`**：新工具若会离开本进程（HTTP / SDK / 子进程），**必须**按
  第 2 节声明 `no` / `unknown`；漏声明的代价由这条规则承担，而不是靠猜。
- **本项不改 `ai.service.ts` 的超时读数**（另一件在做），也不改契约 / 协议字段。
