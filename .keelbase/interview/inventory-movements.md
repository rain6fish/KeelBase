# inventory-movements interview record (simulated customer: a small wholesaler)

> English summary first, then the full Chinese interview record.
> This is a **simulated** interview Evidence file, not a real customer transcript. It exists so the
> Business Spec's `evidenceRef` is a live link, and so the decisions that the thin protocol cannot
> express are written down rather than guessed at later.
> English summary: a ~20-person wholesaler keeps stock in one warehouse. Goods come in from suppliers
> and go out to shops; today the keeper writes each movement into a spreadsheet, so "what came in and
> what went out for this SKU" takes minutes to answer and duplicate document numbers go unnoticed.
> The template therefore models **one stock movement** (document number, SKU, item name, direction,
> quantity, unit, counterparty, business date, note). A single actor (the keeper) owns the rows. The
> AI gets one read tool and one write tool; the write is R3 and requires human confirmation. Three
> business rules (positive quantity, no over-issue, unique document number) are declared
> out-of-protocol and are **not** implemented by the generated template.

---

# inventory-movements 访谈记录（拟真客户：某小型批发商）

> **这是拟真项目的访谈 Evidence**（不是真实客户实录）——按 [keelbase-discovery](../../.claude/skills/keelbase-discovery/SKILL.md)
> 的产出去写，作为 [Business Spec](../business-spec/inventory-movements.json) 的 `evidenceRef` 指向。
> 真实项目里本文件由访谈过程逐轮追加，每轮的假设、用户原话与确认都保留。

## 场景

一家约 20 人的批发商，只有一个仓。货从供应商进来、发给下游门店；仓管每天用 Excel 记「今天进了什么、出了什么」。
痛点：**同一张单据被记两遍**、**问「这个 SKU 最近进出多少」要翻半天表**、**谁改过哪一行说不清**。

## 轮次

### Q1 谁真正用这个功能？他一天里什么时候会用？

- 我的假设（GUESS）：仓管本人；每天收货、发货时各记一次。
- 回答要点：就一个人管仓，收货和发货都经他的手；老板偶尔要看，但不直接录。
- 结论：**Actor = 仓管（本人）**。多仓/多人全局台账本轮**不纳入**（进 `outOfScope`）——薄协议固定「本人数据」所有权。

### Q2 围绕哪个业务对象？它需要记住哪些信息？

- 我的假设（GUESS）：一条「出入库流水」，要记货、方向、数量。
- 回答要点：要记**单据号**（供应商送货单或发货单上的号）；记**商品编码和名称**（编码对账用，名称给人看）；
  记**方向**（进还是出）；记**数量**和**单位**；记**往来单位**（供应商或门店）；记**业务日期**；备注可选。
- 结论：**Object = 库存出入库**，字段 `documentNo`(string) / `sku`(string) / `itemName`(string) /
  `direction`(enum: in,out) / `quantity`(int) / `unit`(string) / `partner`(string) / `occurredAt`(date) / `note`(text)。

### Q3 现在这个判断靠什么做的？为什么难？

- 我的假设（GUESS）：靠 Excel + 仓管的记性。
- 回答要点：Excel 里同一张单据经常记两遍，月底对不上；SKU 一多，查某件货的进出要手工筛。
- 结论：真正要的是「**每一笔进出都留痕、查得回来**」，不是再要一张更漂亮的表。表格只是 his want。

### Q4 有哪些「必须」「不能」「只允许」？

- 回答要点：数量不能是 0 或负数；出库不能超过库里现有的数；同一张单据号不能登记两次。
- 结论：**Rule 1** `quantity > 0`；**Rule 2** 出库数量不得超过该 `sku` 当前余额；**Rule 3** `documentNo` 唯一。
  → 三条都超出薄协议，映射器会如实列进 `unmapped[]`，由服务层手写 + 单测覆盖。**本轮模板不做这三条**。

### Q5 做成之后，什么变了？怎么量？

- 回答要点：仓管一句话就能登记一笔进出，登记前系统问一声；查某件货最近进出，一句话就出来。
- 结论：**Goal = 让仓管用一句话登记商品出入库，并能随时查回某件商品的进出记录**。

### Q6 什么算做完了？

- 回答要点：能查某件商品的进出；登记要确认；重复单据号被挡；登错了能撤。
- 结论：**Acceptance** 四条（见 Business Spec `acceptance[]`）。前三项中的 Rule 3 是手写项，模板只保证其余三项。

### Q7 哪些事希望 AI 代做？读还是写？写要不要人确认？

- 我的假设（GUESS）：查自己的流水；登记一笔进出。
- 回答要点：查随便查；登记要问一声再落库（看错方向或数量的事出过）；登错了要能撤。
- 结论：**aiCapabilities**：read（查询我的出入库记录）+ write（登记一笔库存出入库，R3，需人工确认）。

### Q8 为什么不把入库、出库做成两个模块？

- 回答要点：字段完全一样，拆开反而要维护两套页面和两条 AI 工具；方向只是这一条流水的一个属性。
- 结论：**Decision：同一个对象上用 `direction=in/out` 区分**。

### Q9 库存余额怎么办？

- 我的假设（GUESS）：再建一张余额表，出库时扣减。
- 回答要点：现在 Excel 也没有余额表，都是月底手工汇总；先别把并发扣减引进来。
- 结论：**Decision：本轮不建余额表**，余额由流水按 `sku` 汇总；进 `outOfScope`，避免把「记账」误当成「库存引擎」。
