# 响应排序声明 / Response Ordering Declaration

> 状态：v1.3.1 落地（`@ResponseOrdering`）。契约：`api-response` **v2**（`ordering` 字段为加性新增）。
> Status: shipped in v1.3.1 (`@ResponseOrdering`). Contract: `api-response` **v2** (the `ordering` field is additive).

## 1. 问题 / The problem

一页结果不告诉读者它是按什么顺序产生的。一个面按 `id` 走行，下一个按时间列；拿着其中任一页的客户端分不出
这是时间线还是一页任意结果，也分不出同一请求重发两次会不会得到同一批行。

A page says nothing about what produced its order. One surface walks rows by `id`, the next lists them by
a timestamp; a client holding either cannot tell a timeline from an arbitrary page — nor whether the same
request twice returns the same rows.

## 2. 形状 / The shape

响应信封携带 `ordering`，由端点上的 `@ResponseOrdering(...)` 声明、`ResponseInterceptor` 写入：

```json
{
  "code": 200,
  "data": { "...": "..." },
  "ordering": {
    "field": "createdAt",
    "direction": "desc",
    "controlledBy": "receiver",
    "tiebreak": { "field": "id", "direction": "desc" },
    "attested": "none"
  },
  "timestamp": "2026-11-07T00:00:00Z"
}
```

| 字段 | 含义 |
|---|---|
| `field` / `direction` | 这次查询**真正**应用的排序。 |
| `controlledBy` | `producer` = 产出方决定位置；`receiver` = 接收方（读侧）决定。 |
| `tiebreak` | 并列时用来决序的第二键；`null` = **并列无序**，分页成员随之不确定。 |
| `attested` | 位置是否被审计哈希链覆盖：`chain`（如按 `id` 升序，被 `prevHash` 绑定）/ `none`。 |

## 3. 规则 / Rules

- **声明必须描述查询真正执行的东西。** 查不到就别声明 ——「宁可缺，也不要写一份替不存在的保证背书的说明」。
- **偏移分页必须有序可依。** 同一时间戳并列时，两次相同请求的切分可能不同，行会重复或消失；因此分页的读要么
  给出 `tiebreak`，要么不提供偏移分页。
- **`attested: none` 要如实写。** 一个由服务端打戳、且该列不在哈希载荷里的排序，读者无从判断位置是否被事后
  改过 —— 声明就把这件事说出来，而不是借用别的读面上的 `chain`。

- **The declaration must describe what the query actually executes.** A declaration that describes an
  order the query does not apply is worse than none.
- **Offset paging needs a total order.** Rows stamped in the same instant can otherwise split differently
  between two identical requests, so a row repeats or vanishes; a paged read either names a `tiebreak`
  or does not offer offset paging.
- **`attested: none` is stated, not papered over.** When the sort column sits outside the hash payload, a
  reader cannot tell whether a position was rewritten afterwards — the declaration says so instead of
  borrowing another surface's `chain`.

## 4. 现状 / Current surfaces

`GET /api/v1/audit/logs`（`createdAt` desc，`id` 决序，`none`）· `GET /api/v1/audit/verify`（`id` asc，
`chain`）· `GET /api/v1/audit/action-report`（`createdAt` desc，**无** tie-break —— 如实声明 `null`）·
`GET /api/v1/ai/tool-effects/claims` 与 `.../claims/:id/lookups`（各自声明的顺序）。

## 5. 相关文档 / Related

- [protocol-models.md](protocol-models.md)（三模型协议）
- [hs11-audit-chain.spec.md](hs11-audit-chain.spec.md)（链上位置为何能「被证明」）
