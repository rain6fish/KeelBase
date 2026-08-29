# Gate 1：AI CRM Golden Application 一次跑通（2026-08-29T08-49-26-607Z）

- provider=`deepseek` model=`deepseek-v4-flash` ｜ 8/8 通过 ｜ 总耗时 17s

| # | 断言 | 结果 | 详情 |
|---|------|------|------|
| 1 | 登录（alex 工作台） | ✅ | 1s |
| 2 | Customer 数据就绪（seed） | ✅ | 8 客户，0s |
| 3 | AI 风险分析（读工具） | ✅ | 调用 query_customers, analyze_customer_risk，10s |
| 4 | 写任务（确认门控） | ✅ | 出现 confirmation_request(create_followup_task) 非静默执行，5s |
| 5 | 确认后写执行 | ✅ | approve 后创建成功 resultId=?，5s |
| 6 | 审计（决策轨迹） | ✅ | trace 含 tool_call + 确认记录，0s |
| 7 | 撤销（软删） | ✅ | effect #19 撤销后任务 #26 不在列表，1s |
| 8 | 时间盒 | ✅ | 总耗时 17s（< 30min） |
