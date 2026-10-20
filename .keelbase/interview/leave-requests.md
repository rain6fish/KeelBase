# leave-requests interview record (simulated customer: a ~60-person services company)

> English summary first, then the full Chinese interview record.
> This is a **simulated** interview Evidence file, not a real customer transcript. It exists so the
> Business Spec's `evidenceRef` is a live link, and so the decisions that the thin protocol cannot
> express are written down rather than guessed at later.
> English summary: a ~60-person services company runs leave requests through chat messages and a
> shared spreadsheet. Employees ask HR how many days they have left and whether a request was
> approved; HR re-keys each request and sometimes loses one. The template therefore models **one
> leave request** (request number, leave type, start/end date, days, reason, status). A single actor
> (the employee) owns the rows. The AI gets one read tool and one write tool; the write is R3 and
> requires human confirmation. The approval workflow itself — who may approve, which status
> transitions are legal, notifications — is declared out-of-protocol and is **not** implemented by
> the generated template. The `status` field is stored as shape only.

---

# leave-requests 访谈记录（拟真客户：某约 60 人的服务公司）

> **这是拟真项目的访谈 Evidence**（不是真实客户实录）——按 [keelbase-discovery](../../.claude/skills/keelbase-discovery/SKILL.md)
> 的产出去写，作为 [Business Spec](../business-spec/leave-requests.json) 的 `evidenceRef` 指向。
> 真实项目里本文件由访谈过程逐轮追加，每轮的假设、用户原话与确认都保留。

## 场景

一家约 60 人的服务公司没有正式的 OA 系统：请假靠微信跟主管说、HR 再用 Excel 记。
痛点：**员工问「我那张单批了没有」要翻聊天记录**、**HR 重复录入还漏过单**、**月底统计天数对不上**。
公司想要的不是一套审批引擎，而是**先把每张请假单留痕、查得回来**。

## 轮次

### Q1 谁真正用这个功能？他一天里什么时候会用？

- 我的假设（GUESS）：普通员工；请假前提交，批了之后想查。
- 回答要点：员工自己提；HR 偶尔帮人补录，但主要还是要员工自己提。
- 结论：**Actor = 员工（本人）**。审批人/HR 查看他人单据本轮**不纳入**（进 `outOfScope`）——薄协议固定「本人数据」所有权。

### Q2 围绕哪个业务对象？它需要记住哪些信息？

- 我的假设（GUESS）：一张「请假申请单」，要记类型、起止日期、天数。
- 回答要点：要有**申请单号**（HR 对账用）；记**请假类型**（年假/病假/事假/其他）；记**开始和结束日期**；
  记**天数**；记**事由**（病假通常要写）；还要能看出**现在是什么状态**（待批/已批/已驳回）。
- 结论：**Object = 请假申请**，字段 `requestNo`(string) / `leaveType`(enum: annual,sick,personal,other) /
  `startDate`(date) / `endDate`(date) / `days`(int) / `reason`(text) / `status`(enum: pending,approved,rejected)。

### Q3 现在这个判断靠什么做的？为什么难？

- 我的假设（GUESS）：靠微信聊天记录 + HR 的 Excel。
- 回答要点：聊天记录搜不动；HR 经常重复录入；月底统计要再核一遍；「到底批没批」没有单一答案。
- 结论：真正要的是「**每一张单都留痕、查得回来**」，不是一套多级审批流程图。流程图只是 his want。

### Q4 有哪些「必须」「不能」「只允许」？

- 回答要点：天数不能是 0 或负数；开始日期不能晚于结束日期；状态只能从待批变成已批或已驳回，
  而且**只有审批人能改**，员工自己不能把自己的单改成已批。
- 结论：**Rule 1** `days > 0`；**Rule 2** `startDate <= endDate`；**Rule 3** 状态只能按
  `pending → approved / rejected` 流转且仅审批人可改。→ 三条都超出薄协议，映射器会如实列进
  `unmapped[]`，由服务层手写 + 单测覆盖。**本轮模板不做这三条**。

### Q5 做成之后，什么变了？怎么量？

- 回答要点：员工一句话就能提交一张请假单，提交前系统问一声；查自己的单，一句话就出来。
- 结论：**Goal = 让员工用一句话提交请假申请，并能随时查回自己提交过的请假单**。

### Q6 什么算做完了？

- 回答要点：能查自己的单；提交要确认；状态流转与日期/天数规则由后续服务层保证；提错了能撤。
- 结论：**Acceptance** 四条（见 Business Spec `acceptance[]`）。其中 Rule 1/2/3 是手写项，模板只保证其余三项。

### Q7 哪些事希望 AI 代做？读还是写？写要不要人确认？

- 我的假设（GUESS）：查自己的单；提交一张单。
- 回答要点：查随便查；提交要看一眼再落库（日期或天数填错过）；提错了要能撤。
- 结论：**aiCapabilities**：read（查询我的请假申请）+ write（提交一笔请假申请，R3，需人工确认）。

### Q8 为什么不建审批流引擎（多级、会签、转办）？

- 回答要点：现在连一级审批都没有系统化；先解决「单子不丢、查得到」，流程以后再说。
- 结论：**Decision：不建审批流引擎**。谁有权批、状态何时能改、驳回要不要理由，都是规则而不是对象形状，
  进 `unmapped[]` 与 `outOfScope`。

### Q9 状态为什么要放进字段，又为什么是可选？

- 我的假设（GUESS）：状态如果不放字段，单据就看不出处在哪一步。
- 回答要点：要能看出待批/已批/已驳回；但员工提交时不该自己填状态。
- 结论：**Decision：`status` 作为可选 enum 落地，默认 pending**。模块只**存**状态形状，
  **不强制**流转规则——这正是 Rule 3 留在 `unmapped[]` 的原因。

### Q10 和系统里已有的「AI 审批」是一回事吗？

- 回答要点：不是。已有的审批是 AI 动作要不要人批（治理审批）；这里批的是员工的请假单（业务单据）。
- 结论：**两者不合并**。既有 `approval` 模块是 AI 治理审批；本模板生成 `leave_requests`，是业务单据，
  名字与表都分开，避免把治理审批与业务审批混成一层。
