# 开发者 30 分钟挑战（Dev Challenge / Phase 3 验收包）

> 面向外部开发者的可复现挑战：**30 分钟内用 KeelBase 做出一个「AI 能安全操作」的业务模块**。
> 这是 KeelBase 的验收标准（60s 看懂 / 10min 运行 / 30min 创造）在外部开发者身上的验证——不是演示，是「你真的能做出来」。
> 内部执行版见 [30min-acceptance.md](30min-acceptance.md)。

---

## 挑战目标

> 用 `keelbase init` 从零生成一个业务模块（如「供应商管理」），并让 **Runtime Agent（AI 对话）能安全调用它**——读写你的数据、写操作需你确认、每一步可审计。

## 准备（约 10 分钟）

```bash
# 方式 A：单容器（只装 Docker，最快）
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
# 访问 http://localhost:3000（工作台）、/admin（管理台）；演示账号 alex/123456

# 方式 B：本地开发（改代码需要）
git clone <repo> && cd KeelBase && cd Server-NestJS && npm install
```

## 挑战（30 分钟，时间盒）

| 时间 | 任务 | 验证点 |
|---|---|---|
| 0-5min | 写协议：`specs/supplier.json`（name/status 枚举/riskLevel 枚举）或一句话描述 | 协议文件就绪 |
| 5-8min | 生成：`node scripts/keelbase-init.mjs --spec specs/supplier.json` | 输出「生成业务模块」+ 多端接线 ✓ |
| 8-12min | 编译 + 迁移：`cd Server-NestJS && npm run build && npm run migration:generate -- src/migrations/AddSupplier` | 0 error + 迁移生成 |
| 12-15min | API 验证：起后端，`curl /api/v1/suppliers`（带 token）| 200 + 本人数据 |
| 15-20min | **AI 工具**：AI 对话里输入「查一下我的供应商」→ 观察 `query_suppliers` 读工具卡（蓝色「读」徽标）| Runtime Agent 调用生成模块 |
| 20-25min | **写操作确认**：AI 对话输入「创建一条供应商」→ 写工具卡（橙色「写」）+ 确认框 → 确认 → 落库 → 「已确认 · 可撤销」| 写操作人工确认 |
| 25-30min | **审计 + 越权**：管理台「AI 审计」查这次调用（哈希链可验证）；另一账号访问 → 403 | 全链路审计 + 越权拒绝 |

**完成标准**：生成模块带权限 + AI 工具 + 确认 + 审计，AI 能安全调用你的模块。

## 可复用资源

| 资源 | 说明 |
|---|---|
| 三旗舰模板（管理台一键导入）| `crm-demo`（客户/风险）/ `pm-demo`（项目/延期）/ `approval-demo`（审批/政策）|
| 业务 Skill | `crm-customer-risk` / `pm-deadline-risk` / `approval-policy-review`（AI 业务规则）|
| 协议示例 | `specs/customer.json` / `project.json` / `approval-request.json` / `supplier.json` |
| 插件 CLI | `node scripts/keelbase-plugin.mjs add <plugin.ts>` 注册扩展 |

## 反馈表（提交挑战结果时填写）

| 字段 | 填写 |
|---|---|
| 卡住的位置（Where stuck）| 哪一步超过预计时间？|
| 为什么卡住（Why stuck）| 文档缺失 / API 不直观 / 工具不好用 / 环境问题？|
| 缺哪个抽象（Missing abstraction）| 你希望 KeelBase 提供但还没有的东西？|
| 完成时间 | 实际耗时 + 是否达到 30 分钟标准 |
| 一句话评价 | 最爽 / 最痛的一点 |

## 相关

- [30min-acceptance.md](30min-acceptance.md) — 内部执行版（10 步 + 验证命令）
- [quickstart.md](quickstart.md) — 快速上手
- [ecosystem-pack.md](ecosystem-pack.md) — 生态包组装（模板/Skill/插件/生成器）
