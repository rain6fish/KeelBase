# AGENTS.md — AI 开发规则（EASY-6 分层）

> 本文件是**给 AI 代理（Claude Code 等）的分层规则入口**。目标：让 AI 按基座约定直接干活，不用通读完整文档。
> 详版规则见 [CLAUDE.md](CLAUDE.md)；本文件只保留 AI 高频触发的「怎么加功能/加模块」。

## 1. 项目定位（AI 必知）

KeelBase = **业务安全的 AI Agent harness + 全栈应用基座**（Flutter + NestJS + Taro + Vue 管理台）。

**双 AI 叙事**：
- **开发期 AI**：`npx keelbase init` 或 AI 按本文件约定**生成业务模块**
- **运行时 AI**：内置 Agent（工具调用 + CASL 行级权限 + 写操作人工确认 + 全链路审计）——这是差异化核心

**安全红线**（任何改动不得破坏）：
- CASL 行级权限（`src/common/casl/`）：用户只能访问本人数据
- 写操作人工确认（AI 创建 event/todo 需 confirmation）
- 全链路审计（操作审计 + AI 审计）
- 敏感字段掩码（管理端不返回明文 email/phone）

## 2. 分层说明

| 目录 | 规则来源 |
|------|---------|
| 根 `/` | 本 AGENTS.md（全局约定） |
| 各业务模块 `src/features/*` 或 `src/*/` | 模块内如有 `AGENTS.md` 则继承并局部覆盖；否则遵循本文件 |

## 3. 新增业务模块 —— AI 必做清单

> 对齐 `keelbase init` 生成器的 7 处接线。**手工加模块（或 AI 加模块）必须全部完成**，缺一处就是坏的模块。

### 后端（Server-Nodejs）
- [ ] 建模块目录 `src/<name>/`：entity + dto + service + controller + module + spec
- [ ] **app.module.ts**：import 模块 + 加入 `imports: []`
- [ ] **modules-manifest.ts**：`BUSINESS_MODULES` 数组 + `businessEntries` 加新模块
- [ ] **feature-flags.constants.ts**（可选）：如做开关，加 `FEATURE_<NAME>_ENABLED`
- [ ] **生成迁移**：`npm run migration:generate -- src/migrations/Add<Name>`（TypeORM 索引是 hash 名，禁止手写迁移）
- [ ] **补测试**：service.spec（关键业务规则）+ 涉及安全路径加 e2e

### 前端（Front-Flutter）
- [ ] 建 `lib/features/<name>/`：model + repository + provider + page
- [ ] **main.dart**：注册 Repository + Provider
- [ ] **app_router.dart**：注册路由
- [ ] **app_localizations.dart**：补 i18n（中英双语，所有用户可见文本必须走 i18n）

### AI 集成（必须）
- [ ] **navigate-page.tool.ts**：`PAGE_ROUTES` 加新页面（AI 导航可用）
- [ ] 新模块的 CRUD 是否暴露给 AI 工具：如需 AI 操作该模块数据，注册对应 AiTool

### 验收
- [ ] `npm run build`（后端）+ `flutter analyze` 0 error
- [ ] 后端单测 / 前端测试通过
- [ ] 迁移一致性：`migration:generate` 输出 "No changes"

## 4. 预置 Skills（EASY-6 ④）

项目 `.claude/skills/` 提供可调用的 AI 技能（Claude Code 可用 `/skill` 或直接描述触发）：

| Skill | 何时用 |
|-------|--------|
| `generate-module` | 新增业务模块（调 `keelbase init` CLI 或按第 3 节手工） |
| `add-api` | 给现有模块加 API 端点（含 CASL/审计/Swagger/测试） |
| `write-migration` | 新实体或改列后生成/校验迁移（禁止手写，见 EASY-2.2） |

## 5. AI 生成 vs 手工

- **标准 CRUD 模块**：用 `npx keelbase init`（零依赖确定性模板 + 自动接线）；可从协议 JSON 读规格：`--spec module.json`（见 [docs/module-protocol.md](docs/module-protocol.md)）
- **复杂/非 CRUD**：AI 按第 3 节清单手工实现，遵循基座约定
- **业务模块协议**（EASY-7）：协议只覆盖高频 20% 字段（string/text/int/bool/date），复杂字段/业务走手写；见 [docs/module-protocol.md](docs/module-protocol.md)
- 生成的代码必须「AI 可继续扩展」：结构符合约定 + 测试骨架 + 模块清单登记
