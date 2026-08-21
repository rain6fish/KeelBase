# KeelBase 合成陌生人挑战实测报告

> 日期：2026-08-21 ｜ 执行者：fresh-context AI（无本仓上下文，模拟外部开发者）
> 环境：干净 clone（临时目录）+ 后端 http://localhost:3000（DeepSeek deepseek-v4-flash）+ 演示账号 alex/123456
> 依据：`scripts/challenge/stranger-challenge.md`（30min Build + 60min Business）
> 目的：1.0 对抗性证明的「合成陌生人验证」正式证据——证明 onboarding 链路可通 + 记录卡点。

## 结论

- **30min Build：✅ 完成**（换名生成 articles 模块 + npm ci 编译 + 单测 5/5 通过）
- **60min Business：✅ 完成**（读 → 写工具 R3 → 确认 → 执行 → 审计 → 撤销全链路）
- **Would use KeelBase again：✅ Y** —— 一条命令真生成带权限/审计/AI 工具的模块，确实稀罕；但存在 3 处会卡住新手的 onboarding 缺陷（见下）。

## 卡点记录表

| 步骤 | 用时 | Where stuck | Why stuck | Missing abstraction |
|------|------|------------|-----------|--------------------|
| Build-1 找命令 | 2min | 无 | README「30 分钟生成一个模块」直接给出命令 | — |
| Build-2 生成 | 3min | README 示例命令跑不通 | ①README 写 `cd Server-NestJS` 但脚本在仓库根 `scripts/`；②`posts` 已是基座存量模块，原样执行报「目录已存在」 | 命令可执行目录未写准；示例模块名占用无提示 |
| Build-3 编译 | 5min | 首次 `npm run build` 报 `nest` 未找到 | node_modules 残缺，须先 `npm ci`（1min）后编译+单测通过 | 上手步骤未写明先装完整依赖 |
| Build-4 管理台 | 3min | 管理台看不到新模块 | 后端独立运行未含新模块（/api/v1/articles 404），按提示跳过 | 缺「需重启后端+迁移后管理台即出现」说明 |
| Build-5 AI 查询 | 3min | 问「有哪些帖子/供应商」AI 无此工具 | 存量 posts/suppliers 模块**未注册 AI 工具**（README 却承诺生成模块自带 query_posts）；换 contracts → query_contracts 工具卡正常 | README 承诺与实况不符 |
| Business 写任务 | 8min | 写任务难触发 + 中文乱码 | deepseek-v4-flash 多次偷懒只 navigate/反问；非流式写请求返回空（token 打满 4096）；curl 内联中文 GBK 乱码 | 模型稳定性不足；中文请求示例应给文件版 |

## Business 验收（全部通过）

读工具 `query_customers` → 写工具 `create_followup_task`（isWrite:true R3 徽标）→ SSE `confirmation_request`（token, 60s TTL）→ approve → 才执行（创建任务 id 10）→ 审计落 `tool_confirmation`（含 username=alex + P0-14 轨迹）→ 撤销软删。**超时未确认则不执行**（实测「操作超时未确认」）。

## 发现的真实问题

### P0：审计哈希链并发写分叉（严重，Trust 门禁）
`verify` 返回 `valid:false / brokenIndex:30` —— `#29`/`#30` 两条记录的 `prevHash` 都指向 `#28`（同一秒写入），即两个并发审计写读到同一 lastHash 后各自插入，链分叉。
**已修复（2026-08-21）**：AuditService 与 OperationAuditService 加**串行队列**，保证「读 lastHash → 计算 hash → 插入」原子化；并发单测验证无分叉（prevHash 全部连续）。

### P1：README 承诺与实况不符
README 承诺生成模块自动带 `query_posts`，但存量 posts/suppliers 模块未注册 AI 工具。需更新文档或补注册。

### P2：onboarding 文档细节
- README `cd Server-NestJS` 与脚本实际位置不符；
- 上手未写明先 `npm ci`；
- 存量模块名占用无提示（--force 已加，但提示可更友好）；
- 后端重启+迁移后管理台才出现新模块的说明缺失。

## 相关
- 挑战卡：`scripts/challenge/stranger-challenge.md`
- 对抗性证明三件套：越权矩阵（39 用例）+ 攻击测试集（12/12）+ 本报告
