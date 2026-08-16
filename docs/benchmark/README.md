# 性能压测基准 / Performance Benchmark（3.4）

> 常规 API 吞吐 + AI 并发 + SSE 流式首字节，产出可对比的基线报告。
> 覆盖外部评估 P1-5「无压测报告，尤其 AI 并发场景」。

## 重跑方法

前置：后端已启动（`cd Server-NestJS && npm run build && node dist/main`），`.env` 配好 `AI_PROVIDER` + API key（AI 场景）。

```bash
# 真实吞吐（放宽全局限流到 10 万/min；AI 每日限额仍生效）
THROTTLE_LIMIT=100000 node dist/main &

# 跑基准（默认 8s × 8 并发）
node scripts/benchmark/run-benchmark.mjs
# 自定义：BENCH_SECONDS=20 BENCH_CONNECTIONS=50 BASE_URL=... node scripts/benchmark/run-benchmark.mjs
```

报告落 `docs/benchmark/benchmark-<时间戳>.md`；结果用 avg 延迟为准（高频短窗口下 p95 可能为 NaN）。

## 2026-08-16 基线（SQLite dev、8s × 8 并发）

| 场景 | req/s | avg | 说明 |
|------|-------|-----|------|
| GET /auth/me（认证） | 444 | 18ms | 真实吞吐（全局限流放宽） |
| GET /events（分页） | 366 | 21ms | 真实吞吐 + DB 查询 |
| POST /ai/chat（非流式） | 323 | 24ms | 受 AI 每日限额保护（超限 429） |
| GET /health | 689 | 11ms | 受 `/health` 独立 60/min 限流（超限 429） |
| POST /ai/chat/stream（SSE） | — | 首字节 27ms | 单次实测 |

## 解读与保护

- **全局限流**（默认 60/min）经 `THROTTLE_LIMIT`/`THROTTLE_TTL` 可配（app.module + env.config）；压测/大促可放宽。
- **`/health` 独立 `@Throttle(60)`**（CLAUDE.md §4.4）：压测 60 次后 429——限流保护预期内。
- **AI 每日限额**（RG-2.1 `ai_daily_usage`）：单用户超日配额即拒绝——AI 场景压测体现业务保护，非吞吐瓶颈。
- 生产建议：以 PostgreSQL + Redis 重新跑基准对比（SQLite 单连接对高并发是主要瓶颈）。
