# 30 分钟验收项目（30-Minute Acceptance）/ 旗舰应用驱动的开发闭环

> 目标（V2 P0-13 / development-plan 第 11-12 周）：一个陌生开发者从零创建一个业务模块，并让 Runtime Agent 能安全调用该模块。
> 验收基准：**30 分钟内完成带 权限(CASL) + AI Tool + Confirmation + Audit 的业务模块**。
> 依据协议：`docs/module-protocol.md`（协议 → `keelbase init --spec` → 普通源代码）。

> **两级指标（2026-08-19 采纳）**：
> - **30min Build**：本页验证的技术链路——协议 → 模块 → API → 权限 → 工具 → 确认 → 审计（证明「能造」）。
> - **60min Business**：真实业务闭环——模块 + 真实数据 → AI 查询 → AI 分析 → AI Action → Confirmation → Audit（证明「能落地业务」）。
> 前者是生成器闭环，后者是业务价值闭环；对外指标 = **30min to Build / 60min to Business Outcome**。
>
> **外部验证（V-6）**：让陌生开发者亲自计时实测 30min Build——用 [30min-build-verification.md](30min-build-verification.md) 计时记录表（步骤/实际耗时/判定门槛）。

## 0. 前置条件

- 已 clone KeelBase 并 `npm install`（`Server-NestJS`）+ `flutter pub get`（`Front-Flutter`）
- 后端可启动（`npm run start:dev` 或单容器）

## 1. 验收流程（带时间节点）

| 步骤 | 内容 | 预计耗时 | 验证命令 |
|---|---|---|---|
| 1. 写协议 | 用自然语言/DB schema 描述模块 → 写一份 `specs/<module>.json`（或 `--module/--fields` 直接命令行） | ~3 分钟 | — |
| 2. 生成 | `node scripts/keelbase-init.mjs --spec specs/<module>.json` | ~1 分钟 | 输出「生成业务模块」+ 8 处接线 ✓ |
| 3. 编译 | `cd Server-NestJS && npm run build` | ~1 分钟 | 0 error |
| 4. 迁移 | `npm run migration:generate -- src/migrations/Add<Module>` | ~1 分钟 | 生成迁移文件 |
| 5. 单测 | `npm test -- <plural>` | ~30 秒 | 20 tests passed（service 5 + controller 6 + query/create 工具 9） |
| 6. API | 起服务，`curl /api/v1/<plural>`（带 token） | ~2 分钟 | 200 + 本人数据 |
| 7. 前端 | `cd Front-Flutter && flutter analyze`（+ `flutter run` 看页） | ~2 分钟 | 0 error |
| 8. AI 工具 | 已自动生成 `query_<plural>`（读）+ `create_<singular>`（写需确认）并注册 | 0（自动） | `grep Query<Module>Tool src/ai/ai.module.ts` |
| 9. 确认 + 审计 | AI 对话触发 `create_<singular>` → 确认框 → 落库 → 审计哈希链 | ~5 分钟 | AI 聊天里输入「创建一条<label>」 |
| 10. 权限 | 越权访问他人数据 403 | ~1 分钟 | 另一账号 curl → 403 |

**合计：约 15-20 分钟**（含 AI 工具与确认链路验证），留 10 分钟缓冲。

## 2. 生成物清单（`keelbase init --spec` 一次生成）

| 层 | 文件 |
|---|---|
| 后端 | `entity / dto(create/update) / service / controller / module / service.spec / controller.spec` |
| AI 工具 | `ai/tools/query-<plural>.tool.ts`（读，按 userId 过滤）+ `create-<singular>.tool.ts`（写，`requiresConfirmation` + `requireVerifiedEmail`），各带 `.tool.spec.ts`，注册进 `ai.module.ts` |
| Flutter | `features/<plural>/` model / repository / provider / page + 接线（main/router/i18n/Explore） |
| Web-Admin | `views/<plural>/` 管理页 + 接线（routes/nav/i18n） |
| Taro | `pages/<plural>/` + 接线（app.config/explore） |
| 安全接线 | CASL 本人所有权 + 全局审计拦截器 + AI 导航（navigate-page.tool） |

## 3. 已验证的端到端例子

### 3.1 `specs/contract.json`（合同，含 enum status + AI 工具）
```bash
node scripts/keelbase-init.mjs --spec specs/contract.json
```
生成 `contracts` 模块：`query_contracts`（读）+ `create_contract`（写需确认）已注册；
`AddContracts` 迁移生成；`npm test -- contracts` 20 passed（service 5 + controller 6 + 工具 9）；sqlite 一致性 No changes。

### 3.2 `specs/supplier.json`（供应商，双 enum）— 协议反推验证产物
### 3.3 `specs/customer.json` / `project.json` / `approval-request.json` — 三旗舰反推协议示例

### 3.4 常用业务模块协议（2026-08-18 补充，直接 `--spec` 生成）

| 协议 | 说明 | 字段亮点 |
|---|---|---|
| `specs/events.json` | 日程事件 | colorRole enum（6 色） |
| `specs/todos.json` | 待办 | priority / status enum |
| `specs/books.json` | 图书 | status enum + rating int |
| `specs/notes.json` | 笔记 | category enum |

```bash
node scripts/keelbase-init.mjs --spec specs/books.json   # 生成 books 模块（含 AI 工具）
```

## 4. 验收判定

- ✅ **30 分钟内**完成 1-7 步（生成/迁移/API/前端/权限/测试）
- ✅ **AI Tool** 自动附带：`query_<plural>` + `create_<singular>`（写需确认）可在 AI 对话中触发
- ✅ **Confirmation**：写工具弹出确认框，用户确认后落库
- ✅ **Audit**：写操作入操作审计 + AI 调用入 AI 审计（哈希链可验证）
- ✅ 生成物是**普通源代码**，开发者可继续修改

## 5. 常见失败点与处理

| 现象 | 处理 |
|---|---|
| `目录已存在` | 模块名冲突，换个英文名或删旧模块 |
| `字段名非法` | 字段用 camelCase 或 snake_case（`a-zA-Z0-9_`），非保留词（id/userId/createdAt…） |
| `enum 字段需 2-10 个选项` | 协议 `enum` 数组给 2-10 个，小写英文/下划线 |
| 迁移一致性报 diff | 用 `migration:generate` 重新生成（禁止手写迁移） |
