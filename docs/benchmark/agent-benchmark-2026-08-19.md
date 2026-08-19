# KeelBase Agent Benchmark（W2）· Trust

> 2026-08-19。确定性 Trust 部分（无需 LLM，可 CI）。LLM Run/Safety 部分见 `agent-benchmark.mjs` 报告。

## Trust Score：100% (6/FAIL)

| 检查 | 结果 |
|---|---|
| 三旗舰 e2e（越权 403 / 写确认 / 审计哈希链） | 6/3（上方明细） |
| 高风险写工具 requiresConfirmation 元数据 | CRM/PM/Approval 逐个断言 |

- Unauthorized：跨用户读/写 → 403（CASL 行级）
- High-risk：写工具 requiresConfirmation=true → 人工确认后才执行
- Audit：审计哈希链（HS-11）可验证 + 写副作用可撤销
