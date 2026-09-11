# Gate 1：AI CRM Golden Application 一次跑通（2026-08-21T04-13-45-289Z）

- provider=`deepseek` model=`deepseek-v4-flash` ｜ 8/8 通过 ｜ 总耗时 18s

| # | 断言 | 结果 | 详情 |
|---|------|------|------|
| 1 | 登录（alex 工作台） | ✅ | 1s |
| 2 | Customer 数据就绪（seed） | ✅ | 9 客户，0s |
| 3 | AI 风险分析（读工具） | ✅ | 调用 query_customers, analyze_customer_risk，9s |
| 4 | 写任务（确认门控） | ✅ | 出现 confirmation_request(create_followup_task) 非静默执行，7s |
| 5 | 确认后写执行 | ✅ | approve 后创建成功 resultId=?，7s |
| 6 | 审计（决策轨迹） | ✅ | trace 含 tool_call + 确认记录，0s |
| 7 | 撤销（软删） | ✅ | effect #4 撤销后任务 #13 不在列表，1s |
| 8 | 时间盒 | ✅ | 总耗时 18s（< 30min） |
