# KeelBase Stranger Challenge Feedback (v1.0.5, clean checkout)

Role: external developer with zero prior KeelBase knowledge. Worked only from README / docs/manual / specs / generator output. All steps executed via HTTP API (no GUI browser). Backend started with `PORT=3210 QUEUE_ENABLED=false CACHE_ENABLED=false node dist/main`. Module used: **invoices** (`specs/invoices.json`) — `posts` already exists (collision warned in docs).

| 步骤 | 用时(min) | Where stuck（卡在哪一步） | Why stuck（为什么卡） | Missing abstraction（缺什么抽象/文档/命令） |
|------|-----------|--------------------------|----------------------|--------------------------------------------|
| Build-1 找命令 | 4 | 无真正卡点。README + `docs/manual/onboarding-30min.md` 直接指向 `node scripts/keelbase-init.mjs --spec specs/invoices.json` | — | 轻微混乱：挑战卡给 `--module posts --label ... --fields ...`，onboarding 手册用 `--spec specs/invoices.json`，两条路并存；且卡片建议的 `posts` 已存在于本仓（手册已警告撞名）。建议文档只保留 `--spec` 主路径 |
| Build-2 生成 | 1 | 无。输出 23 个文件 + 全部接线行（带 ✓），含 ai.module 注册行，非常清楚 | — | — |
| Build-3 编译 | 2 | 无。`npm install` ~1min，`npm run build` 0 error | — | — |
| Build-4 验证接线/UI | 2 | 部分。`npm test -- invoices` = 20 passed（4 suite，与文档一致）；`QueryInvoicesTool`/`CreateInvoiceTool` 已注册（grep ai.module）| 管理台「发票」页 GUI 点击验证无法无头完成 | 静态已证：generator 改写了 routes.ts / AdminLayout.vue / i18n zh+en。无头环境缺一条「curl 可验证接线」的替代验收命令 |
| Build-5 AI 查询 | 3 | 起后端卡 ~3min：`export NODE_ENV=development`（想跑 dev）后进程崩溃 `Config validation error: "JWT_SECRET" is required...` | ConfigModule 的 envFilePath = `.env.${NODE_ENV}`，设了 NODE_ENV=development 就去读不存在的 `.env.development`（仓库只有 `.env`）→ 所有密钥为空 → 校验失败。去掉 NODE_ENV 即恢复。文档从未提示 NODE_ENV 会切换 env 文件 | 缺一句「设 NODE_ENV 前先 `cp .env .env.<env>`」的文档；或 env 文件缺失时报更可读的错误 |
| Business 写任务 | 8 | ① 中文 body 经 Git Bash curl 变乱码，模型回「乱码请重发」，改用纯 ASCII/文件体（usage.md 有记录 UTF-8 文件技巧）。② 非流式 `/ai/chat` 返回的只是「请确认」自然语言，**无确认 token**；在对话里回「我确认」被模型丢失上下文。真实确认走 SSE `/ai/chat/stream`（发 `confirmation_request` 事件含 token 并挂起）+ 另开请求 `POST /ai/confirmations/<token> {"decision":"approve"}`。③ 首次执行写失败：`SqliteError: NOT NULL constraint failed: invoices.dueDate`——specs/invoices.json 里 customerName/status/dueDate 均非 required，但生成实体把它们做成 NOT NULL、DTO 做成必填（仅 int 字段 amount 被诚实设为 optional）。补 dueDate 重试 → 成功：invoice id1 = INV-TEST-004 落库。门控验证：行 createdAt == approve 时刻；未 approve 前 002/003 均未落库 | 非流式端点不暴露确认 token，纯 REST 用户无法完成写闭环，必须读 usage.md 才能发现流式流程；生成器对「非 required 字段」按类型区别对待（string→NOT NULL，int→nullable），与协议语义不一致，导致 AI/用户漏填非必填字段即 DB 报错 | ① 缺「非流式 /ai/chat 写工具如何返回 confirmationRequest(token)」或该流程的一页说明。② 生成器 bug：spec 可选字段 → 实体应 nullable / DTO 应 @IsOptional（至少 string 与 int 行为要一致） |
| 审计核验 | (并入上) | AI 审计完整：tool_call + tool_confirmation(approve) 两条目，actionLabel 形如 `AI · Tool call · create_invoice`，带 username 联表，`GET /audit/verify` valid:true（checked 12）。**注意**：`GET /audit/operations/verify` valid 但只含 2 条 LOGIN——AI 写操作落在 AI 审计 + tool-effects，**不在操作审计**，与「写操作入操作审计」文档表述不符。另发现 tool-effects 异常：唯一 effect 行 resultType="todo"、title=「准备私有化部署演示环境」（一条无关 demo todo），而非刚创建的 invoice——副作用快照抓错实体，撤销将指向错误记录 | 副作用捕获对生成模块写工具失焦 | effect 捕获对生成 create 工具需正确派生 target；文档写明 AI 写→AI 审计、REST 写→操作审计 |

**总用时**：~14 min 实际执行（14:24→14:38；HTTP 全驱动，无 GUI；含 1min npm install、3min 后端 env 排障）。

## 最终反馈
- 30min Build 完成? **Y**（生成→编译→20 测试→AI 工具注册全过，<15min）
- 60min Business 完成? **Y**（确认门控→approve→落库→AI 审计哈希链 valid，全过）
- Would use KeelBase again? **Y** — 生成器闭环极顺（一处命令出带权限+审计+AI 工具的完整模块），Business 门控/审计真实可验；但需先修两处真摩擦：NODE_ENV 切换 env 文件的静默陷阱、生成器对 spec 可选 string 字段的 NOT NULL 误伤。
