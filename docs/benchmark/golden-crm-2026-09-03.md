# Gate 1：AI CRM Golden Application 一次跑通（2026-09-03T04-22-57-001Z）

- provider=`openai` model=`glm-5.1` ｜ 8/8 通过 ｜ 总耗时 2s

| # | 断言 | 结果 | 详情 |
|---|------|------|------|
| 1 | 登录（alex 工作台） | ✅ | 1s |
| 2 | Customer 数据就绪（seed） | ✅ | 11 客户，0s |
| 3 | AI 风险分析（读工具） | ✅ | 调用 query_customers，0s |
| 4 | 写任务（确认门控） | ✅ | 出现 confirmation_request(create_followup_task) 非静默执行，0s |
| 5 | 确认后写执行 | ✅ | approve 后创建成功 resultId=?，0s |
| 6 | 审计（决策轨迹） | ✅ | trace 含 tool_call + 确认记录，0s |
| 7 | 撤销（软删） | ✅ | effect #1 撤销后任务 #10 不在列表，0s |
| 8 | 时间盒 | ✅ | 总耗时 2s（< 30min） |
